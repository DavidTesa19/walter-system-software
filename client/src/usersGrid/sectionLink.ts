import { apiPost } from "../utils/api";

export type LinkableNamespace = "public" | "growth";
export type LinkableEntityType = "client" | "partner" | "tiper";
export type LinkableKind = "entity" | "commission";

/**
 * Maps a section component's `systemNamespace` prop to the section-linking
 * namespace concept. Only Veřejné (undefined/base) and Growth Club can be
 * linked together — Neveřejné (projects) is not linkable.
 */
export const getLinkableNamespace = (systemNamespace?: string): LinkableNamespace | null => {
  if (systemNamespace === "growth") return "growth";
  if (!systemNamespace) return "public";
  return null;
};

export const otherLinkableNamespace = (namespace: LinkableNamespace): LinkableNamespace =>
  namespace === "public" ? "growth" : "public";

export const linkableNamespaceLabel = (namespace: LinkableNamespace): string =>
  namespace === "public" ? "Veřejné" : "Growth Club";

export interface SectionLinkCounterpart {
  id: number;
}

export interface SectionLinkAttachResult {
  linkId: string;
  counterpart: SectionLinkCounterpart;
}

export const attachSectionLink = (
  kind: LinkableKind,
  type: LinkableEntityType,
  namespace: LinkableNamespace,
  id: number
): Promise<SectionLinkAttachResult> =>
  apiPost<SectionLinkAttachResult>("/api/section-link/attach", { kind, type, namespace, id });

export const detachSectionLink = (
  kind: LinkableKind,
  type: LinkableEntityType,
  namespace: LinkableNamespace,
  id: number
): Promise<{ ok: true }> =>
  apiPost<{ ok: true }>("/api/section-link/detach", { kind, type, namespace, id });
