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

export interface ProfileDocument {
  id: number;
  entityType: "clients" | "partners" | "tipers";
  entityId: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  archivedAt?: string | null;
}

export interface ProfileNote {
  id: number;
  entityType: string;
  entityId: number;
  content: string;
  author: string;
  createdAt: string;
}
