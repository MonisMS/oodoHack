import { resource } from "../../lib/catalog-client";
import type { Discount, DiscountInput } from "../../types/api";
export const discountsApi = resource<Discount, DiscountInput>("/discounts");
