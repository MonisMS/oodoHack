import type { ModuleRoute } from "../../lib/routes";
import { lazy, Suspense } from "react";
import { Loading } from "../../components/ui/kit";
const IndexPage = lazy(() => import("./pages/IndexPage"));
export const routes: ModuleRoute[] = [
  {
    path: "login",
    element: (
      <Suspense fallback={<Loading />}>
        <IndexPage title="Sign in" />
      </Suspense>
    ),
  },
  {
    path: "signup",
    element: (
      <Suspense fallback={<Loading />}>
        <IndexPage title="Create an account" />
      </Suspense>
    ),
  },
  {
    path: "forgot-password",
    element: (
      <Suspense fallback={<Loading />}>
        <IndexPage title="Reset your password" />
      </Suspense>
    ),
  },
  {
    path: "reset-password",
    element: (
      <Suspense fallback={<Loading />}>
        <IndexPage title="Choose a new password" />
      </Suspense>
    ),
  },
];
