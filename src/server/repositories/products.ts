import { buildUpdate } from "@/server/db/query-builders";
import { query, queryOne } from "@/server/db/neon.server";
import type { Product } from "@/lib/types";

type CreateProductInput = Pick<Product, "name" | "billing_type"> &
  Partial<Pick<Product, "description" | "category" | "default_term_months">>;

const productUpdateColumns: Array<keyof Partial<Product> & string> = [
  "name",
  "description",
  "category",
  "billing_type",
  "default_term_months",
  "active",
];

export async function listProducts(input: { activeOnly?: boolean } = {}) {
  return query<Product>(
    `
      select *
      from products
      ${input.activeOnly ? "where active = true" : ""}
      order by name
    `,
  );
}

export async function getProduct(id: string) {
  const product = await queryOne<Product>("select * from products where id = $1", [id]);
  if (!product) throw new Error("Product not found");
  return product;
}

export async function createProduct(input: CreateProductInput) {
  const product = await queryOne<Product>(
    `
      insert into products (name, description, category, billing_type, default_term_months)
      values ($1, $2, $3, $4, $5)
      returning *
    `,
    [
      input.name,
      input.description ?? null,
      input.category ?? null,
      input.billing_type,
      input.default_term_months ?? null,
    ],
  );

  if (!product) throw new Error("Failed to create product");
  return product;
}

export async function updateProduct(id: string, updates: Partial<Product>) {
  const update = buildUpdate(updates, productUpdateColumns, 1);
  const product = await queryOne<Product>(
    `
      update products
      set ${update.sql}
      where id = $${update.nextIndex}
      returning *
    `,
    [...update.values, id],
  );

  if (!product) throw new Error("Product not found");
  return product;
}

export async function deactivateProduct(id: string) {
  return updateProduct(id, { active: false });
}
