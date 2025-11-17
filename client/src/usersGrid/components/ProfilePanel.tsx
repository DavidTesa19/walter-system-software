import React, { useEffect, useMemo, useRef } from "react";
import type { ProfileBadge, ProfileSection } from "../types/profile";
import "./ProfilePanel.css";

interface ProfileMetaItem {
  label: string;
  value: string;
}

interface ProfilePanelProps {
  open: boolean;
  entityLabel: string;
  title: string;
  subtitle?: string | null;
  badge?: ProfileBadge | null;
  meta?: ProfileMetaItem[];
  sections: ProfileSection[];
  onClose: () => void;
}

const isValueEmpty = (value: React.ReactNode) => {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  return false;
};

const ProfilePanel: React.FC<ProfilePanelProps> = ({
  open,
  entityLabel,
  title,
  subtitle,
  badge,
  meta,
  sections,
  onClose
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  const visibleSections = useMemo(() => {
    return sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) => field.always || !isValueEmpty(field.value))
      }))
      .filter((section) => section.fields.length > 0);
  }, [sections]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !panelRef.current) {
      return;
    }

    const firstInteractive = panelRef.current.querySelector<HTMLElement>("button, a, input, textarea, select");
    firstInteractive?.focus();
  }, [open]);

  const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="profile-overlay" onMouseDown={handleOverlayMouseDown} role="presentation">
      <div className="profile-panel" ref={panelRef} role="dialog" aria-modal="true">
        <header className="profile-panel__header">
          <div className="profile-panel__header-text">
            <p className="profile-panel__entity">{entityLabel}</p>
            <h2 className="profile-panel__title">{title}</h2>
            {subtitle ? <p className="profile-panel__subtitle">{subtitle}</p> : null}
            {badge ? <span className={`profile-badge profile-badge--${badge.tone}`}>{badge.text}</span> : null}
            {meta && meta.length > 0 ? (
              <dl className="profile-panel__meta">
                {meta.map((item) => (
                  <div key={`${item.label}-${item.value}`} className="profile-panel__meta-item">
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
          <button type="button" className="profile-panel__close" onClick={onClose} aria-label="Zavřít profil">
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M4 4L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="profile-panel__body">
          {visibleSections.length === 0 ? (
            <p className="profile-panel__empty">Pro tento profil zatím nejsou žádné detaily.</p>
          ) : (
            visibleSections.map((section) => (
              <section key={section.title} className="profile-section">
                <h3 className="profile-section__title">{section.title}</h3>
                <div className="profile-section__fields">
                  {section.fields.map((field) => (
                    <div key={field.label} className={`profile-field${field.isMultiline ? " profile-field--multiline" : ""}`}>
                      <span className="profile-field__label">{field.label}</span>
                      <span className="profile-field__value">{field.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePanel;
export type { ProfileBadge, ProfileSection } from "../types/profile";
export type { ProfileBadgeTone, ProfileField } from "../types/profile";
