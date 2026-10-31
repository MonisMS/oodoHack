import { lazy, Suspense } from "react";
import { Loading } from "../../components/ui/kit";
import type { ModuleRoute } from "../../lib/routes";
const PaymentsPage = lazy(() => import("./pages/PaymentsPage"));
export const routes: ModuleRoute[] = [
  {
    path: "payments",
    element: (
      <Suspense fallback={<Loading />}>
        <PaymentsPage />
      </Suspense>
    ),
    roles: ["ADMIN", "STAFF"],
  },
];
