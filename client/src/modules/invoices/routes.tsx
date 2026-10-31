import { lazy, Suspense } from "react";
import { Loading } from "../../components/ui/kit";
import type { ModuleRoute } from "../../lib/routes";
const InvoiceDetailPage = lazy(() => import("./pages/InvoiceDetailPage"));
const InvoicePrintPage = lazy(() => import("./pages/InvoicePrintPage"));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage"));
export const routes: ModuleRoute[] = [
  {
    path: "invoices",
    element: (
      <Suspense fallback={<Loading />}>
        <InvoicesPage />
      </Suspense>
    ),
    roles: ["ADMIN", "STAFF"],
  },
  {
    path: "invoices/:id",
    element: (
      <Suspense fallback={<Loading />}>
        <InvoiceDetailPage />
      </Suspense>
    ),
    roles: ["ADMIN", "STAFF"],
  },
  {
    path: "invoices/:id/print",
    element: (
      <Suspense fallback={<Loading />}>
        <InvoicePrintPage />
      </Suspense>
    ),
    roles: ["ADMIN", "STAFF"],
  },
];
