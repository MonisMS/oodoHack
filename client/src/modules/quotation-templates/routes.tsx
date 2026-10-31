import { lazy, Suspense } from "react";
import { Loading } from "../../components/ui/kit";
import type { ModuleRoute } from "../../lib/routes";
const TemplateDetailPage = lazy(() => import("./pages/TemplateDetailPage"));
const TemplateFormPage = lazy(() => import("./pages/TemplateFormPage"));
const TemplateListPage = lazy(() => import("./pages/TemplateListPage"));
const roles: ModuleRoute["roles"] = ["ADMIN", "STAFF"];
export const routes: ModuleRoute[] = [
  {
    path: "quotation-templates",
    element: (
      <Suspense fallback={<Loading />}>
        <TemplateListPage />
      </Suspense>
    ),
    roles,
  },
  {
    path: "quotation-templates/new",
    element: (
      <Suspense fallback={<Loading />}>
        <TemplateFormPage />
      </Suspense>
    ),
    roles,
  },
  {
    path: "quotation-templates/:id",
    element: (
      <Suspense fallback={<Loading />}>
        <TemplateDetailPage />
      </Suspense>
    ),
    roles,
  },
  {
    path: "quotation-templates/:id/edit",
    element: (
      <Suspense fallback={<Loading />}>
        <TemplateFormPage />
      </Suspense>
    ),
    roles,
  },
];
