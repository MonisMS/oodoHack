import { resource } from "../../lib/catalog-client";
import type { Plan, PlanInput } from "../../types/api";
export const plansApi = resource<Plan, PlanInput>("/plans");
