import { lazy, Suspense } from "react";
import { Loading } from "../../components/ui/kit";
import type { ModuleRoute } from "../../lib/routes";
const IndexPage = lazy(() => import("./pages/IndexPage"));
export const routes: ModuleRoute[] = [
  {
    path: "taxes",
    element: (
      <Suspense fallback={<Loading />}>
        <IndexPage />
      </Suspense>
    ),
    roles: ["ADMIN"],
  },
];
