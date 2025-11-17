import type { ProfileBadge } from "../types/profile";

type NullableString = string | null | undefined;

const STATUS_MAP: Record<string, { text: string; tone: ProfileBadge["tone"] }> = {
  accepted: { text: "Schváleno", tone: "success" },
  done: { text: "Dokončeno", tone: "success" },
  completed: { text: "Dokončeno", tone: "success" },
  active: { text: "Aktivní", tone: "success" },
  pending: { text: "Čeká na akci", tone: "warning" },
  "not started": { text: "Nezahájeno", tone: "warning" },
  new: { text: "Nový", tone: "warning" },
  "in process": { text: "V procesu", tone: "info" },
  "in progress": { text: "V procesu", tone: "info" },
  processing: { text: "V procesu", tone: "info" },
  archived: { text: "Archivováno", tone: "muted" },
  closed: { text: "Uzavřeno", tone: "muted" },
  cancelled: { text: "Zrušeno", tone: "muted" },
  canceled: { text: "Zrušeno", tone: "muted" },
  rejected: { text: "Zamítnuto", tone: "danger" },
  declined: { text: "Zamítnuto", tone: "danger" },
  lost: { text: "Ztraceno", tone: "danger" }
};

export const normalizeText = (value: NullableString): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = `${value}`.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const formatProfileDate = (value: NullableString): string | null => {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    return date.toLocaleDateString("cs-CZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  return text;
};

export const toStatusBadge = (status: NullableString): ProfileBadge | null => {
  const normalized = normalizeText(status);
  if (!normalized) {
    return null;
  }

  const lookup = STATUS_MAP[normalized.toLowerCase()];
  if (lookup) {
    return lookup;
  }

  const capitalised = normalized.replace(/\b\w/g, (char) => char.toUpperCase());
  return { text: capitalised, tone: "neutral" };
};
