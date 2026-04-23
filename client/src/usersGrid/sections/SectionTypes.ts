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
}
