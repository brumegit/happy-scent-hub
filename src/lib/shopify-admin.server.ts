const SHOPIFY_ADMIN_URL = "https://4d9429-1e.myshopify.com/admin/api/2025-07/graphql.json";

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

export async function lookupShopifyCustomer(email: string): Promise<CustomerLookup> {
  const token = process.env["SHOPIFY_ACCESS_TOKEN"];
  const empty: CustomerLookup = { matched: false, firstName: null, orderCount: 0, unavailable: false };
  if (!token) return { ...empty, unavailable: true };

  const response = await fetch(SHOPIFY_ADMIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({
      query: CUSTOMER_QUERY,
      variables: { query: `email:${email.trim().toLowerCase()}` },
    }),
  });

  if (!response.ok) return { ...empty, unavailable: true };

  const payload = (await response.json()) as {
    errors?: Array<{ extensions?: { code?: string } }>;
    data?: {
      customers?: {
        edges: Array<{ node: { firstName: string | null; numberOfOrders: string | number } }>;
      };
    };
  };

  if (payload.errors?.length) {
    const denied = payload.errors.some((e) => e.extensions?.code === "ACCESS_DENIED");
    return { ...empty, unavailable: denied };
  }

  const node = payload.data?.customers?.edges?.[0]?.node;
  if (!node) return empty;

  const orderCount = Number(node.numberOfOrders ?? 0);
  return {
    matched: orderCount > 0,
    firstName: node.firstName ?? null,
    orderCount,
    unavailable: false,
  };
}
