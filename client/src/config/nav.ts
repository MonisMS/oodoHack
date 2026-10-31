import type { Role } from "../types/api";
export interface NavItem {
  label: string;
  to: string;
  roles: Role[];
}
export const nav: NavItem[] = [
  { label: "Overview", to: "/portal", roles: ["CUSTOMER"] },
  { label: "Dashboard", to: "/dashboard", roles: ["ADMIN", "STAFF"] },
  { label: "Subscriptions", to: "/subscriptions", roles: ["ADMIN", "STAFF"] },
  {
    label: "Quotation templates",
    to: "/quotation-templates",
    roles: ["ADMIN", "STAFF"],
  },
  { label: "Invoices", to: "/invoices", roles: ["ADMIN", "STAFF"] },
  { label: "Run billing", to: "/billing", roles: ["ADMIN", "STAFF"] },
  { label: "Payments", to: "/payments", roles: ["ADMIN", "STAFF"] },
  { label: "Products", to: "/products", roles: ["ADMIN", "STAFF"] },
  { label: "Plans", to: "/plans", roles: ["ADMIN", "STAFF"] },
  { label: "Customers", to: "/users/customers", roles: ["ADMIN", "STAFF"] },
  { label: "Taxes", to: "/taxes", roles: ["ADMIN"] },
  { label: "Discounts", to: "/discounts", roles: ["ADMIN"] },
  { label: "Staff", to: "/users/staff", roles: ["ADMIN"] },
  {
    label: "My subscriptions",
    to: "/portal/subscriptions",
    roles: ["CUSTOMER"],
  },
  { label: "My invoices", to: "/portal/invoices", roles: ["CUSTOMER"] },
];
