const SHOPIFY_ADMIN_URL = "https://4d9429-1e.myshopify.com/admin/api/2025-07/graphql.json";

/**
 * Orders are the source of truth for "has this email ever ordered?".
 * We deliberately do NOT filter on financial status, so refunded, voided,
 * partially refunded and cancelled orders all still count as a match.
 */
const ORDERS_QUERY = `
  query FindOrders($query: String!) {
    orders(first: 10, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          customer { firstName }
        }
      }
    }
  }
`;

const CUSTOMER_QUERY = `
  query FindCustomer($query: String!) {
    customers(first: 1, query: $query) {
      edges {
        node {
          id
          firstName
          numberOfOrders
        }
      }
    }
  }
`;

export type CustomerLookup = {
  /** true when the email matches a Shopify customer with at least one order */
  matched: boolean;
  firstName: string | null;
  orderCount: number;
  /** true when the store hasn't granted customer-data access to the app */
  unavailable: boolean;
};

type GraphQLPayload<T> = {
  errors?: Array<{ extensions?: { code?: string } }>;
  data?: T;
};

async function adminRequest<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ payload: GraphQLPayload<T> | null; denied: boolean }> {
  const response = await fetch(SHOPIFY_ADMIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) return { payload: null, denied: true };

  const payload = (await response.json()) as GraphQLPayload<T>;
  const denied = Boolean(
    payload.errors?.some((e) => e.extensions?.code === "ACCESS_DENIED"),
  );
  if (payload.errors?.length) return { payload: null, denied };
  return { payload, denied: false };
}

export async function lookupShopifyCustomer(email: string): Promise<CustomerLookup> {
  const token = process.env["SHOPIFY_ACCESS_TOKEN"];
  const empty: CustomerLookup = { matched: false, firstName: null, orderCount: 0, unavailable: false };
  if (!token) return { ...empty, unavailable: true };

  const normalized = email.trim().toLowerCase();

  // 1) Any order ever placed with this email — refunded or cancelled included.
  const orders = await adminRequest<{
    orders?: { edges: Array<{ node: { customer?: { firstName: string | null } | null } }> };
  }>(token, ORDERS_QUERY, { query: `email:${normalized}` });

  if (orders.payload) {
    const edges = orders.payload.data?.orders?.edges ?? [];
    if (edges.length > 0) {
      const firstName = edges.find((e) => e.node.customer?.firstName)?.node.customer?.firstName ?? null;
      return { matched: true, firstName, orderCount: edges.length, unavailable: false };
    }
  }

  // 2) Fall back to the customer record (covers stores where order search is limited).
  const customers = await adminRequest<{
    customers?: { edges: Array<{ node: { firstName: string | null; numberOfOrders: string | number } }> };
  }>(token, CUSTOMER_QUERY, { query: `email:${normalized}` });

  if (customers.payload) {
    const node = customers.payload.data?.customers?.edges?.[0]?.node;
    if (node) {
      const orderCount = Number(node.numberOfOrders ?? 0);
      // A customer record created by a since-refunded order still counts.
      return { matched: true, firstName: node.firstName ?? null, orderCount, unavailable: false };
    }
    return empty;
  }

  // Both reads were blocked by Shopify — we genuinely cannot tell.
  if (orders.denied && customers.denied) return { ...empty, unavailable: true };
  return empty;
}
