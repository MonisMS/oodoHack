import { lazy, Suspense } from "react";
import { Loading } from "../../components/ui/kit";
import type { ModuleRoute } from "../../lib/routes";
const SubscriptionDetailPage = lazy(
  () => import("./pages/SubscriptionDetailPage"),
);
const SubscriptionFormPage = lazy(() => import("./pages/SubscriptionFormPage"));
const SubscriptionListPage = lazy(() => import("./pages/SubscriptionListPage"));
const roles: ModuleRoute["roles"] = ["ADMIN", "STAFF"];
export const routes: ModuleRoute[] = [
  {
    path: "subscriptions",
    element: (
      <Suspense fallback={<Loading />}>
        <SubscriptionListPage />
      </Suspense>
    ),
    roles,
  },
  {
    path: "subscriptions/new",
    element: (
      <Suspense fallback={<Loading />}>
        <SubscriptionFormPage />
      </Suspense>
    ),
    roles,
  },
  {
    path: "subscriptions/:id",
    element: (
      <Suspense fallback={<Loading />}>
        <SubscriptionDetailPage />
      </Suspense>
    ),
    roles,
  },
  {
    path: "subscriptions/:id/edit",
    element: (
      <Suspense fallback={<Loading />}>
        <SubscriptionFormPage />
      </Suspense>
    ),
    roles,
  },
];
