import { createServerFn } from "@tanstack/react-start";
import { requireNeonAuthSession } from "@/lib/auth/neon-auth.server";
import {
  createProduct as createProductInNeon,
  deactivateProduct,
  listProducts,
  updateProduct as updateProductInNeon,
} from "@/server/repositories/products";
import type { Product } from "@/lib/types";

export const getProducts = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data ?? {}) as { activeOnly?: boolean })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return listProducts(data);
  });

export const createProduct = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as Pick<Product, "name" | "billing_type"> &
        Partial<Pick<Product, "description" | "category" | "default_term_months">>,
  )
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return createProductInNeon(data);
  });

export const updateProduct = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; updates: Partial<Product> })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return updateProductInNeon(data.id, data.updates);
  });

export const deactivateProductFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    await requireNeonAuthSession();
    return deactivateProduct(data.id);
  });
