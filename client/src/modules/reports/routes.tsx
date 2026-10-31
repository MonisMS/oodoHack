import { lazy, Suspense } from "react";
import type { ModuleRoute } from "../../lib/routes";
import { Loading } from "../../components/ui/kit";
const Dashboard = lazy(() => import("./pages/IndexPage"));
export const routes: ModuleRoute[] = [
  {
    path: "dashboard",
    element: (
      <Suspense fallback={<Loading />}>
        <Dashboard />
      </Suspense>
    ),
    roles: ["ADMIN", "STAFF"],
  },
];
