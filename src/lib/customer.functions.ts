import { createServerFn } from "@tanstack/react-start";

export const lookupCustomerByEmail = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => {
    const email = String(input?.email ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
    return { email };
  })
  .handler(async ({ data }) => {
    const { lookupShopifyCustomer } = await import("./shopify-admin.server");
    return lookupShopifyCustomer(data.email);
  });
