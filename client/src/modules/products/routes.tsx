import type { ModuleRoute } from "../../lib/routes";
import { lazy, Suspense } from "react";
import { Loading } from "../../components/ui/kit";
const IndexPage = lazy(() => import("./pages/IndexPage"));
export const routes: ModuleRoute[] = [
  {
    path: "products",
    element: (
      <Suspense fallback={<Loading />}>
        <IndexPage />
      </Suspense>
    ),
    roles: ["ADMIN", "STAFF"],
  },
  {
    path: "products/new",
    element: (
      <Suspense fallback={<Loading />}>
        <IndexPage />
      </Suspense>
    ),
    roles: ["ADMIN"],
  },
  {
    path: "products/:id",
    element: (
      <Suspense fallback={<Loading />}>
        <IndexPage />
      </Suspense>
    ),
    roles: ["ADMIN", "STAFF"],
  },
];
