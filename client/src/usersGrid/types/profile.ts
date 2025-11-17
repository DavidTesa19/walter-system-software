import type { ReactNode } from "react";

export type ProfileBadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "muted";

export interface ProfileBadge {
  text: string;
  tone: ProfileBadgeTone;
}

export interface ProfileField {
  label: string;
  value: ReactNode;
  always?: boolean;
  isMultiline?: boolean;
}

export interface ProfileSection {
  title: string;
  fields: ProfileField[];
}
