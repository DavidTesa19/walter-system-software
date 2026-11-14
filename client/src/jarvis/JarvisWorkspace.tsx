// The Jarvis screen (view id `jarvis`): Jarvis with room to work. A rail on
// the left with the screen's sections and the user's conversations (search,
// pin, rename, delete), and the section itself on the right: the chat, what
// Jarvis can do, saved questions, reminders, settings and, for admins, the
// cost analysis.
//
// JarvisPanel renders this (through a portal into App's page host) and owns
// all the state: the conversation running here is the same one the floating
// panel shows on every other screen.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowUpRight, Bell, Bookmark, ChartColumnBig, Check, CornerDownLeft, Keyboard, Lock, MessagesSquare, Pencil, Pin, PinOff, Plus,
  Search, SendHorizontal, Settings2, Share2, ShieldCheck, Sparkles, Trash2, Users, X,
} from 'lucide-react';
import type { ConversationSummary, JarvisPrompt, JarvisPromptInput } from './jarvisApi';
import { apiGet } from '../utils/api';
import { CAPABILITIES, QUICK_EXAMPLES } from './capabilities';
import { MODEL_CHOICES } from './models';
import type { ModelChoice } from './models';
import './JarvisWorkspace.css';

const JarvisAnalytics = lazy(() => import('./analytics/JarvisAnalytics'));

export type JarvisSection = 'chat' | 'capabilities' | 'prompts' | 'attention' | 'settings' | 'analysis';

const ICON = { size: 16, strokeWidth: 1.9, 'aria-hidden': true } as const;
const SMALL = { size: 14, strokeWidth: 2, 'aria-hidden': true } as const;

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

const fold = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

function dateGroup(iso: string, now = new Date()) {
  const day = startOfDay(new Date(iso));
  const today = startOfDay(now);
  const diff = Math.round((today - day) / 86400000);
  if (diff <= 0) return 'Dnes';
  if (diff === 1) return 'Včera';
  if (diff < 7) return 'Posledních 7 dní';
  if (diff < 30) return 'Posledních 30 dní';
  return 'Starší';
}

const shortTime = (iso: string) => {
  const date = new Date(iso);
  const sameDay = startOfDay(date) === startOfDay(new Date());
  return sameDay
    ? date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
};

function ConversationItem({
  item,
  active,
  busy,
  onOpen,
  onDelete,
  onUpdate,
}: {
  item: ConversationSummary;
  active: boolean;
  busy: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onUpdate: (patch: { title?: string; pinned?: boolean }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title ?? '');
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const save = () => {
    const title = draft.replace(/\s+/g, ' ').trim();
    setEditing(false);
    if (title && title !== item.title) onUpdate({ title });
  };

  if (editing) {
    return (
      <form
        className="jws-conv jws-conv--editing"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          maxLength={120}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setDraft(item.title ?? '');
              setEditing(false);
            }
          }}
          aria-label="Název konverzace"
        />
      </form>
    );
  }

  return (
    <div className={`jws-conv${active ? ' is-active' : ''}`}>
      <button type="button" className="jws-conv-open" onClick={onOpen} disabled={busy && !active} title={item.title ?? undefined}>
        {item.pinned && <Pin {...SMALL} className="jws-conv-pin" />}
        <span className="jws-conv-title">{item.title || 'Bez názvu'}</span>
        <span className="jws-conv-time">{shortTime(item.updatedAt)}</span>
      </button>
      {confirming ? (
        <span className="jws-conv-actions is-visible">
          <button type="button" className="jws-icon-btn jws-icon-btn--danger" onClick={onDelete} title="Opravdu smazat" aria-label="Opravdu smazat">
            <Check {...SMALL} />
          </button>
          <button type="button" className="jws-icon-btn" onClick={() => setConfirming(false)} title="Nemazat" aria-label="Nemazat">
            <X {...SMALL} />
          </button>
        </span>
      ) : (
        <span className="jws-conv-actions">
          <button
            type="button"
            className="jws-icon-btn"
            onClick={() => onUpdate({ pinned: !item.pinned })}
            title={item.pinned ? 'Odepnout' : 'Připnout nahoru'}
            aria-label={item.pinned ? 'Odepnout' : 'Připnout nahoru'}
          >
            {item.pinned ? <PinOff {...SMALL} /> : <Pin {...SMALL} />}
          </button>
          <button
            type="button"
            className="jws-icon-btn"
            onClick={() => {
              setDraft(item.title ?? '');
              setEditing(true);
            }}
            title="Přejmenovat"
            aria-label="Přejmenovat"
          >
            <Pencil {...SMALL} />
          </button>
          <button
            type="button"
            className="jws-icon-btn jws-icon-btn--danger"
            onClick={() => setConfirming(true)}
            disabled={busy && active}
            title="Smazat konverzaci"
            aria-label="Smazat konverzaci"
          >
            <Trash2 {...SMALL} />
          </button>
        </span>
      )}
    </div>
  );
}

function ConversationList({
  conversations,
  activeId,
  busy,
  onOpen,
  onDelete,
  onUpdate,
}: {
  conversations: ConversationSummary[] | null;
  activeId: string | null;
  busy: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: { title?: string; pinned?: boolean }) => void;
}) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const needle = fold(query.trim());
    const items = (conversations ?? []).filter((item) => !needle || fold(item.title ?? '').includes(needle));
    const ordered: Array<{ label: string; items: ConversationSummary[] }> = [];
    const byLabel = new Map<string, ConversationSummary[]>();
    for (const item of items) {
      const label = item.pinned ? 'Připnuté' : dateGroup(item.updatedAt);
      if (!byLabel.has(label)) {
        byLabel.set(label, []);
        ordered.push({ label, items: byLabel.get(label) as ConversationSummary[] });
      }
      byLabel.get(label)?.push(item);
    }
    return ordered;
  }, [conversations, query]);

  return (
    <div className="jws-convs">
      <div className="jws-rail-heading">Konverzace</div>
      <label className="jws-search">
        <Search {...SMALL} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hledat v názvech…" aria-label="Hledat konverzace" />
        {query && (
          <button type="button" className="jws-icon-btn" onClick={() => setQuery('')} aria-label="Vymazat hledání">
            <X {...SMALL} />
          </button>
        )}
      </label>
      <div className="jws-conv-scroll">
        {conversations === null && <p className="jws-muted">Načítám…</p>}
        {conversations !== null && groups.length === 0 && (
          <p className="jws-muted">{query ? 'Nic nenalezeno.' : 'Zatím žádné konverzace. Zeptejte se na cokoli.'}</p>
        )}
        {groups.map((group) => (
          <div key={group.label} className="jws-conv-group">
            <div className="jws-conv-group-label">{group.label}</div>
            {group.items.map((item) => (
              <ConversationItem
                key={item.id}
                item={item}
                active={item.id === activeId}
                busy={busy}
                onOpen={() => onOpen(item.id)}
                onDelete={() => onDelete(item.id)}
                onUpdate={(patch) => onUpdate(item.id, patch)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home (the empty chat on this screen)
// ---------------------------------------------------------------------------

export function JarvisHome({
  userName,
  prompts,
  urgent,
  unavailable,
  onUse,
  onSection,
  onBriefing,
  onCard,
  voiceHint,
}: {
  userName: string | null;
  prompts: JarvisPrompt[] | null;
  urgent: number;
  unavailable: boolean;
  onUse: (text: string, send: boolean) => void;
  onSection: (section: JarvisSection) => void;
  onBriefing: () => void;
  onCard: () => void;
  voiceHint: boolean;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 10 ? 'Dobré ráno' : hour < 18 ? 'Dobrý den' : 'Dobrý večer';
  const mine = (prompts ?? []).slice(0, 6);
  return (
    <div className="jws-home">
      <div className="jws-home-hero">
        <span className="jws-home-mark" aria-hidden="true">
          <Sparkles size={26} strokeWidth={1.8} />
        </span>
        <h1>
          {greeting}
          {userName ? `, ${userName}` : ''}
        </h1>
        <p>
          Hledám v datech, kam máte přístup, v kalendáři, dokumentech, ARES i na webu. Změny jen navrhuji – provedou se, až je potvrdíte.
          {voiceHint && ' Ptát se můžete i hlasem (Alt+M).'}
        </p>
      </div>

      <div className="jws-home-actions">
        <button type="button" className="jws-home-action jws-home-action--primary" onClick={onBriefing} disabled={unavailable}>
          <Sparkles {...ICON} />
          <span>
            <strong>Ranní přehled</strong>
            <small>Co je po termínu, co dnes a co stojí</small>
          </span>
        </button>
        <button type="button" className="jws-home-action" onClick={() => onSection('attention')}>
          <Bell {...ICON} />
          <span>
            <strong>Upozornění{urgent > 0 ? ` (${urgent})` : ''}</strong>
            <small>{urgent > 0 ? 'Po termínu nebo na dnes' : 'Nic nehoří'}</small>
          </span>
        </button>
        <button type="button" className="jws-home-action" onClick={onCard} disabled={unavailable}>
          <Plus {...ICON} />
          <span>
            <strong>Vizitka → kontakt</strong>
            <small>Vyfoťte nebo nahrajte vizitku</small>
          </span>
        </button>
      </div>

      <div className="jws-home-grid">
        {QUICK_EXAMPLES.map(({ capability, example }) => {
          const Icon = capability.icon;
          return (
            <button key={example} type="button" className="jws-home-card" onClick={() => onUse(example, true)} disabled={unavailable}>
              <span className="jws-home-card-icon">
                <Icon {...ICON} />
              </span>
              <span className="jws-home-card-text">
                <small>{capability.title}</small>
                <span>{example}</span>
              </span>
              <SendHorizontal {...SMALL} className="jws-home-card-go" />
            </button>
          );
        })}
      </div>

      {mine.length > 0 && (
        <div className="jws-home-prompts">
          <div className="jws-rail-heading">Šablony</div>
          <div className="jws-chips">
            {mine.map((prompt) => (
              <button key={prompt.id} type="button" className="jws-chip" onClick={() => onUse(prompt.text, false)} title={prompt.text}>
                <Bookmark {...SMALL} />
                {prompt.title}
              </button>
            ))}
            <button type="button" className="jws-chip jws-chip--ghost" onClick={() => onSection('prompts')}>
              Všechny šablony
            </button>
          </div>
        </div>
      )}
      <button type="button" className="jws-link" onClick={() => onSection('capabilities')}>
        Co všechno Jarvis umí <ArrowUpRight {...SMALL} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schopnosti
// ---------------------------------------------------------------------------

function CapabilitiesSection({ onUse, onSave }: { onUse: (text: string, send: boolean) => void; onSave: (input: JarvisPromptInput) => void }) {
  return (
    <div className="jws-section">
      <header className="jws-section-head">
        <h2>Co Jarvis umí</h2>
        <p>Kliknutím na ukázku se otázka vloží do pole (šipkou ji rovnou odešlete). Otázky s „…“ doplňte.</p>
      </header>
      <div className="jws-cap-grid">
        {CAPABILITIES.map((capability) => {
          const Icon = capability.icon;
          return (
            <article key={capability.id} className="jws-card jws-cap">
              <div className="jws-cap-head">
                <span className="jws-cap-icon">
                  <Icon {...ICON} />
                </span>
                <div>
                  <h3>{capability.title}</h3>
                  <p>{capability.summary}</p>
                </div>
              </div>
              <ul className="jws-cap-points">
                {capability.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              {capability.examples.length > 0 && (
                <div className="jws-cap-examples">
                  {capability.examples.map((example) => {
                    const complete = !example.includes('…');
                    return (
                      <div key={example} className="jws-example">
                        <button type="button" className="jws-example-text" onClick={() => onUse(example.replace('…', '').trimEnd() + (complete ? '' : ' '), false)}>
                          {example}
                        </button>
                        <button
                          type="button"
                          className="jws-icon-btn"
                          onClick={() => onSave({ title: example.replace('…', '').trim().slice(0, 60), text: example.replace('…', '').trim() })}
                          title="Uložit do šablon"
                          aria-label="Uložit do šablon"
                        >
                          <Bookmark {...SMALL} />
                        </button>
                        {complete && (
                          <button type="button" className="jws-icon-btn jws-icon-btn--accent" onClick={() => onUse(example, true)} title="Rovnou odeslat" aria-label="Rovnou odeslat">
                            <SendHorizontal {...SMALL} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Šablony
// ---------------------------------------------------------------------------

function PromptForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: JarvisPrompt;
  onSubmit: (input: JarvisPromptInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [shared, setShared] = useState(initial?.shared ?? false);
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="jws-card jws-prompt-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        const ok = await onSubmit({ title: title.trim(), text: text.trim(), shared });
        setSaving(false);
        if (ok) onCancel();
      }}
    >
      <label className="jws-field">
        <span>Název</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="Např. Týdenní report" required autoFocus />
      </label>
      <label className="jws-field">
        <span>Otázka pro Jarvise</span>
        <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} rows={4} placeholder="Co má Jarvis udělat…" required />
      </label>
      <label className="jws-check">
        <input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />
        <span>Sdílet s týmem (kolegové ji uvidí v Týmových šablonách)</span>
      </label>
      <div className="jws-form-actions">
        <button type="button" className="jws-btn" onClick={onCancel}>
          Zrušit
        </button>
        <button type="submit" className="jws-btn jws-btn--primary" disabled={saving || !title.trim() || !text.trim()}>
          {saving ? 'Ukládám…' : 'Uložit šablonu'}
        </button>
      </div>
    </form>
  );
}

function PromptsSection({
  prompts,
  onUse,
  onCreate,
  onUpdate,
  onDelete,
  authorName,
}: {
  prompts: JarvisPrompt[] | null;
  onUse: (text: string, send: boolean) => void;
  onCreate: (input: JarvisPromptInput) => Promise<boolean>;
  onUpdate: (id: number, input: JarvisPromptInput) => Promise<boolean>;
  onDelete: (id: number) => void;
  authorName: (userId: number) => string;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const mine = (prompts ?? []).filter((prompt) => prompt.mine);
  const team = (prompts ?? []).filter((prompt) => !prompt.mine);

  const row = (prompt: JarvisPrompt) =>
    editingId === prompt.id ? (
      <PromptForm key={prompt.id} initial={prompt} onSubmit={(input) => onUpdate(prompt.id, input)} onCancel={() => setEditingId(null)} />
    ) : (
      <div key={prompt.id} className="jws-prompt">
        <div className="jws-prompt-main">
          <div className="jws-prompt-title">
            {prompt.title}
            {prompt.mine && prompt.shared && (
              <span className="jws-badge" title="Sdíleno s týmem">
                <Share2 size={11} strokeWidth={2.2} aria-hidden /> tým
              </span>
            )}
            {!prompt.mine && <span className="jws-prompt-author">{authorName(prompt.userId)}</span>}
          </div>
          <div className="jws-prompt-text">{prompt.text}</div>
        </div>
        <div className="jws-prompt-actions">
          <button type="button" className="jws-btn jws-btn--sm" onClick={() => onUse(prompt.text, false)} title="Vložit do pole a upravit">
            <CornerDownLeft {...SMALL} /> Vložit
          </button>
          <button type="button" className="jws-btn jws-btn--sm jws-btn--primary" onClick={() => onUse(prompt.text, true)} title="Rovnou odeslat">
            <SendHorizontal {...SMALL} /> Odeslat
          </button>
          {prompt.mine && (
            <>
              <button type="button" className="jws-icon-btn" onClick={() => setEditingId(prompt.id)} title="Upravit" aria-label="Upravit">
                <Pencil {...SMALL} />
              </button>
              <button type="button" className="jws-icon-btn jws-icon-btn--danger" onClick={() => onDelete(prompt.id)} title="Smazat" aria-label="Smazat">
                <Trash2 {...SMALL} />
              </button>
            </>
          )}
        </div>
      </div>
    );

  return (
    <div className="jws-section">
      <header className="jws-section-head jws-section-head--row">
        <div>
          <h2>Šablony</h2>
          <p>Otázky, které kladete často, pod krátkým názvem. Uložíte je i z konverzace (ikona záložky u otázky).</p>
        </div>
        {!creating && (
          <button type="button" className="jws-btn jws-btn--primary" onClick={() => setCreating(true)}>
            <Plus {...SMALL} /> Nová šablona
          </button>
        )}
      </header>
      {creating && <PromptForm onSubmit={onCreate} onCancel={() => setCreating(false)} />}
      {prompts === null && <p className="jws-muted">Načítám…</p>}
      <h3 className="jws-subhead">Moje šablony</h3>
      {prompts !== null && mine.length === 0 && <p className="jws-muted">Zatím žádné. Vytvořte první nebo si uložte ukázku ze Schopností.</p>}
      <div className="jws-prompt-list">{mine.map(row)}</div>
      <h3 className="jws-subhead">
        <Users {...SMALL} /> Týmové šablony
      </h3>
      {prompts !== null && team.length === 0 && <p className="jws-muted">Kolegové zatím žádnou šablonu nesdíleli.</p>}
      <div className="jws-prompt-list">{team.map(row)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nastavení
// ---------------------------------------------------------------------------

const SHORTCUTS: Array<[string, string]> = [
  ['Alt+J', 'Otevřít nebo zavřít panel Jarvise (na ostatních obrazovkách)'],
  ['Alt+M', 'Mluvit: klepnutí začne poslouchat, podržení = puštěním odešlete'],
  ['Alt+N', 'Nová konverzace'],
  ['Enter / Shift+Enter', 'Odeslat / nový řádek'],
  ['Ctrl+V', 'Vložit obrázek nebo soubor jako přílohu'],
  ['Esc', 'Zastavit nahrávání, čtení nebo odpověď'],
];

function SettingsSection({
  modelChoice,
  onModelChoice,
  readAloud,
  onToggleReadAloud,
  canSpeak,
  voiceSettings,
  onOpenHelp,
}: {
  modelChoice: ModelChoice;
  onModelChoice: (value: ModelChoice) => void;
  readAloud: boolean;
  onToggleReadAloud: () => void;
  canSpeak: boolean;
  voiceSettings: ReactNode;
  onOpenHelp?: () => void;
}) {
  return (
    <div className="jws-section">
      <header className="jws-section-head">
        <h2>Nastavení</h2>
        <p>Platí pro tento prohlížeč, na této obrazovce i v plovoucím panelu.</p>
      </header>

      <section className="jws-card">
        <h3 className="jws-card-title">Model</h3>
        <p className="jws-card-note">Auto vybírá model podle otázky; ruční volba platí pro všechny další otázky.</p>
        <div className="jws-models" role="radiogroup" aria-label="Model">
          {MODEL_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={modelChoice === choice.value}
              className={`jws-model${modelChoice === choice.value ? ' is-on' : ''}`}
              onClick={() => onModelChoice(choice.value)}
            >
              <strong>{choice.label}</strong>
              <span>{choice.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {canSpeak && (
        <section className="jws-card">
          <div className="jws-toggle-row">
            <div>
              <h3 className="jws-card-title">Číst odpovědi nahlas</h3>
              <p className="jws-card-note">Odpovědi na mluvené otázky se čtou vždy; tohle zapne čtení i u psaných.</p>
            </div>
            <button type="button" role="switch" aria-checked={readAloud} className={`jws-switch${readAloud ? ' is-on' : ''}`} onClick={onToggleReadAloud}>
              <span />
            </button>
          </div>
        </section>
      )}

      {voiceSettings && (
        <section className="jws-card jws-card--voice">
          <h3 className="jws-card-title">Hlas a mikrofon</h3>
          {voiceSettings}
        </section>
      )}

      <section className="jws-card">
        <h3 className="jws-card-title">
          <Keyboard {...SMALL} /> Klávesové zkratky
        </h3>
        <dl className="jws-shortcuts">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
        {onOpenHelp && (
          <button type="button" className="jws-link" onClick={onOpenHelp}>
            Všechny zkratky aplikace <ArrowUpRight {...SMALL} />
          </button>
        )}
      </section>

      <section className="jws-card">
        <h3 className="jws-card-title">
          <ShieldCheck {...SMALL} /> Data a bezpečnost
        </h3>
        <ul className="jws-cap-points">
          <li>Jarvis vidí jen sekce a záznamy, ke kterým máte přístup vy, a pracuje přes stejné rozhraní jako aplikace.</li>
          <li>Nic nezmění bez vašeho potvrzení; každá změna je v historii změn se značkou AI.</li>
          <li>
            <Lock size={12} strokeWidth={2.2} aria-hidden /> Konverzace jsou soukromé – vidíte je jen vy. Přílohy se po 90 dnech mažou.
          </li>
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

interface NavItem {
  id: JarvisSection;
  label: string;
  icon: ReactNode;
  count?: number;
}

export interface JarvisWorkspaceProps {
  section: JarvisSection;
  onSection: (section: JarvisSection) => void;
  chat: ReactNode;
  busy: boolean;
  subtitle: string;
  conversations: ConversationSummary[] | null;
  activeId: string | null;
  onNewConversation: () => void;
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onUpdateConversation: (id: string, patch: { title?: string; pinned?: boolean }) => void;
  urgent: number;
  attention: ReactNode;
  prompts: JarvisPrompt[] | null;
  onCreatePrompt: (input: JarvisPromptInput) => Promise<boolean>;
  onUpdatePrompt: (id: number, input: JarvisPromptInput) => Promise<boolean>;
  onDeletePrompt: (id: number) => void;
  onUsePrompt: (text: string, send: boolean) => void;
  modelChoice: ModelChoice;
  onModelChoice: (value: ModelChoice) => void;
  readAloud: boolean;
  onToggleReadAloud: () => void;
  canSpeak: boolean;
  voiceSettings: ReactNode;
  isAdmin: boolean;
  onOpenHelp?: () => void;
}

export default function JarvisWorkspace(props: JarvisWorkspaceProps) {
  const { section, onSection, isAdmin } = props;
  const [names, setNames] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    if (section !== 'prompts' || names.size) return;
    apiGet<Array<{ id: number; username: string }>>('/api/team-users')
      .then((users) => setNames(new Map(users.map((user) => [user.id, user.username]))))
      .catch(() => undefined);
  }, [section, names.size]);

  const nav: NavItem[] = [
    { id: 'chat', label: 'Konverzace', icon: <MessagesSquare {...ICON} /> },
    { id: 'capabilities', label: 'Schopnosti', icon: <Sparkles {...ICON} /> },
    { id: 'prompts', label: 'Šablony', icon: <Bookmark {...ICON} />, count: props.prompts?.filter((prompt) => prompt.mine).length },
    { id: 'attention', label: 'Upozornění', icon: <Bell {...ICON} />, count: props.urgent || undefined },
    { id: 'settings', label: 'Nastavení', icon: <Settings2 {...ICON} /> },
    ...(isAdmin ? [{ id: 'analysis' as const, label: 'Analýza nákladů', icon: <ChartColumnBig {...ICON} /> }] : []),
  ];

  const openConversation = (id: string) => {
    props.onOpenConversation(id);
    onSection('chat');
  };

  return (
    <div className="jws">
      <aside className="jws-rail" aria-label="Jarvis">
        <div className="jws-brand">
          <span className="jws-brand-mark" aria-hidden="true">
            <Sparkles size={17} strokeWidth={2} />
          </span>
          <span className="jws-brand-text">
            <strong>Jarvis</strong>
            <small>{props.subtitle}</small>
          </span>
        </div>
        <button
          type="button"
          className="jws-new"
          onClick={() => {
            props.onNewConversation();
            onSection('chat');
          }}
          disabled={props.busy}
          title="Nová konverzace (Alt+N)"
        >
          <Plus size={16} strokeWidth={2.2} aria-hidden />
          <span>Nová konverzace</span>
          <kbd>Alt+N</kbd>
        </button>
        <nav className="jws-nav">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`jws-nav-item${section === item.id ? ' is-active' : ''}`}
              onClick={() => onSection(item.id)}
              aria-current={section === item.id ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.count ? <span className={`jws-count${item.id === 'attention' ? ' jws-count--alert' : ''}`}>{item.count}</span> : null}
            </button>
          ))}
        </nav>
        <ConversationList
          conversations={props.conversations}
          activeId={props.activeId}
          busy={props.busy}
          onOpen={openConversation}
          onDelete={props.onDeleteConversation}
          onUpdate={props.onUpdateConversation}
        />
      </aside>

      <div className="jws-main">
        {/* The chat stays mounted behind the other sections, so a running
            answer and the scroll position survive a look at the settings. */}
        <div className="jws-chat" hidden={section !== 'chat'}>
          {props.chat}
        </div>
        {section === 'capabilities' && (
          <div className="jws-scroll">
            <CapabilitiesSection onUse={props.onUsePrompt} onSave={(input) => void props.onCreatePrompt(input)} />
          </div>
        )}
        {section === 'prompts' && (
          <div className="jws-scroll">
            <PromptsSection
              prompts={props.prompts}
              onUse={props.onUsePrompt}
              onCreate={props.onCreatePrompt}
              onUpdate={props.onUpdatePrompt}
              onDelete={props.onDeletePrompt}
              authorName={(userId) => names.get(userId) ?? `Kolega ${userId}`}
            />
          </div>
        )}
        {section === 'attention' && (
          <div className="jws-scroll">
            <div className="jws-section">
              <header className="jws-section-head">
                <h2>Upozornění</h2>
                <p>Vaše zakázky po termínu, s termínem do 3 dnů nebo 30 dní beze změny a úkoly na dnes. Kliknutím otevřete záznam.</p>
              </header>
              <div className="jws-card jws-card--flush">{props.attention}</div>
            </div>
          </div>
        )}
        {section === 'settings' && (
          <div className="jws-scroll">
            <SettingsSection
              modelChoice={props.modelChoice}
              onModelChoice={props.onModelChoice}
              readAloud={props.readAloud}
              onToggleReadAloud={props.onToggleReadAloud}
              canSpeak={props.canSpeak}
              voiceSettings={props.voiceSettings}
              onOpenHelp={props.onOpenHelp}
            />
          </div>
        )}
        {section === 'analysis' && isAdmin && (
          <div className="jws-scroll">
            <Suspense fallback={<p className="jws-muted jws-pad">Načítám…</p>}>
              <JarvisAnalytics />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
