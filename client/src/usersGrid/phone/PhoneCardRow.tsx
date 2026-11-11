// One record as a card on a phone: an ag-Grid full-width row (Community), so
// the grid keeps its sorting, filters, virtual scrolling and data loading; on
// a phone only the drawing changes. A tap opens the profile, exactly like the
// profile button (context.openProfile).

import { ChevronRight, MapPin, Phone } from 'lucide-react';
import { useActivity } from '../../activity/ActivityContext';
import { formatMultiValue, resolveRowEntityValue } from '../multiValue';
import { getWorkflowStatusOption } from '../workflowStatus';
import './PhoneCardRow.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface PhoneCardRowProps {
  data?: Row;
  context?: { openProfile?: (row: Row) => void };
}

const text = (value: unknown) => formatMultiValue(value).trim();

const formatDate = (value: unknown) => {
  if (!value) return '';
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
};

export default function PhoneCardRow({ data, context }: PhoneCardRowProps) {
  const { getItemActivity } = useActivity();
  if (!data) return null;

  const isSubject = Boolean(data.subjectRow || data.entityOnly);
  const code = isSubject ? data.entity_id : data.commission_id;
  const person = text(data.name);
  const company = text(resolveRowEntityValue(data, 'company'));
  const title = isSubject ? company || person : text(data.position) || text(data.project_name) || company || person;
  const subtitle = isSubject ? (company && person ? person : '') : [company, person].filter(Boolean).join(' · ');
  const phone = text(data.mobile || data.phone);
  const place = [text(resolveRowEntityValue(data, 'location')), text(resolveRowEntityValue(data, 'region'))].filter(Boolean)[0] ?? '';
  const status = !isSubject && data.state ? getWorkflowStatusOption(data.state) : null;
  const deadline = !isSubject ? formatDate(data.deadline) : '';
  const changed =
    data.activity_scope &&
    getItemActivity(
      data.activity_scope,
      data.activity_item_id,
      data.activity_latest_at,
      data.activity_created_at,
      data.activity_updated_by_user_id,
      data.activity_created_by_user_id,
    ) !== 'none';

  return (
    <button
      type="button"
      className="phone-card"
      onClick={() => context?.openProfile?.(data)}
      aria-label={`Otevřít ${title || code}`}
    >
      <span className="phone-card__main">
        <span className="phone-card__top">
          {changed && <span className="phone-card__dot" title="Nepřečtená změna" />}
          <span className="phone-card__code">{code}</span>
          {status && (
            <span className="phone-card__status" style={{ '--status-color': status.dotColor } as React.CSSProperties}>
              {status.label}
            </span>
          )}
          {deadline && <span className="phone-card__deadline">do {deadline}</span>}
          {isSubject && Number(data.commission_count) > 0 && (
            <span className="phone-card__meta">{data.commission_count} zak.</span>
          )}
        </span>
        <span className="phone-card__title">{title || 'Bez názvu'}</span>
        {(subtitle || phone || place) && (
          <span className="phone-card__details">
            {subtitle && <span className="phone-card__subtitle">{subtitle}</span>}
            {phone && (
              <span className="phone-card__chip">
                <Phone size={11} strokeWidth={2} aria-hidden />
                {phone}
              </span>
            )}
            {place && (
              <span className="phone-card__chip">
                <MapPin size={11} strokeWidth={2} aria-hidden />
                {place}
              </span>
            )}
          </span>
        )}
      </span>
      <ChevronRight className="phone-card__chevron" size={16} strokeWidth={2} aria-hidden />
    </button>
  );
}

/** The card's height in the grid (full-width rows need a fixed one). */
export const PHONE_CARD_HEIGHT = 74;
