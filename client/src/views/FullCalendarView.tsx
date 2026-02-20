import React, { useState, useEffect, useRef, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import multiMonthPlugin from '@fullcalendar/multimonth';
import rrulePlugin from '@fullcalendar/rrule';
import type { EventInput, EventClickArg, DateSelectArg, EventDropArg, EventContentArg } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import './FullCalendarView.css';
import ClockTimePicker from '../components/ClockTimePicker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendarEvent {
  id: number;
  title: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  color: string | null;
  description: string;
  rrule: any | null;
  duration: string | null;
  extendedProps: Record<string, any>;
}

// Preset event colour options
const EVENT_COLORS = [
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Teal', value: '#14b8a6' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'Yellow', value: '#eab308' },
];

// ---------------------------------------------------------------------------
// Event Modal Component
// ---------------------------------------------------------------------------

interface PreviewData {
  title?: string;
  start?: string | null;
  end?: string | null;
  allDay?: boolean;
  color?: string;
  description?: string;
}

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<CalendarEvent>) => void;
  onDelete?: () => void;
  initial?: Partial<CalendarEvent>;
  mode: 'create' | 'edit';
  anchorPos: { x: number; y: number } | null;
  onPreviewUpdate?: (data: PreviewData) => void;
}

/** Compute popover position so it stays within viewport */
const computePopoverPos = (
  anchor: { x: number; y: number },
  popoverEl: HTMLDivElement | null
): React.CSSProperties => {
  const GAP = 12;
  const MARGIN = 16;
  const pw = popoverEl?.offsetWidth ?? 380;
  const ph = popoverEl?.offsetHeight ?? 500;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Try to place to the right of the anchor
  let left = anchor.x + GAP;
  // If it overflows right, place to the left
  if (left + pw + MARGIN > vw) {
    left = anchor.x - pw - GAP;
  }
  // Clamp to left edge
  if (left < MARGIN) left = MARGIN;

  // Vertically: center on anchor, clamp to viewport
  let top = anchor.y - ph / 3;
  if (top + ph + MARGIN > vh) top = vh - ph - MARGIN;
  if (top < MARGIN) top = MARGIN;

  return { position: 'fixed', left, top };
};

const EventModal: React.FC<EventModalProps> = ({ isOpen, onClose, onSave, onDelete, initial, mode, anchorPos, onPreviewUpdate }) => {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  const [color, setColor] = useState(initial?.color ?? EVENT_COLORS[0].value);
  const [description, setDescription] = useState(initial?.description ?? '');
  
  // Time Picker State
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<'start' | 'end'>('start');

  const titleRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [posStyle, setPosStyle] = useState<React.CSSProperties>({});

  // Build current preview data from form state
  const buildPreview = useCallback((overrides: Partial<{
    title: string; startDate: string; startTime: string;
    endDate: string; endTime: string; allDay: boolean;
    color: string; description: string;
  }> = {}): PreviewData => {
    const t = overrides.title ?? title;
    const sd = overrides.startDate ?? startDate;
    const st = overrides.startTime ?? startTime;
    const ed = overrides.endDate ?? endDate;
    const et = overrides.endTime ?? endTime;
    const ad = overrides.allDay ?? allDay;
    const c = overrides.color ?? color;
    const desc = overrides.description ?? description;

    let start: string | null = null;
    let end: string | null = null;
    if (ad) {
      start = sd || null;
      end = ed ? addDays(ed, 1) : (sd ? addDays(sd, 1) : null);
    } else {
      start = sd && st ? `${sd}T${st}` : sd || null;
      end = ed && et ? `${ed}T${et}` : null;
    }

    return { title: t || '(New event)', start, end, allDay: ad, color: c, description: desc };
  }, [title, startDate, startTime, endDate, endTime, allDay, color, description]);

  // Fire preview update on any field change
  const emitPreview = useCallback((overrides: Parameters<typeof buildPreview>[0] = {}) => {
    onPreviewUpdate?.(buildPreview(overrides));
  }, [onPreviewUpdate, buildPreview]);

  // Wrapped setters that also emit preview
  const updateTitle = (v: string) => { setTitle(v); emitPreview({ title: v }); };
  const updateStartDate = (v: string) => { setStartDate(v); emitPreview({ startDate: v }); };
  const updateStartTime = (v: string) => { setStartTime(v); emitPreview({ startTime: v }); };
  const updateEndDate = (v: string) => { setEndDate(v); emitPreview({ endDate: v }); };
  const updateEndTime = (v: string) => { setEndTime(v); emitPreview({ endTime: v }); };
  const updateAllDay = (v: boolean) => { setAllDay(v); emitPreview({ allDay: v }); };
  const updateColor = (v: string) => { setColor(v); emitPreview({ color: v }); };
  const updateDescription = (v: string) => { setDescription(v); emitPreview({ description: v }); };

  // Outside-click: close only when mousedown is outside the popover
  useEffect(() => {
    if (!isOpen || showTimePicker) return;
    const handler = (e: MouseEvent) => {
      // If clicking inside the time picker portal (if it were one), ignore.
      if (document.querySelector('.clock-overlay')?.contains(e.target as Node)) return;
      
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use mousedown so it fires before any click handlers inside
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose, showTimePicker]);

  useEffect(() => {
    if (!isOpen) return;

    setTitle(initial?.title ?? '');
    setDescription(initial?.description ?? '');
    setColor(initial?.color ?? EVENT_COLORS[0].value);
    setAllDay(initial?.allDay ?? false);

    if (initial?.start) {
      const s = new Date(initial.start);
      setStartDate(formatDateLocal(s));
      setStartTime(formatTimeLocal(s));
    } else {
      setStartDate('');
      setStartTime('');
    }

    if (initial?.end) {
      const e = new Date(initial.end);
      setEndDate(formatDateLocal(e));
      setEndTime(formatTimeLocal(e));
    } else {
      setEndDate('');
      setEndTime('');
    }

    setTimeout(() => titleRef.current?.focus(), 50);
  }, [isOpen, initial]);

  // Position the popover after it renders and we know its size
  useEffect(() => {
    if (!isOpen || !anchorPos) return;
    // Small delay so the DOM has rendered and offsetWidth/Height are available
    const raf = requestAnimationFrame(() => {
      setPosStyle(computePopoverPos(anchorPos, popoverRef.current));
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, anchorPos]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<CalendarEvent> = {
      title: title.trim() || 'Untitled',
      allDay,
      color,
      description,
    };

    if (allDay) {
      payload.start = startDate || null;
      // For all-day events FullCalendar uses exclusive end
      payload.end = endDate ? addDays(endDate, 1) : (startDate ? addDays(startDate, 1) : null);
    } else {
      payload.start = startDate && startTime ? `${startDate}T${startTime}` : startDate || null;
      payload.end = endDate && endTime ? `${endDate}T${endTime}` : null;
    }

    onSave(payload);
  };

  return (
    <div style={backdropStyle}>
      <div
        ref={popoverRef}
        style={{ ...popoverStyle, ...posStyle }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#0f172a', fontFamily: MODAL_FONT }}>
          {mode === 'create' ? 'New Event' : 'Edit Event'}
        </h3>
        <form onSubmit={handleSubmit}>
          {/* Title */}
          <label style={labelStyle}>Title</label>
          <input
            ref={titleRef}
            style={inputStyle}
            value={title}
            onChange={(e) => updateTitle(e.target.value)}
            placeholder="Event title"
          />

          {/* All day toggle */}
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={allDay} onChange={(e) => updateAllDay(e.target.checked)} />
            All day
          </label>

          {/* Start */}
          <label style={labelStyle}>Start</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inputStyle, flex: 1 }} type="date" value={startDate} onChange={(e) => updateStartDate(e.target.value)} />
            {!allDay && (
              <div
                style={{ ...inputStyle, width: 130, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                onClick={() => {
                  setTimePickerTarget('start');
                  setShowTimePicker(true);
                }}
              >
                {startTime || '--:--'}
              </div>
            )}
          </div>

          {/* End */}
          <label style={labelStyle}>End</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inputStyle, flex: 1 }} type="date" value={endDate} onChange={(e) => updateEndDate(e.target.value)} />
            {!allDay && (
              <div
                style={{ ...inputStyle, width: 130, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                onClick={() => {
                  setTimePickerTarget('end');
                  setShowTimePicker(true);
                }}
              >
                {endTime || '--:--'}
              </div>
            )}
          </div>

          {/* Description */}
          <label style={labelStyle}>Description</label>
          <textarea
            style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
            value={description}
            onChange={(e) => updateDescription(e.target.value)}
            placeholder="Optional description"
          />

          {/* Color */}
          <label style={labelStyle}>Color</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {EVENT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => updateColor(c.value)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: color === c.value ? '3px solid #1e293b' : '2px solid transparent',
                  backgroundColor: c.value,
                  cursor: 'pointer',
                  outline: color === c.value ? '2px solid white' : 'none',
                }}
              />
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {mode === 'edit' && onDelete && (
              <button type="button" style={deleteBtnStyle} onClick={onDelete}>
                Delete
              </button>
            )}
            <button type="button" style={cancelBtnStyle} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" style={saveBtnStyle}>
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>

        {showTimePicker && (
          <ClockTimePicker
            isOpen={showTimePicker}
            value={timePickerTarget === 'start' ? startTime : endTime}
            onClose={() => setShowTimePicker(false)}
            onChange={(val) => {
              if (timePickerTarget === 'start') {
                updateStartTime(val);
              } else {
                updateEndTime(val);
              }
            }}
          />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

const formatDateLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const formatTimeLocal = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return formatDateLocal(d);
};

// ---------------------------------------------------------------------------
// Main Calendar Component
// ---------------------------------------------------------------------------

const PREVIEW_EVENT_ID = '__preview__';

const FullCalendarView: React.FC = () => {
  const calendarRef = useRef<FullCalendar>(null);
  const [events, setEvents] = useState<EventInput[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [modalInitial, setModalInitial] = useState<Partial<CalendarEvent>>({});
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number } | null>(null);

  // Track the latest mouse position for popover anchoring
  const mousePos = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e: MouseEvent) => { mousePos.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', handler, { passive: true });
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  // Helper: add a temporary preview event to show the selected time block
  const addPreviewEvent = useCallback((start: string, end: string, allDay: boolean) => {
    setEvents((prev) => [
      ...prev.filter((e) => e.id !== PREVIEW_EVENT_ID),
      {
        id: PREVIEW_EVENT_ID,
        title: '(New event)',
        start,
        end,
        allDay,
        display: 'auto',
        backgroundColor: 'rgba(59, 130, 246, 0.35)',
        borderColor: '#3b82f6',
        editable: false,
        extendedProps: { isPreview: true },
      },
    ]);
  }, []);

  // Helper: remove the preview event
  const removePreviewEvent = useCallback(() => {
    setEvents((prev) => prev.filter((e) => e.id !== PREVIEW_EVENT_ID));
  }, []);

  // Close modal helper
  const closeModal = useCallback(() => {
    setModalOpen(false);
    removePreviewEvent();
  }, [removePreviewEvent]);

  // ------- Data fetching -------

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiGet<CalendarEvent[]>('/api/calendar-events');
      setEvents(
        data.map((ev) => ({
          id: String(ev.id),
          title: ev.title,
          start: ev.start ?? undefined,
          end: ev.end ?? undefined,
          allDay: ev.allDay,
          backgroundColor: ev.color ?? undefined,
          borderColor: ev.color ?? undefined,
          extendedProps: { ...ev.extendedProps, description: ev.description, dbId: ev.id },
        }))
      );
    } catch (err) {
      console.error('Failed to fetch calendar events', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // ------- Event handlers -------

  /** Click on empty date / time-range select → create */
  const handleDateSelect = useCallback((selectInfo: DateSelectArg) => {
    // Immediately unselect FC's built-in highlight (we manage our own)
    selectInfo.view.calendar.unselect();

    setModalMode('create');
    setEditingEventId(null);
    setModalInitial({
      start: selectInfo.startStr,
      end: selectInfo.endStr,
      allDay: selectInfo.allDay,
    });
    setAnchorPos({ ...mousePos.current });
    setModalOpen(true);

    // Add a persistent preview event block
    addPreviewEvent(selectInfo.startStr, selectInfo.endStr, selectInfo.allDay);
  }, [addPreviewEvent]);

  /** Click existing event → edit */
  const handleEventClick = useCallback((clickInfo: EventClickArg) => {
    const ev = clickInfo.event;
    // Ignore clicks on the preview event
    if (ev.id === PREVIEW_EVENT_ID) return;
    const dbId = ev.extendedProps.dbId as number;
    // Anchor popover to the event element's position
    const rect = clickInfo.el.getBoundingClientRect();
    setAnchorPos({ x: rect.right, y: rect.top });
    setModalMode('edit');
    setEditingEventId(dbId);
    setModalInitial({
      title: ev.title,
      start: ev.startStr,
      end: ev.endStr || null,
      allDay: ev.allDay,
      color: ev.backgroundColor || null,
      description: (ev.extendedProps.description as string) || '',
    });
    setModalOpen(true);
  }, []);

  /** Drag & drop → update dates */
  const handleEventDrop = useCallback(async (dropInfo: EventDropArg) => {
    const dbId = dropInfo.event.extendedProps.dbId as number;
    try {
      await apiPut(`/api/calendar-events/${dbId}`, {
        start: dropInfo.event.startStr,
        end: dropInfo.event.endStr || null,
        allDay: dropInfo.event.allDay,
      });
    } catch {
      dropInfo.revert();
    }
    fetchEvents();
  }, [fetchEvents]);

  /** Resize → update end */
  const handleEventResize = useCallback(async (resizeInfo: EventResizeDoneArg) => {
    const dbId = resizeInfo.event.extendedProps.dbId as number;
    try {
      await apiPut(`/api/calendar-events/${dbId}`, {
        start: resizeInfo.event.startStr,
        end: resizeInfo.event.endStr || null,
        allDay: resizeInfo.event.allDay,
      });
    } catch {
      resizeInfo.revert();
    }
    fetchEvents();
  }, [fetchEvents]);

  // ------- Modal actions -------

  const handleModalSave = useCallback(async (data: Partial<CalendarEvent>) => {
    try {
      if (modalMode === 'create') {
        await apiPost('/api/calendar-events', data);
      } else if (editingEventId != null) {
        await apiPut(`/api/calendar-events/${editingEventId}`, data);
      }
    } catch (err) {
      console.error('Failed to save event', err);
    }
    closeModal();
    fetchEvents();
  }, [modalMode, editingEventId, fetchEvents, closeModal]);

  const handleModalDelete = useCallback(async () => {
    if (editingEventId == null) return;
    try {
      await apiDelete(`/api/calendar-events/${editingEventId}`);
    } catch (err) {
      console.error('Failed to delete event', err);
    }
    closeModal();
    fetchEvents();
  }, [editingEventId, fetchEvents, closeModal]);

  /** Live-preview form changes on the calendar event block */
  const handlePreviewUpdate = useCallback((data: PreviewData) => {
    const targetId = modalMode === 'edit' && editingEventId != null
      ? String(editingEventId)
      : PREVIEW_EVENT_ID;
    setEvents((prev) =>
      prev.map((ev) => {
        if (ev.id !== targetId) return ev;
        const updated: EventInput = { ...ev };
        if (data.title !== undefined) updated.title = data.title;
        if (data.start !== undefined) updated.start = data.start ?? undefined;
        if (data.end !== undefined) updated.end = data.end ?? undefined;
        if (data.allDay !== undefined) updated.allDay = data.allDay;
        if (data.color !== undefined) {
          updated.backgroundColor = data.color;
          updated.borderColor = data.color;
        }
        if (data.description !== undefined) {
          updated.extendedProps = { ...((ev.extendedProps as Record<string, unknown>) ?? {}), description: data.description };
        }
        return updated;
      })
    );
  }, [modalMode, editingEventId]);

  // ------- Custom event content (shows dot + title + time) -------

  const renderEventContent = (eventContent: EventContentArg) => {
    const { event, timeText, view } = eventContent;
    const desc = event.extendedProps.description as string | undefined;

    // In list view, show description too
    if (view.type === 'listWeek' || view.type === 'listMonth' || view.type === 'listDay') {
      return (
        <div>
          <b>{event.title}</b>
          {desc && <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{desc}</div>}
        </div>
      );
    }

    return (
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
        {timeText && <span style={{ marginRight: 4, fontWeight: 600 }}>{timeText}</span>}
        <span>{event.title}</span>
      </div>
    );
  };

  // ------- Render -------

  return (
    <div className="fc-wrapper">
      {loading && <div className="fc-loading-bar" />}

      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, multiMonthPlugin, rrulePlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,today,next',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek,multiMonthYear',
        }}
        buttonText={{
          today: 'Today',
          month: 'Month',
          week: 'Week',
          day: 'Day',
          list: 'List',
          year: 'Year',
        }}
        events={events}
        editable={true}
        selectable={true}
        selectMirror={true}
        dayMaxEvents={true}
        weekNumbers={true}
        nowIndicator={true}
        navLinks={true}
        eventStartEditable={true}
        eventResizableFromStart={true}
        eventDurationEditable={true}
        select={handleDateSelect}
        eventClick={handleEventClick}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        eventContent={renderEventContent}
        height="100%"
        stickyHeaderDates={true}
        handleWindowResize={true}
        firstDay={1}
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
        scrollTime="08:00:00"
        slotDuration="00:30:00"
        snapDuration="00:15:00"
        businessHours={{
          daysOfWeek: [1, 2, 3, 4, 5],
          startTime: '08:00',
          endTime: '18:00',
        }}
        eventTimeFormat={{
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }}
        slotLabelFormat={{
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }}
      />

      <EventModal
        isOpen={modalOpen}
        onClose={closeModal}
        onSave={handleModalSave}
        onDelete={modalMode === 'edit' ? handleModalDelete : undefined}
        initial={modalInitial}
        mode={modalMode}
        anchorPos={anchorPos}
        onPreviewUpdate={handlePreviewUpdate}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Inline Styles (modal only – wrapper styling is in FullCalendarView.css)
// ---------------------------------------------------------------------------

const MODAL_FONT = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  pointerEvents: 'none',  // backdrop itself does NOT swallow clicks
};

const popoverStyle: React.CSSProperties = {
  position: 'fixed',
  background: '#ffffff',
  borderRadius: 12,
  padding: 24,
  width: 380,
  maxWidth: '95vw',
  maxHeight: '85vh',
  overflow: 'auto',
  boxShadow: '0 12px 40px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)',
  fontFamily: MODAL_FONT,
  color: '#1e293b',
  zIndex: 10000,
  pointerEvents: 'all',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 4,
  marginTop: 12,
  color: '#374151',
  fontFamily: MODAL_FONT,
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  marginBottom: 4,
  background: '#f8fafc',
  color: '#1e293b',
  fontFamily: MODAL_FONT,
  WebkitTextFillColor: '#1e293b',
};

const saveBtnStyle: React.CSSProperties = {
  padding: '8px 20px',
  background: '#3b82f6',
  color: '#ffffff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
  fontFamily: MODAL_FONT,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 20px',
  background: '#f1f5f9',
  color: '#374151',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
  fontFamily: MODAL_FONT,
};

const deleteBtnStyle: React.CSSProperties = {
  padding: '8px 20px',
  background: '#fee2e2',
  color: '#dc2626',
  border: '1px solid #fecaca',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
  marginRight: 'auto',
  fontFamily: MODAL_FONT,
};

export default FullCalendarView;
