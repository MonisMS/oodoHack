import type { ModuleRoute } from "../../lib/routes";
import { lazy, Suspense } from "react";
import { Loading } from "../../components/ui/kit";
const IndexPage = lazy(() => import("./pages/IndexPage"));
export const routes: ModuleRoute[] = [
  {
    path: "users/customers",
    element: (
      <Suspense fallback={<Loading />}>
        <IndexPage title="Customers" />
      </Suspense>
    ),
    roles: ["ADMIN", "STAFF"],
  },
  {
    path: "users/staff",
    element: (
      <Suspense fallback={<Loading />}>
        <IndexPage title="Staff" />
      </Suspense>
    ),
    roles: ["ADMIN"],
  },
];
