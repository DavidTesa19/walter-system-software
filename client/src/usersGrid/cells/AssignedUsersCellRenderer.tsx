import React from "react";
import type { ICellRendererParams } from "ag-grid-community";
import { formatAssignedUsernames, normalizeAssignedUserIds, type AssignableUser } from "../assignmentUtils";
import "./AssignedUsersCellRenderer.css";

type AssignedUsersCellRendererParams = ICellRendererParams<any, number[] | null | undefined> & {
  users?: AssignableUser[];
  maxVisible?: number;
};

type AvatarItem = {
  key: string;
  label: string;
  initials: string;
};

const AVATAR_PALETTES = [
  { start: "#dbeafe", end: "#93c5fd", fg: "#0f172a" },
  { start: "#dcfce7", end: "#86efac", fg: "#14532d" },
  { start: "#fef3c7", end: "#fcd34d", fg: "#78350f" },
  { start: "#fae8ff", end: "#d8b4fe", fg: "#581c87" },
  { start: "#fee2e2", end: "#fca5a5", fg: "#7f1d1d" },
  { start: "#cffafe", end: "#67e8f9", fg: "#164e63" },
];

const getInitials = (label: string) => {
  const normalized = label.trim();
  if (!normalized) {
    return "?";
  }

  const tokens = normalized
    .split(/[\s._-]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length >= 2) {
    return `${tokens[0][0] ?? ""}${tokens[1][0] ?? ""}`.toUpperCase();
  }

  const compact = normalized.replace(/[^\p{L}\p{N}]/gu, "");
  return compact.slice(0, 2).toUpperCase() || normalized.slice(0, 2).toUpperCase();
};

const getPalette = (key: string) => {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }

  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
};

const buildAvatarItems = (assignedUserIds: unknown, users: AssignableUser[], fallbackAssignedTo?: string | null): AvatarItem[] => {
  const ids = normalizeAssignedUserIds(assignedUserIds);
  const usersById = new Map(users.map((user) => [user.id, user]));

  const fromIds = ids
    .map((id) => usersById.get(id))
    .filter((user): user is AssignableUser => Boolean(user))
    .map((user) => ({
      key: `user-${user.id}`,
      label: user.username,
      initials: getInitials(user.username),
    }));

  if (fromIds.length > 0) {
    return fromIds;
  }

  const fallbackLabels = (fallbackAssignedTo || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return fallbackLabels.map((label) => ({
    key: `fallback-${label}`,
    label,
    initials: getInitials(label),
  }));
};

const AssignedUsersCellRenderer: React.FC<AssignedUsersCellRendererParams> = (params) => {
  const users = params.users ?? [];
  const maxVisible = typeof params.maxVisible === "number" && params.maxVisible > 0 ? params.maxVisible : 3;
  const avatarItems = buildAvatarItems(params.value, users, params.data?.assigned_to ?? null);

  if (avatarItems.length === 0) {
    return <div className="assigned-users-cell"><span className="assigned-users-empty">—</span></div>;
  }

  const visibleItems = avatarItems.slice(0, maxVisible);
  const remainingCount = avatarItems.length - visibleItems.length;
  const tooltip = formatAssignedUsernames(params.value, users, params.data?.assigned_to ?? null) || avatarItems.map((item) => item.label).join(", ");

  return (
    <div className="assigned-users-cell" title={tooltip} aria-label={tooltip}>
      <div className="assigned-users-stack">
        {visibleItems.map((item) => {
          const palette = getPalette(item.key);

          return (
            <span
              key={item.key}
              className="assigned-users-avatar"
              style={{
                ["--avatar-bg-start" as string]: palette.start,
                ["--avatar-bg-end" as string]: palette.end,
                ["--avatar-fg" as string]: palette.fg,
              }}
              title={item.label}
              aria-hidden="true"
            >
              {item.initials}
            </span>
          );
        })}
        {remainingCount > 0 ? (
          <span className="assigned-users-avatar more" title={`+${remainingCount} další`} aria-hidden="true">+{remainingCount}</span>
        ) : null}
      </div>
    </div>
  );
};

export default AssignedUsersCellRenderer;