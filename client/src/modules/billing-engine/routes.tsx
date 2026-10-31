import { lazy, Suspense } from "react";
import { Loading } from "../../components/ui/kit";
import type { ModuleRoute } from "../../lib/routes";
const BillingPage = lazy(() => import("./pages/BillingPage"));
export const routes: ModuleRoute[] = [
  {
    path: "billing",
    element: (
      <Suspense fallback={<Loading />}>
        <BillingPage />
      </Suspense>
    ),
    roles: ["ADMIN", "STAFF"],
  },
];
