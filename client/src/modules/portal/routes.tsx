import { lazy, Suspense } from "react";
import { Loading } from "../../components/ui/kit";
import type { ModuleRoute } from "../../lib/routes";
const HomePage = lazy(() => import("./pages/HomePage"));
const SubscriptionsPage = lazy(() => import("./pages/SubscriptionsPage"));
const SubscriptionDetailPage = lazy(
  () => import("./pages/SubscriptionDetailPage"),
);
const InvoicesPage = lazy(() => import("./pages/InvoicesPage"));
const InvoiceDetailPage = lazy(() => import("./pages/InvoiceDetailPage"));
const InvoicePrintPage = lazy(() => import("./pages/InvoicePrintPage"));
export const routes: ModuleRoute[] = [
  {
    path: "portal",
    element: (
      <Suspense fallback={<Loading />}>
        <HomePage />
      </Suspense>
    ),
    roles: ["CUSTOMER"],
  },
  {
    path: "portal/subscriptions",
    element: (
      <Suspense fallback={<Loading />}>
        <SubscriptionsPage />
      </Suspense>
    ),
    roles: ["CUSTOMER"],
  },
  {
    path: "portal/subscriptions/:id",
    element: (
      <Suspense fallback={<Loading />}>
        <SubscriptionDetailPage />
      </Suspense>
    ),
    roles: ["CUSTOMER"],
  },
  {
    path: "portal/invoices",
    element: (
      <Suspense fallback={<Loading />}>
        <InvoicesPage />
      </Suspense>
    ),
    roles: ["CUSTOMER"],
  },
  {
    path: "portal/invoices/:id",
    element: (
      <Suspense fallback={<Loading />}>
        <InvoiceDetailPage />
      </Suspense>
    ),
    roles: ["CUSTOMER"],
  },
  {
    path: "portal/invoices/:id/print",
    element: (
      <Suspense fallback={<Loading />}>
        <InvoicePrintPage />
      </Suspense>
    ),
    roles: ["CUSTOMER"],
  },
];
