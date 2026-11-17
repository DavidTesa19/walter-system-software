// Velín, the Jarvis screen's home: Jarvis in the middle (the orb and the
// conversation), and one quiet panel on the right, "Přehled", with what needs
// the user now. Its tabs go from most to least urgent: Teď (the next event,
// what is late or due today, proposals waiting), Úkoly, and Jarvis (model,
// voice, memory, services, today's usage for admins). The panel hides with one
// button; on a narrow screen it is the other half of a Chat / Přehled switch.
// Panel and tab are remembered per device.

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, CalendarClock, ChevronRight, Database, Mic, Sparkles, Star, Sun, X } from 'lucide-react';
import type { AttentionItem, ConversationSummary, JarvisAttention, JarvisMemory, JarvisOpenAction, JarvisPrompt, JarvisStatus } from './jarvisApi';
import { jarvisApi } from './jarvisApi';
import { apiGet } from '../utils/api';
import { analyticsApi } from './analytics/analyticsApi';
import { useTaskList, todayKey } from '../tasks/tasksApi';
import type { Task } from '../tasks/tasksApi';
import { MODEL_CHOICES } from './models';
import type { ModelChoice } from './models';
import { memoryEnabled } from './memorySettings';
import { formatCzk } from '../finance/financeMath';

const SMALL = { size: 14, strokeWidth: 2, 'aria-hidden': true } as const;

// ---------------------------------------------------------------------------
// What the panel needs from the Jarvis screen
// ---------------------------------------------------------------------------

export interface CommandCenterData {
  status: JarvisStatus | null;
  busy: boolean;
  modelChoice: ModelChoice;
  onModelChoice: (value: ModelChoice) => void;
  readAloud: boolean;
  onToggleReadAloud: () => void;
  canSpeak: boolean;
  canListen: boolean;
  voiceLabel: string | null;
  prompts: JarvisPrompt[] | null;
  onUsePrompt: (text: string, send: boolean) => void;
  conversations: ConversationSummary[] | null;
  attention: JarvisAttention | null;
  onOpenRecord: (action: JarvisOpenAction) => void;
  onBriefing: () => void;
  pendingCount: number;
  onShowPending: () => void;
  onSection: (section: 'memory' | 'prompts' | 'attention' | 'analysis' | 'settings') => void;
  onOpenView?: (view: 'tasks' | 'calendar') => void;
  isAdmin: boolean;
  userId: number | null;
}

// ---------------------------------------------------------------------------
// Panel state, remembered per device
// ---------------------------------------------------------------------------

export type OverviewTab = 'now' | 'tasks' | 'jarvis';
const PANEL_KEY = 'walterJarvis.panel';
const TAB_KEY = 'walterJarvis.panelTab';

const readStored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStored = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Remembering the panel is a convenience only.
  }
};

export function useOverviewPanel() {
  const [open, setOpen] = useState(() => readStored(PANEL_KEY) !== 'closed');
  const [tab, setTab] = useState<OverviewTab>(() => {
    const stored = readStored(TAB_KEY);
    return stored === 'tasks' || stored === 'jarvis' ? stored : 'now';
  });
  return {
    open,
    tab,
    toggle: () =>
      setOpen((value) => {
        writeStored(PANEL_KEY, value ? 'closed' : 'open');
        return !value;
      }),
    setTab: (next: OverviewTab) => {
      writeStored(TAB_KEY, next);
      setTab(next);
    },
  };
}

/**
 * How much room Velín has, measured on the element itself: under the app's
 * CSS zoom (and in a narrow window) media queries still see the real window.
 * wide = the conversation with the panel beside it; narrow = one at a time.
 */
export function useVelinWidth() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<'wide' | 'narrow'>(() => (typeof window === 'undefined' || window.innerWidth >= 1100 ? 'wide' : 'narrow'));
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setMode(width >= 840 ? 'wide' : 'narrow');
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { ref: setElement, mode };
}

// ---------------------------------------------------------------------------
// Data the panel reads itself
// ---------------------------------------------------------------------------

interface CalendarEvent {
  id: number;
  title: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  rrule: unknown;
}

// Today's own events (zone-less "2026-11-16T10:00" is the browser's local time,
// which for the team is Prague). Repeating events are left to the calendar.
function useTodayEvents() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      apiGet<CalendarEvent[]>('/api/calendar-events')
        .then((rows) => {
          if (cancelled) return;
          const today = todayKey();
          setEvents(
            (Array.isArray(rows) ? rows : [])
              .filter((event) => !event.rrule && event.start && event.start.slice(0, 10) <= today && (event.end ?? event.start).slice(0, 10) >= today)
              .sort((a, b) => String(a.start).localeCompare(String(b.start)))
          );
        })
        .catch(() => !cancelled && setEvents([]));
    void load();
    const timer = window.setInterval(load, 5 * 60_000);
    window.addEventListener('walter:calendar-changed', load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('walter:calendar-changed', load);
    };
  }, []);
  return events;
}

function useNow(stepMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), stepMs);
    return () => window.clearInterval(timer);
  }, [stepMs]);
  return now;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

function startsIn(iso: string, now: number) {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60000);
  if (minutes <= 0) return 'právě probíhá';
  if (minutes < 60) return `za ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `za ${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}

const notes = (count: number) => `${count} ${count === 1 ? 'poznámka' : count >= 2 && count <= 4 ? 'poznámky' : 'poznámek'}`;
const ownPrompts = (count: number) => (count === 0 ? 'žádné vlastní' : `${count} ${count <= 4 ? 'vlastní' : 'vlastních'}`);

const URGENT_LABEL: Partial<Record<AttentionItem['kind'], { label: string; tone: string }>> = {
  overdue: { label: 'Po termínu', tone: 'danger' },
  today: { label: 'Dnes', tone: 'warning' },
  task: { label: 'Úkol', tone: 'primary' },
};

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function Block({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="jov-block">
      <div className="jov-block-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function NowTab({ data }: { data: CommandCenterData }) {
  const events = useTodayEvents();
  const now = useNow();
  const nowMs = now.getTime();
  const timed = (events ?? []).filter((event) => !event.allDay && event.start);
  const next = timed.find((event) => new Date(event.end ?? event.start ?? 0).getTime() > nowMs);
  const later = timed.filter((event) => event !== next && new Date(event.start ?? 0).getTime() > nowMs);
  const allDay = (events ?? []).filter((event) => event.allDay);
  const items = data.attention?.items ?? [];
  const urgent = items.filter((item) => item.kind === 'overdue' || item.kind === 'today' || item.kind === 'task');
  const quieter = items.length - urgent.length;

  return (
    <>
      <Block title="Další v kalendáři">
        {events === null ? (
          <p className="jov-muted">Načítám…</p>
        ) : next && next.start ? (
          <div className="jov-next">
            <span className="jov-next-time">{clock(next.start)}</span>
            <span className="jov-next-text">
              <strong>{next.title}</strong>
              <small>{startsIn(next.start, nowMs)}</small>
            </span>
          </div>
        ) : (
          <p className="jov-muted">Dnes už nic dalšího.</p>
        )}
        {(later.length > 0 || allDay.length > 0) && (
          <ul className="jov-agenda">
            {allDay.map((event) => (
              <li key={event.id}>
                <span>celý den</span>
                {event.title}
              </li>
            ))}
            {later.slice(0, 3).map((event) => (
              <li key={event.id}>
                <span>{event.start ? clock(event.start) : ''}</span>
                {event.title}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block
        title="Potřebuje pozornost"
        action={urgent.length ? <span className="jov-count jov-count--danger">{urgent.length}</span> : undefined}
      >
        {data.pendingCount > 0 && (
          <button type="button" className="jov-item jov-item--pending" onClick={data.onShowPending}>
            <span className="jov-tag jov-tag--warning">Čeká</span>
            <span className="jov-item-text">
              <strong>
                {data.pendingCount} {data.pendingCount === 1 ? 'návrh čeká' : data.pendingCount < 5 ? 'návrhy čekají' : 'návrhů čeká'} na potvrzení
              </strong>
              <small>V otevřené konverzaci</small>
            </span>
            <ChevronRight {...SMALL} />
          </button>
        )}
        {data.attention === null && <p className="jov-muted">Načítám…</p>}
        {data.attention !== null && urgent.length === 0 && data.pendingCount === 0 && (
          <p className="jov-calm">
            <Sparkles {...SMALL} /> Nic nehoří. Nic po termínu ani na dnes.
          </p>
        )}
        {urgent.slice(0, 4).map((item, index) => {
          const tone = URGENT_LABEL[item.kind] ?? { label: '', tone: 'neutral' };
          const action = item.action;
          return (
            <button key={index} type="button" className="jov-item" onClick={() => action && data.onOpenRecord(action)} disabled={!action}>
              <span className={`jov-tag jov-tag--${tone.tone}`}>{tone.label}</span>
              <span className="jov-item-text">
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              {action && <ChevronRight {...SMALL} />}
            </button>
          );
        })}
        {(urgent.length > 4 || quieter > 0) && (
          <button type="button" className="jov-link" onClick={() => data.onSection('attention')}>
            {urgent.length > 4 ? `Dalších ${urgent.length - 4}` : ''}
            {urgent.length > 4 && quieter > 0 ? ' · ' : ''}
            {quieter > 0 ? `${quieter} brzy nebo dlouho beze změny` : ''}
          </button>
        )}
      </Block>
    </>
  );
}

function TasksTab({ data }: { data: CommandCenterData }) {
  const scope = useMemo(() => (data.userId ? { list: 'personal' as const, ownerUserId: data.userId } : null), [data.userId]);
  const { tasks, update, canEdit, loading } = useTaskList(scope);
  const today = todayKey();
  const open = tasks
    .filter((task: Task) => task.status !== 'done' && (task.status === 'todo' || (task.dueDate && task.dueDate <= today)))
    .sort((a, b) => Number(b.important) - Number(a.important) || String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999')));
  return (
    <Block
      title="Moje úkoly"
      action={
        data.onOpenView ? (
          <button type="button" className="jov-link" onClick={() => data.onOpenView?.('tasks')}>
            Všechny
          </button>
        ) : undefined
      }
    >
      {loading && <p className="jov-muted">Načítám…</p>}
      {!loading && open.length === 0 && (
        <p className="jov-calm">
          <Sparkles {...SMALL} /> Všechno hotovo.
        </p>
      )}
      <div className="jov-tasks">
        {open.slice(0, 8).map((task) => (
          <label key={task.id} className="jov-task">
            <input type="checkbox" checked={false} disabled={!canEdit} onChange={() => void update(task, { status: 'done' })} aria-label={`Hotovo: ${task.title}`} />
            {task.important && <Star size={12} strokeWidth={2.2} fill="currentColor" aria-label="Důležitý" className="jov-star" />}
            <span className="jov-ellipsis">{task.title}</span>
            {task.dueDate && (
              <small className={task.dueDate < today ? 'is-late' : undefined}>
                {task.dueDate === today ? 'dnes' : new Date(`${task.dueDate}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}
              </small>
            )}
          </label>
        ))}
      </div>
      <button type="button" className="jov-link" onClick={() => data.onUsePrompt('Přidej mi úkol ', false)}>
        + Přidat úkol přes Jarvise
      </button>
    </Block>
  );
}

function JarvisTab({ data }: { data: CommandCenterData }) {
  const [memories, setMemories] = useState<JarvisMemory[] | null>(null);
  const [usage, setUsage] = useState<{ questions: number; costCzk: number; weekCzk: number } | 'failed' | null>(null);
  const memoryOn = memoryEnabled();
  useEffect(() => {
    let cancelled = false;
    jarvisApi
      .memories()
      .then((items) => !cancelled && setMemories(items))
      .catch(() => !cancelled && setMemories([]));
    if (data.isAdmin) {
      analyticsApi
        .summary(7)
        .then((summary) => {
          if (cancelled) return;
          const today = summary.breakdown.byDay.at(-1);
          setUsage({ questions: today?.questions ?? 0, costCzk: (today?.costUsd ?? 0) * summary.usdCzk, weekCzk: summary.totals.jarvisCostUsd * summary.usdCzk });
        })
        .catch(() => !cancelled && setUsage('failed'));
    }
    return () => {
      cancelled = true;
    };
  }, [data.isAdmin, data.busy]);

  const status = data.status;
  const eleven = status?.providers?.some((provider) => provider.id === 'elevenlabs') ?? false;
  const services: Array<{ label: string; ok: boolean | null }> = [
    { label: 'Claude', ok: status ? status.available : null },
    { label: 'Hlas', ok: status ? Boolean(status.voice) : null },
    { label: 'ElevenLabs', ok: status ? eleven : null },
    { label: 'E-maily', ok: status ? Boolean(status.emailSend) : null },
    { label: 'ARES', ok: true },
    { label: 'Web', ok: true },
  ];

  return (
    <>
      <Block title="Model">
        <div className="jov-seg" role="radiogroup" aria-label="Model">
          {MODEL_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={data.modelChoice === choice.value}
              className={data.modelChoice === choice.value ? 'is-on' : undefined}
              onClick={() => data.onModelChoice(choice.value)}
              title={choice.hint}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <p className="jov-muted">{MODEL_CHOICES.find((choice) => choice.value === data.modelChoice)?.hint}</p>
      </Block>

      <Block title="Nastavení">
        <div className="jov-rows">
          <button type="button" className="jov-row" onClick={() => data.onSection('memory')}>
            <Database {...SMALL} />
            <span>Paměť</span>
            <small>{memoryOn ? (memories === null ? '…' : notes(memories.length)) : 'vypnutá'}</small>
            <ChevronRight {...SMALL} />
          </button>
          <button type="button" className="jov-row" onClick={() => data.onSection('settings')}>
            <Mic {...SMALL} />
            <span>Hlas</span>
            <small>{data.canSpeak || data.canListen ? data.voiceLabel ?? 'zapnutý' : 'jen prohlížeč'}</small>
            <ChevronRight {...SMALL} />
          </button>
          <button type="button" className="jov-row" onClick={() => data.onSection('prompts')}>
            <Sparkles {...SMALL} />
            <span>Šablony</span>
            <small>{data.prompts ? ownPrompts(data.prompts.filter((prompt) => prompt.mine).length) : '…'}</small>
            <ChevronRight {...SMALL} />
          </button>
          {data.canSpeak && (
            <label className="jov-row jov-row--switch">
              <Activity {...SMALL} />
              <span>Číst odpovědi nahlas</span>
              <input type="checkbox" role="switch" checked={data.readAloud} onChange={data.onToggleReadAloud} />
            </label>
          )}
        </div>
      </Block>

      <Block title="Služby">
        <div className="jov-services">
          {services.map((service) => (
            <span key={service.label} className="jov-service">
              <span className={`jov-dot jov-dot--${service.ok === null ? 'neutral' : service.ok ? 'ok' : 'off'}`} />
              {service.label}
            </span>
          ))}
        </div>
      </Block>

      {data.isAdmin && (
        <Block
          title="Využití"
          action={
            <button type="button" className="jov-link" onClick={() => data.onSection('analysis')}>
              Analýza
            </button>
          }
        >
          {usage === 'failed' ? (
            <p className="jov-muted">Údaje o využití se nepodařilo načíst.</p>
          ) : usage ? (
            <div className="jov-stats">
              <span>
                <strong>{usage.questions}</strong>
                <small>otázek dnes</small>
              </span>
              <span>
                <strong>{formatCzk(usage.costCzk)}</strong>
                <small>dnes</small>
              </span>
              <span>
                <strong>{formatCzk(usage.weekCzk)}</strong>
                <small>7 dní</small>
              </span>
            </div>
          ) : (
            <p className="jov-muted">Načítám…</p>
          )}
        </Block>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export function JarvisOverview({
  data,
  tab,
  onTab,
  onClose,
}: {
  data: CommandCenterData;
  tab: OverviewTab;
  onTab: (tab: OverviewTab) => void;
  onClose?: () => void;
}) {
  const now = useNow(20_000);
  const urgent = data.attention?.urgent ?? 0;
  const tabs: Array<{ id: OverviewTab; label: string; count?: number }> = [
    { id: 'now', label: 'Teď', count: urgent + data.pendingCount || undefined },
    { id: 'tasks', label: 'Úkoly' },
    { id: 'jarvis', label: 'Jarvis' },
  ];
  return (
    <aside className="jov" aria-label="Přehled">
      <header className="jov-head">
        <div className="jov-clock">
          <strong>{now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</strong>
          <span>{now.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
        <button type="button" className="jov-briefing" onClick={data.onBriefing} disabled={data.busy || data.status?.available === false} title="Ranní přehled od Jarvise">
          <Sun {...SMALL} /> Ranní přehled
        </button>
        {onClose && (
          <button type="button" className="jov-close" onClick={onClose} title="Skrýt přehled" aria-label="Skrýt přehled">
            <X {...SMALL} />
          </button>
        )}
      </header>
      <div className="jov-tabs" role="tablist" aria-label="Přehled">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'is-on' : undefined}
            onClick={() => onTab(item.id)}
          >
            {item.id === 'now' && <CalendarClock size={13} strokeWidth={2} aria-hidden />}
            {item.label}
            {item.count ? <span className="jov-count jov-count--danger">{item.count}</span> : null}
          </button>
        ))}
      </div>
      <div className="jov-body" role="tabpanel">
        {tab === 'now' && <NowTab data={data} />}
        {tab === 'tasks' && <TasksTab data={data} />}
        {tab === 'jarvis' && <JarvisTab data={data} />}
      </div>
    </aside>
  );
}
