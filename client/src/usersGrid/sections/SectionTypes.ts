import type { GridView } from "../../types/appView";

export type AddHandler = () => Promise<void>;

export interface SectionProps {
  viewMode: GridView;
  isActive: boolean;
  onRegisterAddHandler: (handler: AddHandler) => void;
  onLoadingChange: (isLoading: boolean) => void;
  systemNamespace?: string;
  sectionKind?: "subjects" | "commissions";
  focusRecordId?: number | null;
  focusRequestKey?: string | null;
  /** Open the focused row's profile panel once the grid has scrolled to it. */
  focusOpenProfile?: boolean;
  /**
   * Select this commission in the panel that `focusOpenProfile` opens. Set when
   * the jump came from another of the subject's roles, where landing on the
   * right zakázka is the point of the jump rather than on the row's default.
   */
  focusOpenCommissionId?: number | null;
  readOnly?: boolean;
}
