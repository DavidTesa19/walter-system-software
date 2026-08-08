import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalizeSearchText, type DealSubjectOption } from "../dealLink";
import { getApprovalStatusMeta } from "../utils/approvalStatus";
import "./DealSubjectPicker.css";

// Rect of the "+ Připojit …" button the picker is anchored to.
export interface DealPickerAnchor {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

interface DealSubjectPickerProps {
  anchor: DealPickerAnchor;
  // The button that opened the picker. It toggles the picker itself on click,
  // so the outside-click handler must leave it alone — closing on its mousedown
  // would make the toggle click reopen the picker immediately.
  anchorEl?: HTMLElement | null;
  // Lower-cased slot label for placeholders, e.g. "partner".
  typeLabel: string;
  options: DealSubjectOption[];
  onSelect: (id: number) => void;
  onClose: () => void;
}

const PANEL_WIDTH = 380;
const CARD_WIDTH = 300;
const CARD_MAX_HEIGHT = 340;
// Floor for the stacked fallback: below this the card scrolls rather than shrink
// into unreadability.
const MIN_CARD_HEIGHT = 120;
const MARGIN = 8;

const unique = (values: string[]): string[] =>
  Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "cs"));

// Approval statuses in their canonical order first, anything unknown after.
const orderStatuses = (values: string[]): string[] => {
  const known = ["accepted", "pending", "archived"].filter((status) => values.includes(status));
  const rest = values.filter((status) => !known.includes(status)).sort((a, b) => a.localeCompare(b, "cs"));
  return [...known, ...rest];
};

const statusLabel = (value: string): string => getApprovalStatusMeta(value)?.label ?? value;

// One of the four criteria dropdowns. The chosen-vs-default state is an explicit
// class rather than a :has(option:checked) selector, so the styling follows the
// same state React already owns.
const FilterSelect: React.FC<{
  label: string;
  value: string;
  options: string[];
  optionLabel?: (value: string) => string;
  onChange: (value: string) => void;
}> = ({ label, value, options, optionLabel, onChange }) => (
  <select
    className={`dsp-filter ${value ? "is-set" : ""}`}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    aria-label={`Filtr: ${label}`}
  >
    <option value="">{label} (vše)</option>
    {options.map((option) => (
      <option key={option} value={option}>
        {optionLabel ? optionLabel(option) : option}
      </option>
    ))}
  </select>
);

interface HoverCard {
  option: DealSubjectOption;
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

// Info card shown while hovering an option: the subject's profile basics.
const DealSubjectInfoCard: React.FC<{ card: HoverCard }> = ({ card }) => {
  const { option } = card;
  const statusMeta = getApprovalStatusMeta(option.status);
  const rows: Array<[string, string]> = [
    ["Jméno", option.personName],
    ["Společnost", option.company],
    ["Obor", option.oboryDisplay.join(", ")],
    ["Kraj", option.kraje.join(", ")],
    ["Lokalita", option.lokality.join(", ")],
    ["Telefon", option.phone],
    ["E-mail", option.email],
    ["Web", option.website],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <div
      className="dsp-card"
      style={{ left: card.left, top: card.top, width: card.width, maxHeight: card.maxHeight }}
    >
      <div className="dsp-card-header">
        <span className="dsp-card-code">{option.entityCode}</span>
        {statusMeta || option.status ? (
          <span className="dsp-card-status">
            <span
              className="dsp-status-dot"
              style={{ background: statusMeta?.color ?? "#64748b" }}
              aria-hidden="true"
            />
            {statusMeta?.label ?? option.status}
          </span>
        ) : null}
      </div>
      <div className="dsp-card-name">{option.name || "—"}</div>
      {rows.length > 0 ? (
        <dl className="dsp-card-rows">
          {rows.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
      {option.info ? <div className="dsp-card-info">{option.info}</div> : null}
    </div>
  );
};

/**
 * Rich counterparty picker for the "Propojení zakázky" panel: replaces the bare
 * <select> with a floating panel offering full-text search, Obor / Zaměření /
 * Kraj / Status filters, and a hover info card per subject. Positioning and
 * dismissal follow SubjectFieldPopover (portal, flip-up, outside click/Escape/
 * scroll closes).
 */
const DealSubjectPicker: React.FC<DealSubjectPickerProps> = ({
  anchor,
  anchorEl,
  typeLabel,
  options,
  onSelect,
  onClose,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [flipUp, setFlipUp] = useState(false);
  const [search, setSearch] = useState("");
  const [oborFilter, setOborFilter] = useState("");
  const [zamereniFilter, setZamereniFilter] = useState("");
  const [krajFilter, setKrajFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [card, setCard] = useState<HoverCard | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const oborOptions = useMemo(() => unique(options.flatMap((option) => option.obory)), [options]);
  const zamereniOptions = useMemo(() => unique(options.flatMap((option) => option.zamereni)), [options]);
  const krajOptions = useMemo(() => unique(options.flatMap((option) => option.kraje)), [options]);
  const statusOptions = useMemo(
    () => orderStatuses(unique(options.map((option) => option.status).filter(Boolean))),
    [options]
  );

  const filtered = useMemo(() => {
    const terms = normalizeSearchText(search).split(/\s+/).filter(Boolean);
    return options.filter((option) => {
      if (terms.some((term) => !option.searchText.includes(term))) return false;
      if (oborFilter && !option.obory.includes(oborFilter)) return false;
      if (zamereniFilter && !option.zamereni.includes(zamereniFilter)) return false;
      if (krajFilter && !option.kraje.includes(krajFilter)) return false;
      if (statusFilter && option.status !== statusFilter) return false;
      return true;
    });
  }, [options, search, oborFilter, zamereniFilter, krajFilter, statusFilter]);

  const hasFilters = Boolean(search || oborFilter || zamereniFilter || krajFilter || statusFilter);

  // The result list changed under the highlight — drop it and the card.
  useEffect(() => {
    setActiveIndex(-1);
    setCard(null);
  }, [filtered]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const height = panel.getBoundingClientRect().height;
    const spaceBelow = window.innerHeight - anchor.bottom - MARGIN;
    const spaceAbove = anchor.top - MARGIN;
    setFlipUp(height > spaceBelow && spaceAbove > spaceBelow);
  }, [anchor.bottom, anchor.top]);

  useEffect(() => {
    const isInside = (target: Node | null) => Boolean(target && rootRef.current?.contains(target));

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (isInside(target)) return;
      if (anchorEl && target && anchorEl.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    // The anchor rect is captured at click time — close instead of drifting.
    const handleReflow = (event: Event) => {
      if (isInside(event.target as Node | null)) return;
      onClose();
    };

    // Deferred so the click that opened the picker doesn't immediately close it.
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      window.addEventListener("resize", handleReflow);
      document.addEventListener("scroll", handleReflow, true);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReflow);
      document.removeEventListener("scroll", handleReflow, true);
    };
  }, [onClose, anchorEl]);

  // Beside the panel when there's room (right preferred, then left), otherwise
  // stacked under/over it — never covering the list the pointer is on. The card
  // scrolls internally, so a cramped viewport just gets a shorter card.
  const showCard = (index: number) => {
    const option = filtered[index];
    const rowEl = rowRefs.current[index];
    const panelRect = panelRef.current?.getBoundingClientRect();
    if (!option || !rowEl || !panelRect) return;

    const sideHeight = Math.min(CARD_MAX_HEIGHT, window.innerHeight - 2 * MARGIN);
    // Aligned with the hovered row, pulled back inside the viewport.
    const sideTop = Math.max(
      MARGIN,
      Math.min(rowEl.getBoundingClientRect().top, window.innerHeight - sideHeight - MARGIN)
    );

    if (panelRect.right + MARGIN + CARD_WIDTH <= window.innerWidth - MARGIN) {
      setCard({ option, left: panelRect.right + MARGIN, top: sideTop, width: CARD_WIDTH, maxHeight: sideHeight });
      return;
    }
    if (panelRect.left - MARGIN - CARD_WIDTH >= MARGIN) {
      setCard({
        option,
        left: panelRect.left - MARGIN - CARD_WIDTH,
        top: sideTop,
        width: CARD_WIDTH,
        maxHeight: sideHeight,
      });
      return;
    }

    const spaceBelow = window.innerHeight - panelRect.bottom - 2 * MARGIN;
    const spaceAbove = panelRect.top - 2 * MARGIN;
    const below = spaceBelow >= spaceAbove;
    const maxHeight = Math.min(CARD_MAX_HEIGHT, Math.max(below ? spaceBelow : spaceAbove, MIN_CARD_HEIGHT));
    setCard({
      option,
      left: panelRect.left,
      top: below ? panelRect.bottom + MARGIN : Math.max(MARGIN, panelRect.top - MARGIN - maxHeight),
      width: panelRect.width,
      maxHeight,
    });
  };

  const highlight = (index: number) => {
    setActiveIndex(index);
    showCard(index);
  };

  const handlePanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
    if (event.key === "Enter") {
      const option = filtered[activeIndex];
      if (option) {
        event.preventDefault();
        onSelect(option.id);
      }
      return;
    }
    event.preventDefault();
    if (filtered.length === 0) return;
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = activeIndex < 0 ? (delta > 0 ? 0 : filtered.length - 1) : (activeIndex + delta + filtered.length) % filtered.length;
    rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
    highlight(next);
  };

  const width = PANEL_WIDTH;
  const style: React.CSSProperties = {
    left: Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - width - MARGIN)),
    width,
    maxHeight: `${Math.max(240, Math.min(460, (flipUp ? anchor.top : window.innerHeight - anchor.bottom) - 2 * MARGIN))}px`,
    ...(flipUp
      ? { bottom: Math.max(MARGIN, window.innerHeight - anchor.top + 2) }
      : { top: anchor.bottom + 2 }),
  };

  const clearFilters = () => {
    setSearch("");
    setOborFilter("");
    setZamereniFilter("");
    setKrajFilter("");
    setStatusFilter("");
  };

  return createPortal(
    <div ref={rootRef} className="dsp-root">
      <div
        ref={panelRef}
        className="dsp-panel"
        style={style}
        role="dialog"
        aria-label={`Vyberte ${typeLabel}`}
        onKeyDown={handlePanelKeyDown}
      >
        <div className="dsp-search-row">
          <input
            type="text"
            className="dsp-search"
            placeholder={`Hledat ${typeLabel}… (jméno, obor, kraj…)`}
            value={search}
            autoFocus
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="button" className="dsp-close" onClick={onClose} title="Zavřít" aria-label="Zavřít">
            ×
          </button>
        </div>
        <div className="dsp-filters">
          <FilterSelect label="Obor" value={oborFilter} options={oborOptions} onChange={setOborFilter} />
          <FilterSelect
            label="Zaměření"
            value={zamereniFilter}
            options={zamereniOptions}
            onChange={setZamereniFilter}
          />
          <FilterSelect label="Kraj" value={krajFilter} options={krajOptions} onChange={setKrajFilter} />
          <FilterSelect
            label="Status"
            value={statusFilter}
            options={statusOptions}
            optionLabel={statusLabel}
            onChange={setStatusFilter}
          />
        </div>
        <div className="dsp-meta">
          <span className="dsp-count">
            {filtered.length === options.length
              ? `${options.length} subjektů`
              : `${filtered.length} z ${options.length} subjektů`}
          </span>
          {hasFilters ? (
            <button type="button" className="dsp-clear" onClick={clearFilters}>
              Zrušit filtry
            </button>
          ) : null}
        </div>
        <div
          className="dsp-list"
          role="listbox"
          onMouseLeave={() => {
            setActiveIndex(-1);
            setCard(null);
          }}
        >
          {filtered.length === 0 ? (
            <div className="dsp-empty">
              {options.length === 0 ? "Žádné subjekty k propojení." : "Žádné výsledky."}
            </div>
          ) : (
            filtered.map((option, index) => {
              const statusMeta = getApprovalStatusMeta(option.status);
              return (
                <button
                  key={option.id}
                  ref={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`dsp-option ${index === activeIndex ? "is-active" : ""}`}
                  onMouseEnter={() => highlight(index)}
                  onClick={() => onSelect(option.id)}
                >
                  <span
                    className="dsp-status-dot"
                    style={{ background: statusMeta?.color ?? "#64748b" }}
                    title={statusMeta?.label ?? option.status}
                    aria-hidden="true"
                  />
                  <span className="dsp-option-main">
                    <span className="dsp-option-title">
                      <span className="dsp-option-code">{option.entityCode}</span>
                      <span className="dsp-option-name">{option.name || "—"}</span>
                    </span>
                    {option.obory.length > 0 || option.kraje.length > 0 ? (
                      <span className="dsp-option-sub">
                        {[option.obory.join(", "), option.kraje.join(", ")].filter(Boolean).join(" • ")}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
      {card ? <DealSubjectInfoCard card={card} /> : null}
    </div>,
    document.body
  );
};

export default DealSubjectPicker;
