import { resource } from "../../lib/catalog-client";
import type { Product, ProductInput } from "../../types/api";
export const productsApi = resource<Product, ProductInput>("/products");
