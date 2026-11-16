// Velín: the Jarvis screen's home. Jarvis in the middle (the orb and the
// chat), and around it widgets with what the user needs at hand: Jarvis's
// own state (model, memory, voice, what its tools are doing), the day
// (program, alerts, to-dos), quick commands, the services Jarvis relies on
// and, for admins, today's usage. Every widget folds or hides; the choice is
// remembered per device (localStorage `walterJarvis.layout`).
//
// Widths: three columns on a wide screen, one side column under 1280 px, and
// on a phone the widgets behind a "Přehled" switch (JarvisWorkspace).

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity, Bell, CalendarDays, ChevronDown, ChevronRight, ClipboardCheck, Cpu, Database, Download, EyeOff, FileText, Globe,
  IdCard, ListChecks, Mail, MessagesSquare, Mic, Pin, Plus, Search, Server, Sparkles, Star, Sun, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
// Which widgets show, folded or not, in which column
// ---------------------------------------------------------------------------

export type WidgetId = 'core' | 'conversations' | 'skills' | 'services' | 'feed' | 'today' | 'tasks' | 'quick' | 'memory' | 'usage';

export const WIDGETS: Array<{ id: WidgetId; title: string; column: 'left' | 'right'; adminOnly?: boolean }> = [
  { id: 'core', title: 'AI jádro', column: 'left' },
  { id: 'conversations', title: 'Konverzace', column: 'left' },
  { id: 'skills', title: 'Schopnosti', column: 'left' },
  { id: 'services', title: 'Služby', column: 'left' },
  { id: 'feed', title: 'Živý přehled', column: 'right' },
  { id: 'today', title: 'Dnes', column: 'right' },
  { id: 'tasks', title: 'Úkoly', column: 'right' },
  { id: 'quick', title: 'Rychlé příkazy', column: 'right' },
  { id: 'memory', title: 'Paměť', column: 'right' },
  { id: 'usage', title: 'Využití', column: 'right', adminOnly: true },
];

interface Layout {
  hidden: WidgetId[];
  collapsed: WidgetId[];
  left: boolean;
  right: boolean;
}

const LAYOUT_KEY = 'walterJarvis.layout';
const DEFAULT_LAYOUT: Layout = { hidden: [], collapsed: ['services'], left: true, right: true };

const readLayout = (): Layout => {
  try {
    const stored = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null');
    return stored && typeof stored === 'object' ? { ...DEFAULT_LAYOUT, ...stored } : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
};

export function useCommandLayout() {
  const [layout, setLayout] = useState<Layout>(readLayout);
  const save = useCallback((next: (current: Layout) => Layout) => {
    setLayout((current) => {
      const value = next(current);
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(value));
      } catch {
        // Remembering the layout is a convenience only.
      }
      return value;
    });
  }, []);
  const flip = (list: WidgetId[], id: WidgetId) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  return {
    layout,
    toggleHidden: (id: WidgetId) => save((current) => ({ ...current, hidden: flip(current.hidden, id) })),
    toggleCollapsed: (id: WidgetId) => save((current) => ({ ...current, collapsed: flip(current.collapsed, id) })),
    toggleColumn: (column: 'left' | 'right') => save((current) => ({ ...current, [column]: !current[column] })),
    reset: () => save(() => DEFAULT_LAYOUT),
  };
}

export type CommandLayout = ReturnType<typeof useCommandLayout>;

/** The Přizpůsobit popover: which widgets and columns show. */
export function CustomizePanel({ layout, isAdmin, onClose }: { layout: CommandLayout; isAdmin: boolean; onClose: () => void }) {
  return (
    <div className="jcc-customize" role="dialog" aria-label="Přizpůsobit Velín">
      <div className="jcc-customize-head">
        <strong>Co zobrazit</strong>
        <button type="button" className="jcc-link" onClick={layout.reset}>
          Obnovit výchozí
        </button>
      </div>
      <div className="jcc-customize-cols">
        <label className="jcc-check">
          <input type="checkbox" checked={layout.layout.left} onChange={() => layout.toggleColumn('left')} />
          <span>Levý sloupec</span>
        </label>
        <label className="jcc-check">
          <input type="checkbox" checked={layout.layout.right} onChange={() => layout.toggleColumn('right')} />
          <span>Pravý sloupec</span>
        </label>
      </div>
      <div className="jcc-customize-grid">
        {WIDGETS.filter((widget) => !widget.adminOnly || isAdmin).map((widget) => (
          <label key={widget.id} className="jcc-check">
            <input type="checkbox" checked={!layout.layout.hidden.includes(widget.id)} onChange={() => layout.toggleHidden(widget.id)} />
            <span>{widget.title}</span>
          </label>
        ))}
      </div>
      <button type="button" className="jcc-btn jcc-btn--primary" onClick={onClose}>
        Hotovo
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A widget's frame
// ---------------------------------------------------------------------------

function Widget({
  id,
  title,
  icon: Icon,
  badge,
  badgeTone = 'neutral',
  layout,
  children,
}: {
  id: WidgetId;
  title: string;
  icon: LucideIcon;
  badge?: ReactNode;
  badgeTone?: 'neutral' | 'primary' | 'danger' | 'warning';
  layout: CommandLayout;
  children: ReactNode;
}) {
  const collapsed = layout.layout.collapsed.includes(id);
  return (
    <section className={`jcc-widget${collapsed ? ' is-collapsed' : ''}`} aria-label={title}>
      <header className="jcc-widget-head">
        <button type="button" className="jcc-widget-toggle" onClick={() => layout.toggleCollapsed(id)} aria-expanded={!collapsed}>
          <span className="jcc-widget-icon">
            <Icon {...SMALL} />
          </span>
          <span className="jcc-widget-title">{title}</span>
          {badge !== undefined && badge !== null && badge !== '' && <span className={`jcc-badge jcc-badge--${badgeTone}`}>{badge}</span>}
          <span className="jcc-widget-chevron">{collapsed ? <ChevronRight {...SMALL} /> : <ChevronDown {...SMALL} />}</span>
        </button>
        <button type="button" className="jcc-icon-btn" onClick={() => layout.toggleHidden(id)} title="Skrýt (vrátíte v Přizpůsobit)" aria-label={`Skrýt ${title}`}>
          <EyeOff size={13} strokeWidth={2} aria-hidden />
        </button>
      </header>
      {!collapsed && <div className="jcc-widget-body">{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Data the widgets read themselves
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
function useTodayEvents(active: boolean) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  useEffect(() => {
    if (!active) return undefined;
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
  }, [active]);
  return events;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

function relativeStart(iso: string, now: number) {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60000);
  if (minutes < -5) return null;
  if (minutes <= 0) return 'teď';
  if (minutes < 60) return `za ${minutes} min`;
  return `za ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// ---------------------------------------------------------------------------
// The widgets
// ---------------------------------------------------------------------------

// What each skill tile stands for: Jarvis's tools grouped as people think of them.
const SKILLS: Array<{ id: string; title: string; icon: LucideIcon; tools: string[]; example: string }> = [
  { id: 'search', title: 'Hledání', icon: Search, tools: ['search', 'list_records', 'get_subject', 'get_commission', 'list_team', 'recent_changes', 'open_record'], example: 'Které moje zakázky jsou po termínu?' },
  { id: 'calendar', title: 'Kalendář', icon: CalendarDays, tools: ['calendar', 'calendar_add_event', 'calendar_update_event', 'calendar_delete_event', 'tasks', 'reminders', 'propose_task'], example: 'Co mám tento týden v kalendáři?' },
  { id: 'documents', title: 'Dokumenty', icon: FileText, tools: ['read_document', 'create_document', 'export_records'], example: 'Exportuj aktivní zakázky do Excelu.' },
  { id: 'web', title: 'Web a ARES', icon: Globe, tools: ['web_search', 'web_fetch', 'company_registry'], example: 'Ověř v ARES firmu s IČO ' },
  { id: 'email', title: 'E-maily', icon: Mail, tools: ['draft_email'], example: 'Napiš follow-up e-mail po schůzce s ' },
  { id: 'changes', title: 'Změny', icon: ClipboardCheck, tools: ['propose_update', 'propose_bulk_update', 'propose_note', 'propose_assign', 'propose_obor', 'propose_create_subject', 'propose_create_commission', 'remember', 'forget'], example: 'Všem mým zakázkám po termínu posuň termín na ' },
];

const ATTENTION_TONE: Record<AttentionItem['kind'], { label: string; tone: string }> = {
  overdue: { label: 'Po termínu', tone: 'danger' },
  today: { label: 'Dnes', tone: 'warning' },
  task: { label: 'Úkol', tone: 'primary' },
  soon: { label: 'Brzy', tone: 'primary' },
  stale: { label: 'Stojí', tone: 'neutral' },
};

export interface CommandCenterData {
  status: JarvisStatus | null;
  busy: boolean;
  activeTools: string[];
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
  activeId: string | null;
  onOpenConversation: (id: string) => void;
  onNewConversation: () => void;
  attention: JarvisAttention | null;
  onOpenRecord: (action: JarvisOpenAction) => void;
  onBriefing: () => void;
  pendingCount: number;
  onCard: () => void;
  onTalk: () => void;
  onSection: (section: 'conversations' | 'memory' | 'prompts' | 'capabilities' | 'attention' | 'analysis' | 'settings') => void;
  onOpenView?: (view: 'tasks' | 'calendar') => void;
  isAdmin: boolean;
  userId: number | null;
}

function CoreWidget({ data, layout, memoryCount }: { data: CommandCenterData; layout: CommandLayout; memoryCount: number | null }) {
  const memoryOn = memoryEnabled();
  return (
    <Widget id="core" title="AI jádro" icon={Cpu} layout={layout} badge={data.status?.available === false ? 'offline' : 'online'} badgeTone={data.status?.available === false ? 'danger' : 'primary'}>
      <div className="jcc-seg" role="radiogroup" aria-label="Model">
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
      <div className="jcc-rows">
        <button type="button" className="jcc-row" onClick={() => data.onSection('memory')}>
          <Database {...SMALL} />
          <span>Paměť</span>
          <small>{memoryOn ? (memoryCount === null ? '…' : `${memoryCount} poznámek`) : 'vypnutá'}</small>
        </button>
        <button type="button" className="jcc-row" onClick={() => data.onSection('settings')}>
          <Mic {...SMALL} />
          <span>Hlas</span>
          <small>{data.canSpeak || data.canListen ? data.voiceLabel ?? 'zapnutý' : 'jen prohlížeč'}</small>
        </button>
        <button type="button" className="jcc-row" onClick={() => data.onSection('prompts')}>
          <Sparkles {...SMALL} />
          <span>Šablony</span>
          <small>{data.prompts ? `${data.prompts.filter((prompt) => prompt.mine).length} vašich` : '…'}</small>
        </button>
        {data.canSpeak && (
          <label className="jcc-row jcc-row--switch">
            <Activity {...SMALL} />
            <span>Číst odpovědi nahlas</span>
            <input type="checkbox" role="switch" checked={data.readAloud} onChange={data.onToggleReadAloud} />
          </label>
        )}
      </div>
    </Widget>
  );
}

function ConversationsWidget({ data, layout }: { data: CommandCenterData; layout: CommandLayout }) {
  const items = (data.conversations ?? []).slice(0, 6);
  return (
    <Widget id="conversations" title="Konverzace" icon={MessagesSquare} layout={layout} badge={data.conversations?.length || undefined}>
      <button type="button" className="jcc-new" onClick={data.onNewConversation} disabled={data.busy} title="Nová konverzace (Alt+N)">
        <Plus {...SMALL} /> Nová konverzace <kbd>Alt+N</kbd>
      </button>
      {data.conversations === null && <p className="jcc-muted">Načítám…</p>}
      {data.conversations?.length === 0 && <p className="jcc-muted">Zatím žádné. Zeptejte se na cokoli.</p>}
      <div className="jcc-list">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`jcc-list-item${item.id === data.activeId ? ' is-active' : ''}`}
            onClick={() => data.onOpenConversation(item.id)}
            disabled={data.busy && item.id !== data.activeId}
            title={item.title ?? undefined}
          >
            {item.pinned && <Pin size={12} strokeWidth={2.2} aria-label="Připnuto" className="jcc-pin" />}
            <span className="jcc-ellipsis">{item.title || 'Bez názvu'}</span>
            <small>{new Date(item.updatedAt).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}</small>
          </button>
        ))}
      </div>
      {(data.conversations?.length ?? 0) > items.length && (
        <button type="button" className="jcc-link" onClick={() => data.onSection('conversations')}>
          Všechny konverzace ({data.conversations?.length})
        </button>
      )}
    </Widget>
  );
}

function SkillsWidget({ data, layout }: { data: CommandCenterData; layout: CommandLayout }) {
  const working = SKILLS.filter((skill) => skill.tools.some((tool) => data.activeTools.includes(tool))).map((skill) => skill.id);
  return (
    <Widget id="skills" title="Schopnosti" icon={Zap} layout={layout} badge={working.length ? 'pracuje' : undefined} badgeTone="warning">
      <div className="jcc-skills">
        {SKILLS.map((skill) => {
          const Icon = skill.icon;
          const busy = working.includes(skill.id);
          return (
            <button key={skill.id} type="button" className={`jcc-skill${busy ? ' is-busy' : ''}`} onClick={() => data.onUsePrompt(skill.example, false)} title={`Zkusit: ${skill.example}`}>
              <Icon {...SMALL} />
              <span>{skill.title}</span>
              <small>{busy ? 'pracuje…' : 'připraven'}</small>
            </button>
          );
        })}
      </div>
      <button type="button" className="jcc-link" onClick={() => data.onSection('capabilities')}>
        Co všechno Jarvis umí
      </button>
    </Widget>
  );
}

function ServicesWidget({ data, layout }: { data: CommandCenterData; layout: CommandLayout }) {
  const status = data.status;
  const eleven = status?.providers?.some((provider) => provider.id === 'elevenlabs') ?? false;
  const rows: Array<{ label: string; ok: boolean | null; note: string }> = [
    { label: 'Claude (Anthropic)', ok: status ? status.available : null, note: status?.available ? 'připojeno' : 'chybí klíč' },
    { label: 'Hlas OpenAI', ok: status ? Boolean(status.voice) : null, note: status?.voice ? 'připojeno' : 'jen prohlížeč' },
    { label: 'ElevenLabs', ok: status ? eleven : null, note: eleven ? 'připojeno' : 'nenastaveno' },
    { label: 'E-maily (Brevo)', ok: status ? Boolean(status.emailSend) : null, note: status?.emailSend ? 'připojeno' : 'bez klíče' },
    { label: 'ARES', ok: true, note: 'veřejný rejstřík' },
    { label: 'Web', ok: true, note: 'hledání zapnuté' },
  ];
  const problems = rows.filter((row) => row.ok === false).length;
  return (
    <Widget id="services" title="Služby" icon={Server} layout={layout} badge={problems ? `${problems}×` : 'OK'} badgeTone={problems ? 'warning' : 'primary'}>
      <div className="jcc-services">
        {rows.map((row) => (
          <span key={row.label} className="jcc-service">
            <span className={`jcc-dot jcc-dot--${row.ok === null ? 'neutral' : row.ok ? 'ok' : 'warn'}`} />
            <span className="jcc-ellipsis">{row.label}</span>
            <small>{row.note}</small>
          </span>
        ))}
      </div>
    </Widget>
  );
}

function FeedWidget({ data, layout }: { data: CommandCenterData; layout: CommandLayout }) {
  const items = data.attention?.items ?? [];
  const urgent = data.attention?.urgent ?? 0;
  return (
    <Widget id="feed" title="Živý přehled" icon={Bell} layout={layout} badge={urgent || undefined} badgeTone="danger">
      {data.pendingCount > 0 && (
        <div className="jcc-feed-item jcc-feed-item--warning">
          <span className="jcc-tag jcc-tag--warning">Čeká</span>
          <span>
            <strong>{data.pendingCount} {data.pendingCount === 1 ? 'návrh čeká' : data.pendingCount < 5 ? 'návrhy čekají' : 'návrhů čeká'} na potvrzení</strong>
            <small>V otevřené konverzaci</small>
          </span>
        </div>
      )}
      {data.attention === null && <p className="jcc-muted">Načítám…</p>}
      {data.attention !== null && items.length === 0 && data.pendingCount === 0 && <p className="jcc-muted">Nic nehoří – žádné zakázky po termínu ani úkoly na dnes.</p>}
      {items.slice(0, 6).map((item, index) => {
        const tone = ATTENTION_TONE[item.kind];
        const content = (
          <>
            <span className={`jcc-tag jcc-tag--${tone.tone}`}>{tone.label}</span>
            <span>
              <strong className="jcc-ellipsis">{item.label}</strong>
              <small>{item.detail}</small>
            </span>
          </>
        );
        const action = item.action;
        return action ? (
          <button key={index} type="button" className="jcc-feed-item" onClick={() => data.onOpenRecord(action)} title="Otevřít záznam">
            {content}
          </button>
        ) : (
          <div key={index} className="jcc-feed-item">
            {content}
          </div>
        );
      })}
      <div className="jcc-actions">
        <button type="button" className="jcc-btn jcc-btn--primary" onClick={data.onBriefing} disabled={data.busy || data.status?.available === false}>
          <Sun {...SMALL} /> Ranní přehled
        </button>
        {items.length > 6 && (
          <button type="button" className="jcc-link" onClick={() => data.onSection('attention')}>
            Všech {items.length}
          </button>
        )}
      </div>
    </Widget>
  );
}

function TodayWidget({ data, layout, events }: { data: CommandCenterData; layout: CommandLayout; events: CalendarEvent[] | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const deadlines = (data.attention?.items ?? []).filter((item) => item.kind === 'today');
  const nextId = events?.find((event) => !event.allDay && event.start && new Date(event.end ?? event.start).getTime() > now)?.id;
  const count = (events?.length ?? 0) + deadlines.length;
  return (
    <Widget id="today" title="Dnes" icon={CalendarDays} layout={layout} badge={count || undefined}>
      {events === null && <p className="jcc-muted">Načítám…</p>}
      {events !== null && count === 0 && <p className="jcc-muted">Na dnešek nic v kalendáři ani žádný termín.</p>}
      <div className="jcc-timeline">
        {events?.map((event) => {
          const past = !event.allDay && event.end ? new Date(event.end).getTime() < now : false;
          const soon = event.id === nextId && event.start ? relativeStart(event.start, now) : null;
          return (
            <div key={event.id} className={`jcc-time-row${past ? ' is-past' : ''}${event.id === nextId ? ' is-next' : ''}`}>
              <span className="jcc-time">{event.allDay || !event.start ? 'celý den' : clock(event.start)}</span>
              <span className="jcc-ellipsis">{event.title}</span>
              {soon && <small>{soon}</small>}
            </div>
          );
        })}
        {deadlines.map((item, index) => {
          const action = item.action;
          return (
            <button key={`d-${index}`} type="button" className="jcc-time-row jcc-time-row--deadline" onClick={() => action && data.onOpenRecord(action)} disabled={!action}>
              <span className="jcc-time">termín</span>
              <span className="jcc-ellipsis">{item.label}</span>
            </button>
          );
        })}
      </div>
      {data.onOpenView && (
        <button type="button" className="jcc-link" onClick={() => data.onOpenView?.('calendar')}>
          Otevřít kalendář
        </button>
      )}
    </Widget>
  );
}

function TasksWidget({ data, layout }: { data: CommandCenterData; layout: CommandLayout }) {
  const scope = useMemo(() => (data.userId ? { list: 'personal' as const, ownerUserId: data.userId } : null), [data.userId]);
  const { tasks, update, canEdit, loading } = useTaskList(scope);
  const today = todayKey();
  const open = tasks
    .filter((task: Task) => task.status !== 'done' && (task.status === 'todo' || (task.dueDate && task.dueDate <= today)))
    .sort((a, b) => Number(b.important) - Number(a.important) || String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999')));
  return (
    <Widget id="tasks" title="Úkoly" icon={ListChecks} layout={layout} badge={open.length || undefined}>
      {loading && <p className="jcc-muted">Načítám…</p>}
      {!loading && open.length === 0 && <p className="jcc-muted">Všechno hotovo.</p>}
      <div className="jcc-tasks">
        {open.slice(0, 6).map((task) => (
          <label key={task.id} className="jcc-task">
            <input type="checkbox" checked={false} disabled={!canEdit} onChange={() => void update(task, { status: 'done' })} aria-label={`Hotovo: ${task.title}`} />
            {task.important && <Star size={12} strokeWidth={2.2} fill="currentColor" aria-label="Důležitý" className="jcc-star" />}
            <span className="jcc-ellipsis">{task.title}</span>
            {task.dueDate && <small className={task.dueDate < today ? 'is-late' : undefined}>{task.dueDate === today ? 'dnes' : new Date(`${task.dueDate}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}</small>}
          </label>
        ))}
      </div>
      <div className="jcc-actions">
        <button type="button" className="jcc-link" onClick={() => data.onUsePrompt('Přidej mi úkol ', false)}>
          + Úkol přes Jarvise
        </button>
        {data.onOpenView && (
          <button type="button" className="jcc-link" onClick={() => data.onOpenView?.('tasks')}>
            Všechny úkoly
          </button>
        )}
      </div>
    </Widget>
  );
}

function QuickWidget({ data, layout }: { data: CommandCenterData; layout: CommandLayout }) {
  const mine = (data.prompts ?? []).filter((prompt) => prompt.mine).slice(0, 4);
  const disabled = data.busy || data.status?.available === false;
  return (
    <Widget id="quick" title="Rychlé příkazy" icon={Zap} layout={layout}>
      <div className="jcc-quick">
        <button type="button" className="jcc-quick-btn" onClick={data.onBriefing} disabled={disabled}>
          <Sun {...SMALL} /> Ranní přehled
        </button>
        <button type="button" className="jcc-quick-btn" onClick={data.onNewConversation} disabled={data.busy}>
          <Plus {...SMALL} /> Nová konverzace
        </button>
        {data.canListen && (
          <button type="button" className="jcc-quick-btn" onClick={data.onTalk} disabled={disabled}>
            <Mic {...SMALL} /> Mluvit <kbd>Alt+M</kbd>
          </button>
        )}
        <button type="button" className="jcc-quick-btn" onClick={data.onCard} disabled={disabled}>
          <IdCard {...SMALL} /> Vizitka → kontakt
        </button>
        <button type="button" className="jcc-quick-btn" onClick={() => data.onUsePrompt('Exportuj moje aktivní zakázky do Excelu.', true)} disabled={disabled}>
          <Download {...SMALL} /> Export do Excelu
        </button>
      </div>
      {mine.length > 0 && (
        <div className="jcc-chips">
          {mine.map((prompt) => (
            <button key={prompt.id} type="button" className="jcc-chip" onClick={() => data.onUsePrompt(prompt.text, false)} title={prompt.text}>
              {prompt.title}
            </button>
          ))}
        </div>
      )}
    </Widget>
  );
}

function MemoryWidget({ data, layout, memories }: { data: CommandCenterData; layout: CommandLayout; memories: JarvisMemory[] | null }) {
  const on = memoryEnabled();
  return (
    <Widget id="memory" title="Paměť" icon={Database} layout={layout} badge={on ? memories?.length || undefined : 'vyp.'}>
      {!on && <p className="jcc-muted">Paměť je na tomto zařízení vypnutá.</p>}
      {on && memories?.length === 0 && <p className="jcc-muted">Zatím nic. Řekněte třeba „Pamatuj si, že chci odpovědi v bodech“.</p>}
      {on && memories && memories.length > 0 && (
        <ul className="jcc-memory">
          {memories.slice(-4).reverse().map((memory) => (
            <li key={memory.id}>{memory.text}</li>
          ))}
        </ul>
      )}
      <button type="button" className="jcc-link" onClick={() => data.onSection('memory')}>
        Spravovat paměť
      </button>
    </Widget>
  );
}

function UsageWidget({ data, layout }: { data: CommandCenterData; layout: CommandLayout }) {
  const [usage, setUsage] = useState<{ questions: number; costCzk: number; medianMs: number | null; weekCzk: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    analyticsApi
      .summary(7)
      .then((summary) => {
        if (cancelled) return;
        const today = summary.breakdown.byDay.at(-1);
        setUsage({
          questions: today?.questions ?? 0,
          costCzk: (today?.costUsd ?? 0) * summary.usdCzk,
          medianMs: summary.totals.medianMs,
          weekCzk: summary.totals.jarvisCostUsd * summary.usdCzk,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [data.busy]);
  return (
    <Widget id="usage" title="Využití dnes" icon={Activity} layout={layout} badge={usage ? formatCzk(usage.costCzk) : undefined}>
      {!usage && <p className="jcc-muted">Načítám…</p>}
      {usage && (
        <div className="jcc-stats">
          <span>
            <strong>{usage.questions}</strong>
            <small>otázek</small>
          </span>
          <span>
            <strong>{formatCzk(usage.costCzk)}</strong>
            <small>dnes</small>
          </span>
          <span>
            <strong>{usage.medianMs === null ? '—' : `${(usage.medianMs / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} s`}</strong>
            <small>medián</small>
          </span>
        </div>
      )}
      {usage && <p className="jcc-muted">Za 7 dní {formatCzk(usage.weekCzk)}.</p>}
      <button type="button" className="jcc-link" onClick={() => data.onSection('analysis')}>
        Analýza nákladů
      </button>
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// The columns
// ---------------------------------------------------------------------------

/**
 * How much room Velín has, measured on the element itself: under the app's
 * CSS zoom (and in a narrow window) media queries still see the real window,
 * so the columns follow the box's own width. wide = three columns, mid = one
 * side column, narrow = one column with the Chat / Přehled switch.
 */
export function useVelinWidth() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<'wide' | 'mid' | 'narrow'>(() =>
    typeof window === 'undefined' || window.innerWidth >= 1280 ? 'wide' : window.innerWidth > 768 ? 'mid' : 'narrow'
  );
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width <= 0) return;
      setMode(width >= 1040 ? 'wide' : width >= 680 ? 'mid' : 'narrow');
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { ref: setElement, mode };
}

/** The widgets of the given columns, in order, minus the hidden ones. */
export function CommandWidgets({ data, layout, columns }: { data: CommandCenterData; layout: CommandLayout; columns: Array<'left' | 'right'> }) {
  const visible = WIDGETS.filter(
    (widget) => columns.includes(widget.column) && !layout.layout.hidden.includes(widget.id) && (!widget.adminOnly || data.isAdmin)
  ).map((widget) => widget.id);
  const wantsMemory = visible.includes('memory') || visible.includes('core');
  const [memories, setMemories] = useState<JarvisMemory[] | null>(null);
  useEffect(() => {
    if (!wantsMemory) return undefined;
    let cancelled = false;
    jarvisApi
      .memories()
      .then((items) => !cancelled && setMemories(items))
      .catch(() => !cancelled && setMemories([]));
    return () => {
      cancelled = true;
    };
    // Re-read after every answer: Jarvis may have saved or dropped a note.
  }, [wantsMemory, data.busy]);
  const events = useTodayEvents(visible.includes('today'));

  if (visible.length === 0) return null;
  return (
    <>
      {visible.map((id) => {
        switch (id) {
          case 'core':
            return <CoreWidget key={id} data={data} layout={layout} memoryCount={memories ? memories.length : null} />;
          case 'conversations':
            return <ConversationsWidget key={id} data={data} layout={layout} />;
          case 'skills':
            return <SkillsWidget key={id} data={data} layout={layout} />;
          case 'services':
            return <ServicesWidget key={id} data={data} layout={layout} />;
          case 'feed':
            return <FeedWidget key={id} data={data} layout={layout} />;
          case 'today':
            return <TodayWidget key={id} data={data} layout={layout} events={events} />;
          case 'tasks':
            return <TasksWidget key={id} data={data} layout={layout} />;
          case 'quick':
            return <QuickWidget key={id} data={data} layout={layout} />;
          case 'memory':
            return <MemoryWidget key={id} data={data} layout={layout} memories={memories} />;
          case 'usage':
            return <UsageWidget key={id} data={data} layout={layout} />;
          default:
            return null;
        }
      })}
    </>
  );
}
