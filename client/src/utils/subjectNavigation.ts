import { createContext, useContext } from "react";
import type { LinkableNamespace } from "../usersGrid/sectionLink";
import type { SubjectRole } from "../usersGrid/subjectLink";

/**
 * Jumping to a commission that belongs to another of a subject's roles.
 *
 * The profile panel lists everything the subject takes part in — as Klient, as
 * Partner and as Tipař — but it can only edit the record it is actually open on.
 * Picking one of the others therefore switches the app to the section that owns
 * it and opens ITS profile panel there, rather than trying to edit a foreign
 * record through this one. `App` holds the view state, so it supplies the
 * handler and the sections consume it through this context.
 */
export interface SubjectNavigationRequest {
  namespace: LinkableNamespace;
  type: SubjectRole;
  /** Approval status of the commission — decides which tab to land on. */
  status: string;
  /** The record the commission hangs off, so the right profile opens. */
  entityInternalId: number;
  commissionInternalId: number;
}

export type SubjectNavigationHandler = (request: SubjectNavigationRequest) => void;

const SubjectNavigationContext = createContext<SubjectNavigationHandler | null>(null);

export const SubjectNavigationProvider = SubjectNavigationContext.Provider;

/** Null outside a provider — callers hide the jump affordance in that case. */
export const useSubjectNavigation = (): SubjectNavigationHandler | null =>
  useContext(SubjectNavigationContext);
