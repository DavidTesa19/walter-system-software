// The Jarvis screen (view id `jarvis`). A top bar with Jarvis's state, the
// sections (Velín, Konverzace, Schopnosti, Šablony, Paměť, Upozornění,
// Nastavení, Analýza for admins) and the time; below it the section. Velín is
// the command center: the chat with Jarvis's orb in the middle and widgets
// around it (JarvisCommandCenter.tsx), each foldable and hideable.
//
// JarvisPanel renders this (through a portal into App's page host) and owns
// all the state: the conversation running here is the same one the floating
// panel shows on every other screen.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowUpRight, Bookmark, Brain, Check, CornerDownLeft, Keyboard, Lock, PanelLeft, PanelRight, Pencil, Pin, PinOff, Plus,
  Search, SendHorizontal, Share2, ShieldCheck, SlidersHorizontal, Sun, Trash2, Users, X,
} from 'lucide-react';
import type { ConversationSummary, JarvisAttention, JarvisMemory, JarvisOpenAction, JarvisPrompt, JarvisPromptInput, JarvisStatus } from './jarvisApi';
import { jarvisApi } from './jarvisApi';
import { apiGet } from '../utils/api';
import { memoryEnabled, setMemoryEnabled } from './memorySettings';
import { CAPABILITIES, QUICK_EXAMPLES } from './capabilities';
import { MODEL_CHOICES } from './models';
import type { ModelChoice } from './models';
import JarvisOrb from './JarvisOrb';
import type { OrbState } from './JarvisOrb';
import { CommandWidgets, CustomizePanel, useCommandLayout, useVelinWidth } from './JarvisCommandCenter';
import type { CommandCenterData } from './JarvisCommandCenter';
import './JarvisWorkspace.css';
import './JarvisCommandCenter.css';

const JarvisAnalytics = lazy(() => import('./analytics/JarvisAnalytics'));

export type JarvisSection = 'chat' | 'conversations' | 'capabilities' | 'prompts' | 'memory' | 'attention' | 'settings' | 'analysis';

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
  unavailable,
  onUse,
  onSection,
  onBriefing,
  onTalk,
  canListen,
  orbState,
}: {
  userName: string | null;
  unavailable: boolean;
  onUse: (text: string, send: boolean) => void;
  onSection: (section: JarvisSection) => void;
  onBriefing: () => void;
  onTalk: () => void;
  canListen: boolean;
  orbState: OrbState;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 10 ? 'Dobré ráno' : hour < 18 ? 'Dobrý den' : 'Dobrý večer';
  return (
    <div className="jws-hero">
      <JarvisOrb size="hero" state={orbState} />
      <h1>
        {greeting}
        {userName ? `, ${userName}` : ''}
      </h1>
      <p>
        {unavailable
          ? 'Jarvis teď není dostupný: na serveru chybí klíč k Claude API.'
          : 'Zeptejte se na klienty, zakázky, kalendář nebo dokumenty, nebo mi dejte úkol. Změny dat jen navrhuji – provedou se, až je potvrdíte.'}
      </p>
      {canListen && (
        <button type="button" className="jws-talk" onClick={onTalk} disabled={unavailable} title="Mluvit s Jarvisem (Alt+M)">
          <span className="jws-talk-wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="jws-talk-text">
            <strong>Mluvit s Jarvisem</strong>
            <small>Alt+M · podržením mluvíte, puštěním odešlete</small>
          </span>
        </button>
      )}
      <div className="jws-hero-examples">
        <button type="button" className="jws-hero-example" onClick={onBriefing} disabled={unavailable}>
          <Sun {...SMALL} /> Ranní přehled
        </button>
        {QUICK_EXAMPLES.map(({ capability, example }) => {
          const Icon = capability.icon;
          return (
            <button key={example} type="button" className="jws-hero-example" onClick={() => onUse(example, true)} disabled={unavailable}>
              <Icon {...SMALL} /> {example}
            </button>
          );
        })}
      </div>
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
// Paměť
// ---------------------------------------------------------------------------

const MEMORY_LIMIT = 40;

function MemoryRow({ memory, onSave, onDelete }: { memory: JarvisMemory; onSave: (text: string) => Promise<boolean>; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.text);
  if (editing) {
    return (
      <form
        className="jws-memory jws-memory--editing"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await onSave(draft)) setEditing(false);
        }}
      >
        <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={300} autoFocus aria-label="Text poznámky" />
        <button type="submit" className="jws-btn jws-btn--sm jws-btn--primary" disabled={!draft.trim()}>
          Uložit
        </button>
        <button type="button" className="jws-btn jws-btn--sm" onClick={() => setEditing(false)}>
          Zrušit
        </button>
      </form>
    );
  }
  return (
    <div className="jws-memory">
      <Brain {...SMALL} className="jws-memory-icon" />
      <div className="jws-memory-main">
        <div className="jws-memory-text">{memory.text}</div>
        <div className="jws-memory-meta">
          {memory.source === 'jarvis' ? 'Uložil Jarvis' : 'Přidali jste vy'} · {new Date(memory.updatedAt).toLocaleDateString('cs-CZ')}
        </div>
      </div>
      <button type="button" className="jws-icon-btn" onClick={() => setEditing(true)} title="Upravit" aria-label="Upravit">
        <Pencil {...SMALL} />
      </button>
      <button type="button" className="jws-icon-btn jws-icon-btn--danger" onClick={onDelete} title="Zapomenout" aria-label="Zapomenout">
        <Trash2 {...SMALL} />
      </button>
    </div>
  );
}

function MemorySection() {
  const [memories, setMemories] = useState<JarvisMemory[] | null>(null);
  const [enabled, setEnabled] = useState(memoryEnabled);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    jarvisApi
      .memories()
      .then(setMemories)
      .catch(() => setMemories([]));
  }, []);

  const run = async <T,>(work: () => Promise<T>) => {
    setError(null);
    try {
      return await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Paměť se nepodařilo změnit.');
      return null;
    }
  };

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    const created = await run(() => jarvisApi.createMemory(text));
    if (created) {
      setMemories((items) => [...(items ?? []).filter((item) => item.id !== created.id), created]);
      setDraft('');
    }
  };

  return (
    <div className="jws-section">
      <header className="jws-section-head jws-section-head--row">
        <div>
          <h2>Paměť</h2>
          <p>
            Krátké poznámky o vás, které Jarvis dostane v každé konverzaci: jak chcete odpovědi, čím se podepisujete, na co se zaměřujete.
            Jarvis si je ukládá sám, když řeknete „pamatuj si…“; tady je můžete upravit nebo smazat.
          </p>
        </div>
        <div className="jws-toggle-row jws-toggle-row--compact">
          <span>{enabled ? 'Zapnutá' : 'Vypnutá'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Používat paměť"
            className={`jws-switch${enabled ? ' is-on' : ''}`}
            onClick={() => {
              setMemoryEnabled(!enabled);
              setEnabled(!enabled);
            }}
          >
            <span />
          </button>
        </div>
      </header>

      {!enabled && <p className="jws-callout">Paměť je na tomto zařízení vypnutá: Jarvis poznámky nevidí a nové si neukládá.</p>}

      <form
        className="jws-memory-add"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={300}
          placeholder="Např. Odpovídej stručně, bez tabulek. / Podepisuji se: Jan Novák, obchodní ředitel."
          aria-label="Nová poznámka"
        />
        <button type="submit" className="jws-btn jws-btn--primary" disabled={!draft.trim() || (memories?.length ?? 0) >= MEMORY_LIMIT}>
          <Plus {...SMALL} /> Přidat
        </button>
      </form>
      {error && <p className="jws-callout jws-callout--error">{error}</p>}

      {memories === null && <p className="jws-muted">Načítám…</p>}
      {memories !== null && memories.length === 0 && (
        <p className="jws-muted">Zatím nic. Řekněte Jarvisovi třeba „Pamatuj si, že chci odpovědi v bodech“.</p>
      )}
      <div className="jws-memory-list">
        {memories?.map((memory) => (
          <MemoryRow
            key={memory.id}
            memory={memory}
            onSave={async (text) => {
              const updated = await run(() => jarvisApi.updateMemory(memory.id, text));
              if (updated) setMemories((items) => (items ?? []).map((item) => (item.id === memory.id ? updated : item)));
              return Boolean(updated);
            }}
            onDelete={() =>
              void run(() => jarvisApi.deleteMemory(memory.id)).then((removed) => {
                if (removed) setMemories((items) => (items ?? []).filter((item) => item.id !== memory.id));
              })
            }
          />
        ))}
      </div>
      {memories && memories.length > 0 && (
        <p className="jws-muted">
          {memories.length} z {MEMORY_LIMIT} poznámek · soukromé, vidíte je jen vy.
        </p>
      )}
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

export interface JarvisWorkspaceProps {
  section: JarvisSection;
  onSection: (section: JarvisSection) => void;
  chat: ReactNode;
  busy: boolean;
  subtitle: string;
  orbState: OrbState;
  status: JarvisStatus | null;
  activeTools: string[];
  pendingCount: number;
  conversations: ConversationSummary[] | null;
  activeId: string | null;
  onNewConversation: () => void;
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onUpdateConversation: (id: string, patch: { title?: string; pinned?: boolean }) => void;
  urgent: number;
  attention: ReactNode;
  attentionData: JarvisAttention | null;
  onOpenRecord: (action: JarvisOpenAction) => void;
  onBriefing: () => void;
  onCard: () => void;
  onTalk: () => void;
  canListen: boolean;
  voiceLabel: string | null;
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
  userId: number | null;
  onOpenHelp?: () => void;
  onOpenView?: (view: 'tasks' | 'calendar') => void;
}

// The top bar's date and time, to the minute.
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const STATUS_TONE: Record<OrbState, string> = { idle: 'idle', busy: 'busy', listening: 'listening', speaking: 'busy', offline: 'offline' };

export default function JarvisWorkspace(props: JarvisWorkspaceProps) {
  const { section, onSection, isAdmin } = props;
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const layout = useCommandLayout();
  const velin = useVelinWidth();
  const wide = velin.mode === 'wide';
  const [customizing, setCustomizing] = useState(false);
  const [phoneView, setPhoneView] = useState<'chat' | 'widgets'>('chat');
  const now = useClock();

  useEffect(() => {
    if (section !== 'prompts' || names.size) return;
    apiGet<Array<{ id: number; username: string }>>('/api/team-users')
      .then((users) => setNames(new Map(users.map((user) => [user.id, user.username]))))
      .catch(() => undefined);
  }, [section, names.size]);

  const tabs: Array<{ id: JarvisSection; label: string; count?: number }> = [
    { id: 'chat', label: 'Velín' },
    { id: 'conversations', label: 'Konverzace' },
    { id: 'capabilities', label: 'Schopnosti' },
    { id: 'prompts', label: 'Šablony' },
    { id: 'memory', label: 'Paměť' },
    { id: 'attention', label: 'Upozornění', count: props.urgent || undefined },
    { id: 'settings', label: 'Nastavení' },
    ...(isAdmin ? [{ id: 'analysis' as const, label: 'Analýza' }] : []),
  ];

  const openConversation = (id: string) => {
    props.onOpenConversation(id);
    onSection('chat');
    setPhoneView('chat');
  };

  const data: CommandCenterData = {
    status: props.status,
    busy: props.busy,
    activeTools: props.activeTools,
    modelChoice: props.modelChoice,
    onModelChoice: props.onModelChoice,
    readAloud: props.readAloud,
    onToggleReadAloud: props.onToggleReadAloud,
    canSpeak: props.canSpeak,
    canListen: props.canListen,
    voiceLabel: props.voiceLabel,
    prompts: props.prompts,
    onUsePrompt: (text, send) => {
      setPhoneView('chat');
      props.onUsePrompt(text, send);
    },
    conversations: props.conversations,
    activeId: props.activeId,
    onOpenConversation: openConversation,
    onNewConversation: () => {
      props.onNewConversation();
      setPhoneView('chat');
    },
    attention: props.attentionData,
    onOpenRecord: props.onOpenRecord,
    onBriefing: () => {
      setPhoneView('chat');
      props.onBriefing();
    },
    pendingCount: props.pendingCount,
    onCard: props.onCard,
    onTalk: () => {
      setPhoneView('chat');
      props.onTalk();
    },
    onSection,
    onOpenView: props.onOpenView,
    isAdmin,
    userId: props.userId,
  };

  // Wide: widgets left and right. Narrower: one side column holding the
  // widgets of every column switched on (and on a phone, behind "Přehled").
  const { left, right } = layout.layout;
  const sideColumns: Array<'left' | 'right'> = wide ? (right ? ['right'] : []) : [...(left ? (['left'] as const) : []), ...(right ? (['right'] as const) : [])];
  const showLeft = wide && left;
  const showSide = sideColumns.length > 0;

  return (
    <div className="jws jws--cc">
      <header className="jcc-top">
        <div className="jcc-brand">
          <JarvisOrb size="mini" state={props.orbState} />
          <strong>Jarvis</strong>
          <span className={`jcc-status jcc-status--${STATUS_TONE[props.orbState]}`}>{props.subtitle}</span>
        </div>
        <nav className="jcc-tabs" aria-label="Části Jarvise">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`jcc-tab${section === tab.id ? ' is-on' : ''}`}
              onClick={() => onSection(tab.id)}
              aria-current={section === tab.id ? 'page' : undefined}
            >
              {tab.label}
              {tab.count ? <span className="jcc-tab-count">{tab.count}</span> : null}
            </button>
          ))}
        </nav>
        <div className="jcc-top-right">
          {wide && (
            <span className="jcc-clock" aria-label="Datum a čas">
              <span>{now.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })}</span>
              <strong>{now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</strong>
            </span>
          )}
          {section === 'chat' && (
            <>
              <button
                type="button"
                className={`jcc-tool-btn${left ? ' is-on' : ''}`}
                onClick={() => layout.toggleColumn('left')}
                aria-pressed={left}
                title={left ? 'Skrýt levý sloupec' : 'Ukázat levý sloupec'}
                aria-label="Levý sloupec"
              >
                <PanelLeft size={16} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className={`jcc-tool-btn${right ? ' is-on' : ''}`}
                onClick={() => layout.toggleColumn('right')}
                aria-pressed={right}
                title={right ? 'Skrýt pravý sloupec' : 'Ukázat pravý sloupec'}
                aria-label="Pravý sloupec"
              >
                <PanelRight size={16} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="jcc-btn jcc-btn--customize"
                onClick={() => setCustomizing((value) => !value)}
                aria-expanded={customizing}
                title="Přizpůsobit: které widgety a sloupce zobrazit"
                aria-label="Přizpůsobit"
              >
                <SlidersHorizontal size={15} strokeWidth={2} aria-hidden /> <span className="jcc-btn-label">Přizpůsobit</span>
              </button>
            </>
          )}
        </div>
      </header>

      <div className="jws-main">
        {/* Velín stays mounted behind the other sections: the chat inside it
            keeps a running answer and its scroll position. */}
        <div
          ref={velin.ref}
          className={`jcc jcc--${velin.mode}${showLeft ? ' jcc--left' : ''}${showSide ? ' jcc--right' : ''}`}
          hidden={section !== 'chat'}
          data-phone-view={phoneView}
        >
          <div className="jcc-phone-switch" role="group" aria-label="Zobrazit">
            <button type="button" className={phoneView === 'chat' ? 'is-on' : undefined} onClick={() => setPhoneView('chat')} aria-pressed={phoneView === 'chat'}>
              Chat
            </button>
            <button type="button" className={phoneView === 'widgets' ? 'is-on' : undefined} onClick={() => setPhoneView('widgets')} aria-pressed={phoneView === 'widgets'}>
              Přehled{props.urgent ? ` (${props.urgent})` : ''}
            </button>
          </div>
          {customizing && <CustomizePanel layout={layout} isAdmin={isAdmin} onClose={() => setCustomizing(false)} />}
          {showLeft && (
            <aside className="jcc-col" aria-label="Widgety vlevo">
              <CommandWidgets data={data} layout={layout} columns={['left']} />
            </aside>
          )}
          <div className="jcc-center">
            <div className="jws-chat">{props.chat}</div>
          </div>
          {showSide && (
            <aside className="jcc-col" aria-label="Widgety">
              <CommandWidgets data={data} layout={layout} columns={sideColumns} />
            </aside>
          )}
        </div>
        {section === 'conversations' && (
          <div className="jws-scroll">
            <div className="jws-section jws-section--convs">
              <header className="jws-section-head jws-section-head--row">
                <div>
                  <h2>Konverzace</h2>
                  <p>Všechny vaše konverzace s Jarvisem: hledání v názvech, připnutí nahoru, přejmenování a smazání.</p>
                </div>
                <button
                  type="button"
                  className="jws-btn jws-btn--primary"
                  onClick={() => {
                    props.onNewConversation();
                    onSection('chat');
                  }}
                  disabled={props.busy}
                >
                  <Plus {...SMALL} /> Nová konverzace
                </button>
              </header>
              <div className="jws-card jws-card--flush jws-conv-page">
                <ConversationList
                  conversations={props.conversations}
                  activeId={props.activeId}
                  busy={props.busy}
                  onOpen={openConversation}
                  onDelete={props.onDeleteConversation}
                  onUpdate={props.onUpdateConversation}
                />
              </div>
            </div>
          </div>
        )}
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
        {section === 'memory' && (
          <div className="jws-scroll">
            <MemorySection />
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
