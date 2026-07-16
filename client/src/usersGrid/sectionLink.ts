import { apiGet, apiPost } from "../utils/api";

export type LinkableNamespace = "public" | "growth" | "projects";
export type LinkableEntityType = "client" | "partner" | "tiper";
export type LinkableKind = "entity" | "commission";

const LINKABLE_NAMESPACES: LinkableNamespace[] = ["public", "growth", "projects"];

/**
 * Maps a section component's `systemNamespace` prop to the section-linking
 * namespace concept. Veřejné (undefined/base), Growth Club and Neveřejné can
 * all be linked together, in any combination.
 */
export const getLinkableNamespace = (systemNamespace?: string): LinkableNamespace | null => {
  if (systemNamespace === "growth") return "growth";
  if (systemNamespace === "projects") return "projects";
  if (!systemNamespace) return "public";
  return null;
};

export const otherLinkableNamespaces = (namespace: LinkableNamespace): LinkableNamespace[] =>
  LINKABLE_NAMESPACES.filter((ns) => ns !== namespace);

export const linkableNamespaceLabel = (namespace: LinkableNamespace): string => {
  if (namespace === "growth") return "Growth Club";
  if (namespace === "projects") return "Neveřejné";
  return "Veřejné";
};

export interface SectionLinkCounterpart {
  id: number;
}

export interface SectionLinkAttachResult {
  linkId: string;
  counterpart: SectionLinkCounterpart;
}

export interface SectionLinkStatus {
  linkId: string | null;
  linkedNamespaces: LinkableNamespace[];
}

export const attachSectionLink = (
  kind: LinkableKind,
  type: LinkableEntityType,
  namespace: LinkableNamespace,
  id: number,
  targetNamespace: LinkableNamespace
): Promise<SectionLinkAttachResult> =>
  apiPost<SectionLinkAttachResult>("/api/section-link/attach", { kind, type, namespace, id, targetNamespace });

export const detachSectionLink = (
  kind: LinkableKind,
  type: LinkableEntityType,
  namespace: LinkableNamespace,
  id: number,
  targetNamespace: LinkableNamespace
): Promise<{ ok: true }> =>
  apiPost<{ ok: true }>("/api/section-link/detach", { kind, type, namespace, id, targetNamespace });

export const getSectionLinkStatus = (
  kind: LinkableKind,
  type: LinkableEntityType,
  namespace: LinkableNamespace,
  id: number
): Promise<SectionLinkStatus> =>
  apiGet<SectionLinkStatus>(
    `/api/section-link/status?kind=${kind}&type=${type}&namespace=${namespace}&id=${id}`
  );
