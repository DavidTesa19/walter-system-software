import type { AppView, GridView } from "../types/appView";

export type SectionViewKind = "subjects" | "commissions";

const GROWTH_ROUTES: Record<SectionViewKind, Record<GridView, AppView>> = {
  subjects: {
    active: "growth_subjects_active",
    pending: "growth_subjects_pending",
    archived: "growth_subjects_archived",
  },
  commissions: {
    active: "growth_active",
    pending: "growth_pending",
    archived: "growth_archived",
  },
};

const GENERAL_ROUTES: Record<SectionViewKind, Record<GridView, AppView>> = {
  subjects: {
    active: "entities_active",
    pending: "entities_pending",
    archived: "entities_archived",
  },
  commissions: {
    active: "active",
    pending: "pending",
    archived: "archived",
  },
};

export const getGrowthViewFor = (kind: SectionViewKind, gridView: GridView): AppView =>
  GROWTH_ROUTES[kind][gridView];

export const getGeneralViewFor = (kind: SectionViewKind, gridView: GridView): AppView =>
  GENERAL_ROUTES[kind][gridView];
