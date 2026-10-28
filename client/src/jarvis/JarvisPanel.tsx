import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MarkdownMessage from '../components/MarkdownMessage';
import { jarvisApi } from './jarvisApi';
import type {
  AttentionItem,
  AttentionKind,
  AttachmentKind,
  AttachmentSummary,
  CalendarDecision,
  JarvisCalendarCard,
  ConversationSummary,
  JarvisEmailDraft,
  JarvisAttention,
  JarvisEvent,
  JarvisOpenAction,
  JarvisStatus,
  JarvisProposal,
  JarvisVoiceOption,
  ProposalDecision,
  TranscriptItem,
} from './jarvisApi';
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, formatSize, namePastedImage, shrinkImage } from './attachmentFiles';
import { useJarvisVoice } from './useJarvisVoice';
import { announceCalendarChange } from './calendarEvents';
import { TASKS_CHANGED_EVENT } from '../tasks/tasksApi';
import { PAUSE_OPTIONS, SPEED_OPTIONS, formatSpeed, loadVoiceSettings, saveVoiceSettings } from './voiceSettings';
import type { VoiceSettings } from './voiceSettings';
import { useJarvisFocus } from './jarvisFocus';
import type { JarvisFocus } from './jarvisFocus';
import { isConversationEnd, unlockAudio } from './voice';
import './JarvisPanel.css';

const CONVERSATION_KEY = 'walterJarvisConversation';
// Read answers to typed questions aloud too (spoken ones always are).
const READ_ALOUD_KEY = 'walterJarvisReadAloud';

// The system prompt's <prehled> rules answer exactly this message.
const BRIEFING_PROMPT = 'Připrav mi ranní přehled na dnešek.';
const BRIEFING_SUGGESTION = 'Ranní přehled';
// Reminders are rechecked this often while the app is open (the server
// caches them for five minutes).
const ATTENTION_REFRESH_MS = 10 * 60 * 1000;

const SUGGESTIONS = [
  BRIEFING_SUGGESTION,
  'Co mám tento týden?',
  'Co víme o klientovi …?',
  'Které zakázky nemají odpovědnou osobu?',
  'Kolik máme aktivních partnerů podle oboru?',
];

// With a profile open, the openers are about that record.
const focusSuggestions = (focus: JarvisFocus) =>
  focus.commission
    ? ['Shrň mi tuto zakázku', 'S kým je tato zakázka propojená?', 'Co víme o subjektu této zakázky?']
    : ['Shrň mi, co víme o tomto subjektu', 'Jaké má zakázky a v jakém jsou stavu?', 'Co je v jeho dokumentech?'];

const readStored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStored = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Remembering the conversation is a convenience only.
  }
};

const relativeTime = (value: string) => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'právě teď';
  if (minutes < 60) return `před ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `před ${hours} h`;
  return new Date(value).toLocaleDateString('cs-CZ');
};

interface Turn {
  question: TranscriptItem & { type: 'question' };
  steps: Array<TranscriptItem & ({ type: 'tool' } | { type: 'note' })>;
  answer: string | null;
  notices: string[];
  actions: JarvisOpenAction[];
  proposals: JarvisProposal[];
  calendar: JarvisCalendarCard[];
  emails: JarvisEmailDraft[];
}

// The flat transcript, grouped into one block per question.
function groupTurns(items: TranscriptItem[]): Turn[] {
  const turns: Turn[] = [];
  for (const item of items) {
    if (item.type === 'question') {
      turns.push({ question: item, steps: [], answer: null, notices: [], actions: [], proposals: [], calendar: [], emails: [] });
      continue;
    }
    const turn = turns[turns.length - 1];
    if (!turn) continue;
    if (item.type === 'tool' || item.type === 'note') turn.steps.push(item);
    else if (item.type === 'answer') turn.answer = turn.answer ? `${turn.answer}\n\n${item.text}` : item.text;
    else if (item.type === 'notice') turn.notices.push(item.text);
    else if (item.type === 'action') turn.actions.push(item.action);
    else if (item.type === 'proposal') turn.proposals.push(item.proposal);
    else if (item.type === 'calendar') turn.calendar.push(item.card);
    else if (item.type === 'email') turn.emails.push(item.draft);
  }
  return turns;
}

interface LiveTurn {
  question: string;
  voice: boolean;
  attachments: AttachmentSummary[];
  proposals: JarvisProposal[];
  calendar: JarvisCalendarCard[];
  emails: JarvisEmailDraft[];
  steps: Array<{ id: string; label: string; done: boolean; ok: boolean }>;
  text: string;
  thinking: string;
  actions: JarvisOpenAction[];
  notices: string[];
}

// A file being attached to the next message: uploading, ready (with the id to
// send), or refused.
interface PendingAttachment {
  key: string;
  name: string;
  size: number;
  kind?: AttachmentKind;
  status: 'uploading' | 'ready' | 'error';
  id?: string;
  error?: string;
  preview?: string;
}

const kindOfFile = (file: File): AttachmentKind =>
  file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? 'pdf' : 'text';

const DECISION_TEXT: Record<ProposalDecision['status'], string> = {
  applied: 'Provedeno',
  rejected: 'Zamítnuto',
  stale: 'Neprovedeno – záznam se mezitím změnil',
  failed: 'Nepodařilo se provést',
};

// A change Jarvis proposes: what it would change, and the user's decision.
function ProposalCard({
  proposal,
  decision,
  deciding,
  disabled,
  onDecide,
}: {
  proposal: JarvisProposal;
  decision?: ProposalDecision;
  deciding: boolean;
  disabled: boolean;
  onDecide: (decision: 'apply' | 'reject') => void;
}) {
  const state = decision?.status ?? 'pending';
  return (
    <div className={`jarvis-proposal jarvis-proposal--${state}`}>
      <div className="jarvis-proposal-head">
        <span className="jarvis-proposal-badge">{proposal.type === 'note' ? 'Nová poznámka' : 'Návrh změny'}</span>
        <strong>{proposal.label}</strong>
        <small>{proposal.where}</small>
      </div>
      {proposal.changes && proposal.changes.length > 0 && (
        <dl className="jarvis-proposal-changes">
          {proposal.changes.map((change) => (
            <div key={change.field} className="jarvis-proposal-change">
              <dt>{change.label}</dt>
              <dd>
                <span className="jarvis-proposal-from">{change.fromText}</span>
                <span className="jarvis-proposal-arrow" aria-label="změnit na">→</span>
                <span className="jarvis-proposal-to">{change.toText}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {proposal.note && <p className="jarvis-proposal-note">{proposal.note}</p>}
      {proposal.reason && <p className="jarvis-proposal-reason">{proposal.reason}</p>}
      {decision ? (
        <div className={`jarvis-proposal-status jarvis-proposal-status--${decision.status}`}>
          {decision.status === 'applied' ? '✓ ' : ''}
          {DECISION_TEXT[decision.status]}
          {decision.error && decision.status !== 'rejected' ? `: ${decision.error}` : ''}
        </div>
      ) : (
        <div className="jarvis-proposal-buttons">
          <button type="button" className="jarvis-proposal-apply" onClick={() => onDecide('apply')} disabled={disabled || deciding}>
            {deciding ? 'Provádím…' : 'Potvrdit'}
          </button>
          <button type="button" className="jarvis-proposal-reject" onClick={() => onDecide('reject')} disabled={disabled || deciding}>
            Zamítnout
          </button>
          {disabled && !deciding && <small>Potvrdit půjde, až Jarvis dopíše odpověď.</small>}
        </div>
      )}
    </div>
  );
}

const CALENDAR_BADGE: Record<JarvisCalendarCard['action'], string> = {
  create: 'Přidáno do kalendáře',
  update: 'Upraveno v kalendáři',
  delete: 'Smazat z kalendáře?',
};

const CALENDAR_STATUS_TEXT: Record<CalendarDecision['status'], string> = {
  undone: 'Vráceno zpět',
  deleted: 'Smazáno',
  kept: 'Ponecháno',
  restored: 'Obnoveno',
  changed: 'Nezměněno',
  gone: 'Událost už v kalendáři není',
  failed: 'Nepodařilo se',
};

// A calendar change: added or edited (with undo), or a deletion waiting for
// the user's click (and undoable after it).
function CalendarCard({
  card,
  decision,
  busy,
  disabled,
  onAction,
}: {
  card: JarvisCalendarCard;
  decision?: CalendarDecision;
  busy: boolean;
  disabled: boolean;
  onAction: (action: 'undo' | 'confirm' | 'keep') => void;
}) {
  const state = decision?.status ?? (card.action === 'delete' ? 'pending' : 'done');
  const canUndo = state === 'done' || state === 'deleted';
  return (
    <div className={`jarvis-calendar-card jarvis-calendar-card--${card.action} jarvis-calendar-card--${state}`}>
      <div className="jarvis-proposal-head">
        <span className="jarvis-proposal-badge">{CALENDAR_BADGE[card.action]}</span>
        <strong>{card.title}</strong>
      </div>
      {card.changes && card.changes.length > 0 ? (
        <dl className="jarvis-proposal-changes">
          {card.changes.map((change) => (
            <div key={change.label} className="jarvis-proposal-change">
              <dt>{change.label}</dt>
              <dd>
                <span className="jarvis-proposal-from">{change.fromText}</span>
                <span className="jarvis-proposal-arrow" aria-label="změněno na">→</span>
                <span className="jarvis-proposal-to">{change.toText}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="jarvis-calendar-when">{card.when}</div>
      )}
      {card.overlaps && card.overlaps.length > 0 && (
        <div className="jarvis-calendar-overlap">Překrývá se s: {card.overlaps.join(', ')}</div>
      )}
      {card.reason && <p className="jarvis-proposal-reason">{card.reason}</p>}
      <div className="jarvis-proposal-buttons">
        {decision && decision.status !== 'deleted' && (
          <span className={`jarvis-proposal-status jarvis-calendar-status--${decision.status}`}>
            {CALENDAR_STATUS_TEXT[decision.status]}
            {decision.error ? ` – ${decision.error}` : ''}
          </span>
        )}
        {state === 'deleted' && <span className="jarvis-proposal-status jarvis-calendar-status--deleted">Smazáno</span>}
        {state === 'pending' && (
          <>
            <button type="button" className="jarvis-calendar-delete" onClick={() => onAction('confirm')} disabled={disabled || busy}>
              {busy ? 'Mažu…' : 'Smazat'}
            </button>
            <button type="button" className="jarvis-proposal-reject" onClick={() => onAction('keep')} disabled={disabled || busy}>
              Ponechat
            </button>
          </>
        )}
        {canUndo && (
          <button type="button" className="jarvis-calendar-undo" onClick={() => onAction('undo')} disabled={disabled || busy}>
            {busy ? 'Vracím…' : state === 'deleted' ? 'Vrátit zpět (obnovit)' : 'Vrátit zpět'}
          </button>
        )}
        {disabled && !busy && state === 'pending' && <small>Smazat půjde, až Jarvis dopíše odpověď.</small>}
      </div>
    </div>
  );
}

// Long mailto: links are cut off by some mail programs; past this the text
// goes to the clipboard instead and the user pastes it.
const MAILTO_LIMIT = 1800;

// An e-mail Jarvis drafted. Jarvis never sends it: the user edits it here and
// sends it from their own mail program.
function EmailCard({ draft, onOpenRecord }: { draft: JarvisEmailDraft; onOpenRecord: (action: JarvisOpenAction) => void }) {
  const [to, setTo] = useState(draft.to.join(', '));
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [hint, setHint] = useState<string | null>(null);
  const cc = draft.cc.join(', ');
  const recipients = to.split(/[,;]\s*/).map((item) => item.trim()).filter(Boolean).join(',');

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setHint(done);
    } catch {
      setHint('Kopírování se nepodařilo – označte text a zkopírujte ho ručně.');
    }
  };
  const query = (fields: Record<string, string>) =>
    Object.entries(fields).filter(([, value]) => value).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  const openMailto = async () => {
    const full = `mailto:${recipients}?${query({ cc, subject, body })}`;
    if (full.length <= MAILTO_LIMIT) {
      window.location.href = full;
      return;
    }
    await copy(body, 'Text je ve schránce – v novém e-mailu ho vložte Ctrl+V.');
    window.location.href = `mailto:${recipients}?${query({ cc, subject })}`;
  };
  const openWeb = (url: string) => window.open(url, '_blank', 'noopener');

  return (
    <div className="jarvis-email">
      <div className="jarvis-proposal-head">
        <span className="jarvis-proposal-badge">Koncept e-mailu</span>
        <small>Jarvis nic neodesílá – odešlete ho sami ze své pošty.</small>
      </div>
      <label className="jarvis-email-field">
        <span>Komu</span>
        <input value={to} onChange={(event) => setTo(event.target.value)} placeholder="adresa@firma.cz" />
      </label>
      {cc && (
        <div className="jarvis-email-field">
          <span>Kopie</span>
          <span>{cc}</span>
        </div>
      )}
      <label className="jarvis-email-field">
        <span>Předmět</span>
        <input value={subject} onChange={(event) => setSubject(event.target.value)} />
      </label>
      <textarea className="jarvis-email-body" value={body} onChange={(event) => setBody(event.target.value)} rows={Math.min(14, body.split('\n').length + 2)} />
      <div className="jarvis-proposal-buttons">
        <button type="button" className="jarvis-proposal-apply" onClick={() => void openMailto()}>
          Otevřít v e-mailu
        </button>
        <button
          type="button"
          className="jarvis-proposal-reject"
          onClick={() => openWeb(`https://mail.google.com/mail/?view=cm&fs=1&${query({ to: recipients, cc, su: subject, body })}`)}
        >
          Gmail
        </button>
        <button
          type="button"
          className="jarvis-proposal-reject"
          onClick={() => openWeb(`https://outlook.office.com/mail/deeplink/compose?${query({ to: recipients, cc, subject, body })}`)}
        >
          Outlook
        </button>
        <button type="button" className="jarvis-proposal-reject" onClick={() => void copy(body, 'Text e-mailu je zkopírovaný.')}>
          Kopírovat text
        </button>
        {draft.related && (
          <button type="button" className="jarvis-action" onClick={() => onOpenRecord(draft.related as JarvisOpenAction)}>
            Otevřít · {draft.related.label}
          </button>
        )}
      </div>
      {hint && <small className="jarvis-email-hint">{hint}</small>}
    </div>
  );
}

const ATTENTION_LABELS: Record<AttentionKind, string> = {
  overdue: 'Po termínu',
  today: 'Dnes',
  task: 'Úkol',
  soon: 'Brzy',
  stale: 'Beze změny',
};

// What needs the user's attention, with a way to each record and to the
// day's overview.
function AttentionList({
  attention,
  onOpenRecord,
  onBriefing,
  disabled,
}: {
  attention: JarvisAttention | null;
  onOpenRecord: (action: JarvisOpenAction) => void;
  onBriefing: () => void;
  disabled: boolean;
}) {
  const items: AttentionItem[] = attention?.items ?? [];
  return (
    <div className="jarvis-attention">
      {attention === null && <p className="jarvis-muted">Načítám…</p>}
      {attention !== null && items.length === 0 && <p className="jarvis-muted">Nic nehoří – žádné zakázky po termínu ani úkoly na dnes.</p>}
      {items.map((item, index) => {
        const content = (
          <>
            <span className={`jarvis-attention-kind jarvis-attention-kind--${item.kind}`}>{ATTENTION_LABELS[item.kind]}</span>
            <span className="jarvis-attention-text">
              <span>{item.label}</span>
              <small>{item.detail}</small>
            </span>
          </>
        );
        const action = item.action;
        return action ? (
          <button key={index} type="button" className="jarvis-attention-item" onClick={() => onOpenRecord(action)} title="Otevřít záznam">
            {content}
          </button>
        ) : (
          <div key={index} className="jarvis-attention-item">
            {content}
          </div>
        );
      })}
      <button type="button" className="jarvis-attention-briefing" onClick={onBriefing} disabled={disabled}>
        Připravit ranní přehled
      </button>
    </div>
  );
}

// The attachments of a sent question, under its text.
function QuestionAttachments({ attachments }: { attachments?: AttachmentSummary[] }) {
  if (!attachments?.length) return null;
  return (
    <span className="jarvis-question-files">
      {attachments.map((attachment, index) => (
        <span key={index} className="jarvis-question-file" title={attachment.name}>
          {attachment.kind === 'image' ? Icon.image : Icon.file}
          <span>{attachment.name}</span>
        </span>
      ))}
    </span>
  );
}

// Jarvis's mark: a sparkle on the theme's gradient, the same on the floating
// launcher and in the panel header.
function SparkIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.8c.5 3.9 1.6 6.1 3.2 7.6 1.6 1.4 3.6 2.1 6 2.4-2.4.4-4.4 1-6 2.4-1.6 1.5-2.7 3.7-3.2 7.6-.5-3.9-1.6-6.1-3.2-7.6-1.6-1.4-3.6-2-6-2.4 2.4-.3 4.4-1 6-2.4 1.6-1.5 2.7-3.7 3.2-7.6Z"
        fill="currentColor"
      />
      <path
        d="M19 2.5c.2 1.3.6 2 1.1 2.4.5.4 1.1.6 1.9.7-.8.1-1.4.3-1.9.7-.5.4-.9 1.1-1.1 2.4-.2-1.3-.6-2-1.1-2.4-.5-.4-1.1-.6-1.9-.7.8-.1 1.4-.3 1.9-.7.5-.4.9-1.1 1.1-2.4Z"
        fill="currentColor"
        opacity="0.75"
      />
    </svg>
  );
}

function JarvisMark({ busy = false, large = false }: { busy?: boolean; large?: boolean }) {
  return (
    <span className={`jarvis-mark${large ? ' jarvis-mark--large' : ''}${busy ? ' jarvis-mark--busy' : ''}`} aria-hidden="true">
      <SparkIcon size={large ? 26 : 18} />
    </span>
  );
}

const Icon = {
  history: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  plus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  close: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  trash: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  ),
  send: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
  stop: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="3" />
    </svg>
  ),
  mic: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  ),
  tune: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  ),
  clip: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21 11-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6L15.9 6.3" />
    </svg>
  ),
  file: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </svg>
  ),
  image: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 16-5-5-9 9" />
    </svg>
  ),
  record: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  ),
  micSmall: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  ),
  speaker: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  ),
  speakerOff: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="m16 9 5 6M21 9l-5 6" />
    </svg>
  ),
  bell: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  speakerSmall: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  ),
};

// Five bars that follow the microphone's loudness. They read the level from a
// ref on their own animation frame, so the panel itself does not re-render.
function LevelMeter({ levelRef }: { levelRef: { current: number } }) {
  const barsRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const shape = [0.55, 0.8, 1, 0.8, 0.55];
    let frame = 0;
    const draw = () => {
      const bars = barsRef.current?.children;
      if (bars) {
        for (let index = 0; index < bars.length; index += 1) {
          const scale = Math.max(0.18, Math.min(1, levelRef.current * shape[index] * 1.4));
          (bars[index] as HTMLElement).style.transform = `scaleY(${scale})`;
        }
      }
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [levelRef]);
  return (
    <span className="jarvis-meter" ref={barsRef} aria-hidden="true">
      <i /><i /><i /><i /><i />
    </span>
  );
}

function ReadAloudButton({ reading, onRead, onStop }: { reading: boolean; onRead: () => void; onStop: () => void }) {
  return (
    <button
      type="button"
      className={`jarvis-read${reading ? ' jarvis-read--active' : ''}`}
      onClick={reading ? onStop : onRead}
      title={reading ? 'Zastavit čtení' : 'Přečíst nahlas'}
    >
      {reading ? Icon.stop : Icon.speakerSmall}
      <span>{reading ? 'Zastavit' : 'Přečíst'}</span>
    </button>
  );
}

const VOICE_SAMPLE =
  'Dobrý den, tady Jarvis. Takhle zním, když čtu odpovědi. Klient Software House má jednu aktivní zakázku s termínem do konce měsíce.';

const VOICE_GROUPS: Array<{ gender: JarvisVoiceOption['gender']; title: string }> = [
  { gender: 'female', title: 'Ženské hlasy' },
  { gender: 'male', title: 'Mužské hlasy' },
  { gender: 'neutral', title: 'Neutrální' },
];

// How Jarvis sounds and when a spoken question goes off. Kept per browser.
function VoiceSettingsPanel({
  settings,
  status,
  onChange,
  previewing,
  onPreview,
  onStopPreview,
}: {
  settings: VoiceSettings;
  status: JarvisStatus | null;
  onChange: (patch: Partial<VoiceSettings>) => void;
  previewing: boolean;
  onPreview: () => void;
  onStopPreview: () => void;
}) {
  const engines = status?.voice ? status.engines ?? [] : [];
  const engine = engines.find((item) => item.id === settings.engine) ?? engines.find((item) => item.id === status?.defaultEngine) ?? engines[0];
  const voices = engine?.voices ?? [];
  // A voice the chosen engine lacks falls back to the default one.
  const selected = voices.some((voice) => voice.id === settings.voice) ? settings.voice : status?.defaultVoice ?? null;
  return (
    <div className="jarvis-voice-settings">
      {engines.length > 1 && (
        <section>
          <h4>Druh hlasu</h4>
          <div className="jarvis-chip-row">
            {engines.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`jarvis-choice${item.id === engine?.id ? ' jarvis-choice--on' : ''}`}
                aria-pressed={item.id === engine?.id}
                onClick={() => onChange({ engine: item.id })}
              >
                {item.label}
              </button>
            ))}
          </div>
          {engine && <p className="jarvis-voice-hint">{engine.description}</p>}
        </section>
      )}
      <section>
        <h4>Hlas Jarvise</h4>
        {voices.length > 0 ? (
          VOICE_GROUPS.filter((group) => voices.some((voice) => voice.gender === group.gender)).map((group) => (
            <div key={group.gender} className="jarvis-voice-group">
              <span className="jarvis-voice-group-title">{group.title}</span>
              <div className="jarvis-chip-row">
                {voices
                  .filter((voice) => voice.gender === group.gender)
                  .map((voice) => (
                    <button
                      key={voice.id}
                      type="button"
                      className={`jarvis-choice${voice.id === selected ? ' jarvis-choice--on' : ''}`}
                      aria-pressed={voice.id === selected}
                      onClick={() => onChange({ voice: voice.id })}
                    >
                      {voice.label}
                    </button>
                  ))}
              </div>
            </div>
          ))
        ) : (
          <p className="jarvis-voice-note">
            Jarvis teď mluví hlasem prohlížeče, který zní roboticky. Přirozené hlasy se zapnou, jakmile bude na serveru
            nastavený klíč OPENAI_API_KEY.
          </p>
        )}
      </section>
      <section>
        <h4>Rychlost řeči</h4>
        <div className="jarvis-chip-row">
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={`jarvis-choice${speed === settings.speed ? ' jarvis-choice--on' : ''}`}
              aria-pressed={speed === settings.speed}
              onClick={() => onChange({ speed })}
            >
              {formatSpeed(speed)}
            </button>
          ))}
        </div>
        <button type="button" className="jarvis-chip-button jarvis-voice-preview" onClick={previewing ? onStopPreview : onPreview}>
          {previewing ? Icon.stop : Icon.speakerSmall} {previewing ? 'Zastavit ukázku' : 'Poslechnout ukázku'}
        </button>
      </section>
      <section>
        <h4>Hlasový dotaz odeslat</h4>
        <label className="jarvis-radio">
          <input type="radio" name="jarvis-send-mode" checked={settings.sendMode === 'auto'} onChange={() => onChange({ sendMode: 'auto' })} />
          <span>
            <strong>Automaticky, když domluvím</strong>
            <small>Krátké nadechnutí nevadí – dotaz odejde až po delší pauze.</small>
          </span>
        </label>
        {settings.sendMode === 'auto' && (
          <div className="jarvis-chip-row jarvis-radio-extra">
            {PAUSE_OPTIONS.map((option) => (
              <button
                key={option.ms}
                type="button"
                className={`jarvis-choice${option.ms === settings.pauseMs ? ' jarvis-choice--on' : ''}`}
                aria-pressed={option.ms === settings.pauseMs}
                onClick={() => onChange({ pauseMs: option.ms })}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        <label className="jarvis-radio">
          <input type="radio" name="jarvis-send-mode" checked={settings.sendMode === 'manual'} onChange={() => onChange({ sendMode: 'manual' })} />
          <span>
            <strong>Ručně, tlačítkem Odeslat</strong>
            <small>Mluvte, jak dlouho chcete; nahrávání ukončíte sami.</small>
          </span>
        </label>
      </section>
      <section>
        <h4>Po hlasové odpovědi</h4>
        <label className="jarvis-radio">
          <input type="radio" name="jarvis-conversation" checked={settings.conversation} onChange={() => onChange({ conversation: true })} />
          <span>
            <strong>Poslouchat dál (rozhovor)</strong>
            <small>Po přečtení odpovědi se mikrofon zapne sám (ozve se krátký tón). Rozhovor skončí, když chvíli mlčíte nebo řeknete „to je vše“.</small>
          </span>
        </label>
        <label className="jarvis-radio">
          <input type="radio" name="jarvis-conversation" checked={!settings.conversation} onChange={() => onChange({ conversation: false })} />
          <span>
            <strong>Čekat na kliknutí na mikrofon</strong>
            <small>Každý další dotaz začnete sami.</small>
          </span>
        </label>
      </section>
    </div>
  );
}

const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function Steps({ steps, open }: { steps: Turn['steps']; open: boolean }) {
  const [expanded, setExpanded] = useState(open);
  const tools = steps.filter((step) => step.type === 'tool');
  if (steps.length === 0) return null;
  return (
    <div className="jarvis-steps">
      <button type="button" className="jarvis-steps-toggle" onClick={() => setExpanded((value) => !value)}>
        {expanded ? '▾' : '▸'} {tools.length === 1 ? '1 krok' : tools.length >= 2 && tools.length <= 4 ? `${tools.length} kroky` : `${tools.length} kroků`}
      </button>
      {expanded && (
        <ul className="jarvis-step-list">
          {steps.map((step, index) =>
            step.type === 'tool' ? (
              <li key={index} className={step.ok ? '' : 'jarvis-step--failed'}>
                <span className="jarvis-step-mark">{step.ok ? '✓' : '!'}</span> {step.label}
              </li>
            ) : (
              <li key={index} className="jarvis-step-note">
                {step.text}
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

interface JarvisPanelProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  viewLabel: string;
  // Where the floating launcher sits: above the app's fixed footer, above a chat
  // screen's message box (whose send button is in the corner), or in the corner.
  launcherPlacement: 'footer' | 'composer' | 'corner';
  onOpenRecord: (action: JarvisOpenAction) => void;
}

export default function JarvisPanel({ open, onOpen, onClose, viewLabel, launcherPlacement, onOpenRecord }: JarvisPanelProps) {
  const [status, setStatus] = useState<JarvisStatus | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(() => readStored(CONVERSATION_KEY));
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [attention, setAttention] = useState<JarvisAttention | null>(null);
  const [showAttention, setShowAttention] = useState(false);
  const [input, setInput] = useState('');
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // An answer that finished while the panel was closed lights a dot on the
  // launcher until the panel is opened again.
  const [unseen, setUnseen] = useState(false);
  const openRef = useRef(open);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [readAloud, setReadAloud] = useState(() => readStored(READ_ALOUD_KEY) === '1');
  // The profile the user has open in a grid, if any.
  const focus = useJarvisFocus();
  const readAloudRef = useRef(readAloud);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  // Proposals whose decision is on its way to the server.
  const [deciding, setDeciding] = useState<Set<string>>(() => new Set());
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<PendingAttachment[]>([]);
  attachmentsRef.current = attachments;

  const busy = live !== null;
  const uploading = attachments.some((attachment) => attachment.status === 'uploading');
  const readyAttachments = attachments.filter((attachment) => attachment.status === 'ready' && attachment.id);

  const updateAttachment = (key: string, patch: Partial<PendingAttachment>) =>
    setAttachments((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  // Each file is uploaded as soon as it is added, so sending is instant.
  const addFiles = (files: File[]) => {
    const room = MAX_ATTACHMENTS - attachmentsRef.current.length;
    if (files.length > room) setError(`K jedné zprávě lze přiložit nejvýš ${MAX_ATTACHMENTS} souborů.`);
    for (const original of files.slice(0, Math.max(0, room))) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const kind = kindOfFile(original);
      const entry: PendingAttachment = {
        key,
        name: original.name,
        size: original.size,
        kind,
        status: 'uploading',
        preview: kind === 'image' ? URL.createObjectURL(original) : undefined,
      };
      setAttachments((items) => [...items, entry]);
      void (async () => {
        try {
          const file = kind === 'image' ? await shrinkImage(original) : original;
          if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('Soubor je větší než 25 MB.');
          const uploaded = await jarvisApi.uploadAttachment(file);
          if (!attachmentsRef.current.some((item) => item.key === key)) {
            // Removed while it was uploading.
            if (uploaded.id) void jarvisApi.deleteAttachment(uploaded.id).catch(() => undefined);
            return;
          }
          if (uploaded.error !== undefined || !uploaded.id) updateAttachment(key, { status: 'error', error: uploaded.error ?? 'Soubor se nepodařilo nahrát.' });
          else updateAttachment(key, { status: 'ready', id: uploaded.id, kind: uploaded.kind, size: file.size });
        } catch (err) {
          updateAttachment(key, { status: 'error', error: err instanceof Error ? err.message : 'Soubor se nepodařilo nahrát.' });
        }
      })();
    }
  };

  const removeAttachment = (key: string) => {
    const item = attachmentsRef.current.find((attachment) => attachment.key === key);
    if (item?.preview) URL.revokeObjectURL(item.preview);
    if (item?.id) void jarvisApi.deleteAttachment(item.id).catch(() => undefined);
    setAttachments((items) => items.filter((attachment) => attachment.key !== key));
  };

  // A spoken question goes off as soon as it has been transcribed.
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(loadVoiceSettings);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  // Read after an answer has been spoken, when the latest settings count.
  const voiceSettingsRef = useRef(voiceSettings);
  voiceSettingsRef.current = voiceSettings;
  const changeVoiceSettings = (patch: Partial<VoiceSettings>) => {
    setVoiceSettings((current) => {
      const next = { ...current, ...patch };
      saveVoiceSettings(next);
      return next;
    });
  };
  // "Děkuji, to je vše" into a microphone that reopened after an answer ends
  // the conversation instead of becoming a question.
  const voice = useJarvisVoice(
    status?.voice,
    (text, { followUp }) => {
      if (followUp && isConversationEnd(text)) return;
      void send(text, true);
    },
    voiceSettings
  );
  const { cancelListening, stopSpeaking } = voice;
  const listening = voice.listen !== 'idle';
  const speaking = voice.speakingKey !== null;

  const toggleReadAloud = () => {
    const next = !readAloud;
    readAloudRef.current = next;
    setReadAloud(next);
    writeStored(READ_ALOUD_KEY, next ? '1' : null);
    if (!next) stopSpeaking();
  };

  // The microphone never stays on behind a closed panel.
  useEffect(() => {
    if (!open) cancelListening();
  }, [open, cancelListening]);

  const closePanel = useCallback(() => {
    stopSpeaking();
    onClose();
  }, [onClose, stopSpeaking]);

  useEffect(() => {
    openRef.current = open;
    if (open) setUnseen(false);
  }, [open]);

  useEffect(() => {
    if (!open || status) return;
    jarvisApi.status().then(setStatus).catch(() => setStatus({ available: false, model: '', voice: false }));
  }, [open, status]);

  // Reminders, checked when the app opens and every few minutes for the
  // launcher's number, and at once after a to-do changes.
  const loadAttention = useCallback(async (fresh = false) => {
    try {
      setAttention(await jarvisApi.attention(fresh));
    } catch {
      // Reminders are a convenience; the panel works without them.
    }
  }, []);

  useEffect(() => {
    void loadAttention();
    const timer = window.setInterval(() => void loadAttention(), ATTENTION_REFRESH_MS);
    const onTasksChanged = () => void loadAttention(true);
    window.addEventListener(TASKS_CHANGED_EVENT, onTasksChanged);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(TASKS_CHANGED_EVENT, onTasksChanged);
    };
  }, [loadAttention]);

  useEffect(() => {
    if (open) void loadAttention();
  }, [open, loadAttention]);

  const loadConversation = useCallback(async (id: string | null) => {
    setConversationId(id);
    writeStored(CONVERSATION_KEY, id);
    setError(null);
    if (!id) {
      setTranscript([]);
      return;
    }
    try {
      const data = await jarvisApi.conversation(id);
      setTranscript(data.transcript);
    } catch {
      // A conversation deleted elsewhere: start fresh.
      setConversationId(null);
      writeStored(CONVERSATION_KEY, null);
      setTranscript([]);
    }
  }, []);

  useEffect(() => {
    if (open) void loadConversation(readStored(CONVERSATION_KEY));
  }, [open, loadConversation]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [transcript, live]);

  // Escape closes the panel, but first drops a recording, stops reading
  // aloud, or stops a running answer.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('.safety-modal')) return;
      if (listening) cancelListening();
      else if (speaking) stopSpeaking();
      else if (abortRef.current) abortRef.current.abort();
      else closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closePanel, listening, speaking, cancelListening, stopSpeaking]);

  const toggleAttention = () => {
    setShowVoiceSettings(false);
    setShowHistory(false);
    setShowAttention((value) => !value);
    if (!showAttention) void loadAttention(true);
  };

  const openHistory = async () => {
    setShowVoiceSettings(false);
    setShowAttention(false);
    setShowHistory((value) => !value);
    if (!showHistory) {
      try {
        setConversations(await jarvisApi.conversations());
      } catch {
        setConversations([]);
      }
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      await jarvisApi.deleteConversation(id);
      setConversations((items) => items.filter((item) => item.id !== id));
      if (id === conversationId) void loadConversation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Konverzaci se nepodařilo smazat.');
    }
  };

  async function send(raw: string, spoken = false) {
    const message = raw.trim();
    const sending = attachmentsRef.current.filter((attachment) => attachment.status === 'ready' && attachment.id);
    if ((!message && sending.length === 0) || busy) return;
    if (attachmentsRef.current.some((attachment) => attachment.status === 'uploading')) {
      setError('Počkejte, až se přílohy nahrají.');
      return;
    }
    // Sent attachments now belong to the conversation; refused ones are dropped.
    for (const attachment of attachmentsRef.current) if (attachment.preview) URL.revokeObjectURL(attachment.preview);
    setAttachments([]);
    setInput('');
    setError(null);
    voice.clearError();
    stopSpeaking();
    // Typed questions start here from a key press: let their answer play later.
    unlockAudio();
    setShowHistory(false);
    setShowAttention(false);
    const controller = new AbortController();
    abortRef.current = controller;
    let activeId = conversationId;
    // Answer aloud what was asked aloud (or everything, when chosen). With the
    // server's voice the reading starts while the answer is still being
    // written; text later dropped for a tool call is not read on.
    const readAloudNow = spoken || readAloudRef.current;
    const answerKey = `answer-${turns.length}`;
    let streamedText = '';
    // Assigned from the event callback, so TypeScript must not narrow it to null.
    let reading = null as ReturnType<typeof voice.streamSpeech>;
    const dropReading = () => {
      streamedText = '';
      reading?.cancel();
      reading = null;
    };
    setLive({
      question: message,
      voice: spoken,
      attachments: sending.map((attachment) => ({ name: attachment.name, kind: attachment.kind ?? 'text' })),
      proposals: [],
      calendar: [],
      emails: [],
      steps: [],
      text: '',
      thinking: '',
      actions: [],
      notices: [],
    });

    const onEvent = (event: JarvisEvent) => {
      switch (event.event) {
        case 'conversation':
          activeId = event.data.id;
          setConversationId(event.data.id);
          writeStored(CONVERSATION_KEY, event.data.id);
          break;
        case 'text':
          setLive((turn) => (turn ? { ...turn, text: turn.text + event.data.delta, thinking: '' } : turn));
          streamedText += event.data.delta;
          if (readAloudNow) {
            reading ??= voice.streamSpeech(answerKey);
            reading?.update(streamedText);
          }
          break;
        case 'text_reset':
          setLive((turn) => (turn ? { ...turn, text: '' } : turn));
          dropReading();
          break;
        case 'thinking':
          setLive((turn) => (turn ? { ...turn, thinking: (turn.thinking + event.data.delta).slice(-240) } : turn));
          break;
        case 'tool':
          // Text written before a tool call is a progress note, not the answer.
          dropReading();
          setLive((turn) =>
            turn ? { ...turn, text: '', thinking: '', steps: [...turn.steps, { id: event.data.id, label: event.data.label, done: false, ok: true }] } : turn
          );
          break;
        case 'tool_done':
          setLive((turn) =>
            turn ? { ...turn, steps: turn.steps.map((step) => (step.id === event.data.id ? { ...step, done: true, ok: event.data.ok } : step)) } : turn
          );
          break;
        case 'action':
          setLive((turn) => (turn ? { ...turn, actions: [...turn.actions, event.data] } : turn));
          break;
        case 'proposal':
          setLive((turn) => (turn ? { ...turn, proposals: [...turn.proposals, event.data] } : turn));
          break;
        case 'calendar':
          setLive((turn) => (turn ? { ...turn, calendar: [...turn.calendar, event.data] } : turn));
          // Additions and edits are already in the calendar.
          if (event.data.action !== 'delete') announceCalendarChange();
          break;
        case 'email':
          setLive((turn) => (turn ? { ...turn, emails: [...turn.emails, event.data] } : turn));
          break;
        case 'notice':
          setLive((turn) => (turn ? { ...turn, notices: [...turn.notices, event.data.text] } : turn));
          break;
        case 'error':
          setError(event.data.message);
          break;
        default:
          break;
      }
    };

    try {
      await jarvisApi.chat(
        {
          message,
          conversationId,
          ...(sending.length ? { attachments: sending.map((attachment) => attachment.id as string) } : {}),
          context: {
            view: viewLabel,
            ...(spoken ? { voice: true } : {}),
            ...(focus ? { record: focus.subject, ...(focus.commission ? { commission: focus.commission } : {}) } : {}),
          },
        },
        onEvent,
        controller.signal
      );
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Jarvis neodpověděl.');
    } finally {
      abortRef.current = null;
      // The rest of a streamed answer is read on while the transcript reloads.
      let streamedReading: Promise<boolean> | null = null;
      if (controller.signal.aborted || !streamedText.trim()) dropReading();
      else if (reading) streamedReading = reading.finish(streamedText);
      // The server's transcript is the record of what happened; show that.
      // `handsNeeded`: the answer left a card to click (a change to confirm, a
      // deletion, an e-mail), so the conversation does not go on by voice.
      let answer: { text: string; key: string; handsNeeded: boolean } | null = null;
      if (activeId) {
        try {
          const data = await jarvisApi.conversation(activeId);
          setTranscript(data.transcript);
          const all = groupTurns(data.transcript);
          const last = all[all.length - 1];
          if (last?.answer) {
            answer = {
              text: last.answer,
              key: `answer-${all.length - 1}`,
              handsNeeded: last.proposals.length > 0 || last.emails.length > 0 || last.calendar.some((card) => card.action === 'delete'),
            };
          }
        } catch {
          // Keep what is on screen.
        }
      }
      setLive(null);
      if (openRef.current) inputRef.current?.focus();
      else setUnseen(true);
      // In a spoken conversation the microphone then reopens for the next
      // question, unless the answer was stopped, the panel closed or the tab
      // hidden.
      if (answer && !controller.signal.aborted && readAloudNow) {
        const spokenAnswer = answer;
        void (streamedReading ?? voice.speak(spokenAnswer.text, spokenAnswer.key)).then((finished) => {
          const goOn = finished && spoken && !spokenAnswer.handsNeeded && voiceSettingsRef.current.conversation;
          if (goOn && openRef.current && !document.hidden) void voice.startListening({ followUp: true });
        });
      }
    }
  }

  const stop = () => abortRef.current?.abort();

  // Jump to the record and step aside so its profile is fully visible; the
  // conversation stays, Alt+J brings it back.
  const openRecord = (action: JarvisOpenAction) => {
    onOpenRecord(action);
    onClose();
  };

  const turns = useMemo(() => groupTurns(transcript), [transcript]);
  const decisions = useMemo(() => {
    const map = new Map<string, ProposalDecision>();
    for (const item of transcript) if (item.type === 'proposal_status') map.set(item.id, item);
    return map;
  }, [transcript]);

  const decideProposal = async (proposalId: string, decision: 'apply' | 'reject') => {
    if (!conversationId) return;
    setDeciding((current) => new Set(current).add(proposalId));
    try {
      const result = await jarvisApi.decideProposal(conversationId, proposalId, decision);
      setTranscript((items) => [...items, result]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rozhodnutí se nepodařilo uložit.');
    } finally {
      setDeciding((current) => {
        const next = new Set(current);
        next.delete(proposalId);
        return next;
      });
    }
  };

  const calendarDecisions = useMemo(() => {
    const map = new Map<string, CalendarDecision>();
    for (const item of transcript) if (item.type === 'calendar_status') map.set(item.id, item);
    return map;
  }, [transcript]);

  const decideCalendar = async (cardId: string, action: 'undo' | 'confirm' | 'keep') => {
    if (!conversationId) return;
    setDeciding((current) => new Set(current).add(cardId));
    try {
      const result = await jarvisApi.decideCalendar(conversationId, cardId, action);
      setTranscript((items) => [...items, result]);
      announceCalendarChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kalendář se nepodařilo změnit.');
    } finally {
      setDeciding((current) => {
        const next = new Set(current);
        next.delete(cardId);
        return next;
      });
    }
  };

  const renderCalendar = (cards: JarvisCalendarCard[], live: boolean) =>
    cards.length === 0 ? null : (
      <div className="jarvis-proposals">
        {cards.map((card) => (
          <CalendarCard
            key={card.id}
            card={card}
            decision={calendarDecisions.get(card.id)}
            busy={deciding.has(card.id)}
            disabled={live || busy}
            onAction={(action) => void decideCalendar(card.id, action)}
          />
        ))}
      </div>
    );

  // Several pending proposals of one answer, confirmed one after another.
  const applyAll = async (proposals: JarvisProposal[]) => {
    for (const proposal of proposals) {
      if (!decisions.has(proposal.id)) await decideProposal(proposal.id, 'apply');
    }
  };

  const renderProposals = (proposals: JarvisProposal[], live: boolean) => {
    if (proposals.length === 0) return null;
    const open = proposals.filter((proposal) => !decisions.has(proposal.id));
    return (
      <div className="jarvis-proposals">
        {proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            decision={decisions.get(proposal.id)}
            deciding={deciding.has(proposal.id)}
            disabled={live || busy}
            onDecide={(decision) => void decideProposal(proposal.id, decision)}
          />
        ))}
        {!live && open.length > 1 && (
          <button type="button" className="jarvis-proposal-apply jarvis-proposal-all" onClick={() => void applyAll(open)} disabled={busy || deciding.size > 0}>
            Potvrdit vše ({open.length})
          </button>
        )}
      </div>
    );
  };
  const unavailable = status && !status.available;
  const urgent = attention?.urgent ?? 0;
  const subtitle = busy
    ? 'Pracuji…'
    : voice.listen === 'listening'
      ? 'Poslouchám…'
      : voice.listen === 'transcribing'
        ? 'Přepisuji…'
        : speaking
          ? 'Mluvím…'
          : 'AI asistent';

  return (
    <>
    <button
      type="button"
      className={[
        'jarvis-launcher',
        `jarvis-launcher--${launcherPlacement}`,
        open ? 'jarvis-launcher--hidden' : '',
        busy ? 'jarvis-launcher--busy' : '',
      ].filter(Boolean).join(' ')}
      onClick={onOpen}
      aria-label="Otevřít Jarvise (Alt+J)"
      tabIndex={open ? -1 : 0}
    >
      <SparkIcon size={26} />
      {unseen && !busy && <span className="jarvis-launcher-badge" />}
      {urgent > 0 && (
        <span className="jarvis-launcher-count" title={`Upozornění: ${urgent}`}>
          {urgent > 9 ? '9+' : urgent}
        </span>
      )}
      <span className="jarvis-launcher-tip" aria-hidden="true">
        Jarvis <kbd>Alt+J</kbd>
      </span>
    </button>

    <aside
      className={`jarvis-panel${open ? ' jarvis-panel--open' : ''}`}
      aria-hidden={!open}
      aria-label="Jarvis"
      onDragOver={(event) => {
        if (unavailable || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDragging(false);
        addFiles([...event.dataTransfer.files]);
      }}
    >
      {dragging && (
        <div className="jarvis-dropzone" aria-hidden="true">
          {Icon.clip}
          <strong>Pusťte soubory sem</strong>
          <span>Dokumenty a obrázky, nejvýš {MAX_ATTACHMENTS}, každý do 25 MB</span>
        </div>
      )}
      <header className="jarvis-header">
        <JarvisMark busy={busy || speaking || listening} />
        <div className="jarvis-title">
          <strong>Jarvis</strong>
          <span>{subtitle}</span>
        </div>
        <div className="jarvis-header-actions">
          <button
            type="button"
            className={`jarvis-icon-button jarvis-bell${showAttention ? ' jarvis-icon-button--on' : ''}`}
            onClick={toggleAttention}
            title="Upozornění: termíny, úkoly a zakázky beze změny"
            aria-label="Upozornění"
            aria-expanded={showAttention}
          >
            {Icon.bell}
            {urgent > 0 && <span className="jarvis-bell-count">{urgent > 9 ? '9+' : urgent}</span>}
          </button>
          {(voice.canSpeak || voice.canListen) && (
            <button
              type="button"
              className={`jarvis-icon-button${showVoiceSettings ? ' jarvis-icon-button--on' : ''}`}
              onClick={() => {
                setShowVoiceSettings((value) => !value);
                setShowHistory(false);
                setShowAttention(false);
              }}
              title="Nastavení hlasu"
              aria-label="Nastavení hlasu"
              aria-expanded={showVoiceSettings}
            >
              {Icon.tune}
            </button>
          )}
          {voice.canSpeak && (
            <button
              type="button"
              className={`jarvis-icon-button${readAloud ? ' jarvis-icon-button--on' : ''}`}
              onClick={toggleReadAloud}
              title={readAloud ? 'Čtu nahlas všechny odpovědi (kliknutím vypnete)' : 'Číst nahlas i odpovědi na psané dotazy'}
              aria-label="Číst odpovědi nahlas"
              aria-pressed={readAloud}
            >
              {readAloud ? Icon.speaker : Icon.speakerOff}
            </button>
          )}
          <button type="button" className="jarvis-icon-button" onClick={openHistory} title="Historie konverzací" aria-label="Historie konverzací" aria-expanded={showHistory}>
            {Icon.history}
          </button>
          <button
            type="button"
            className="jarvis-icon-button"
            onClick={() => void loadConversation(null)}
            disabled={busy}
            title="Nová konverzace"
            aria-label="Nová konverzace"
          >
            {Icon.plus}
          </button>
          <button type="button" className="jarvis-icon-button" onClick={closePanel} title="Zavřít (Esc)" aria-label="Zavřít">
            {Icon.close}
          </button>
        </div>
      </header>

      {showVoiceSettings && (
        <VoiceSettingsPanel
          settings={voiceSettings}
          status={status}
          onChange={changeVoiceSettings}
          previewing={voice.speakingKey === 'preview'}
          onPreview={() => void voice.speak(VOICE_SAMPLE, 'preview')}
          onStopPreview={stopSpeaking}
        />
      )}

      {showAttention && (
        <AttentionList
          attention={attention}
          onOpenRecord={openRecord}
          onBriefing={() => void send(BRIEFING_PROMPT)}
          disabled={busy || Boolean(unavailable)}
        />
      )}

      {showHistory && (
        <div className="jarvis-history">
          {conversations.length === 0 && <p className="jarvis-muted">Zatím žádné konverzace.</p>}
          {conversations.map((item) => (
            <div key={item.id} className={`jarvis-history-item${item.id === conversationId ? ' jarvis-history-item--active' : ''}`}>
              <button
                type="button"
                className="jarvis-history-open"
                onClick={() => {
                  setShowHistory(false);
                  void loadConversation(item.id);
                }}
                disabled={busy}
              >
                <span>{item.title || 'Bez názvu'}</span>
                <small>{relativeTime(item.updatedAt)}</small>
              </button>
              <button type="button" className="jarvis-icon-button" onClick={() => deleteConversation(item.id)} title="Smazat konverzaci" aria-label="Smazat konverzaci" disabled={busy}>
                {Icon.trash}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="jarvis-body" ref={scrollRef}>
        {unavailable && (
          <div className="jarvis-callout">Jarvis není na serveru nastavený (chybí klíč ANTHROPIC_API_KEY).</div>
        )}

        {turns.length === 0 && !live && !unavailable && (
          <div className="jarvis-welcome">
            <JarvisMark large />
            <div className="jarvis-welcome-title">Na co se chcete zeptat?</div>
            <p>Hledám v klientech, partnerech, tipařích a zakázkách, kam máte přístup, ve vašem kalendáři, v nahraných dokumentech i v rejstříku firem ARES. Změny dat jen navrhuji – provedou se, až je potvrdíte; události v kalendáři umím přidat i přesunout (a vrátit zpět).</p>
            {voice.canListen && (
              <p className="jarvis-welcome-voice">
                {Icon.micSmall} Ptát se můžete i hlasem: klikněte na mikrofon a mluvte, odpovím nahlas.
              </p>
            )}
            <div className="jarvis-suggestions">
              {(focus ? focusSuggestions(focus) : SUGGESTIONS).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={suggestion === BRIEFING_SUGGESTION ? 'jarvis-suggestion--briefing' : undefined}
                  onClick={() => {
                    if (suggestion === BRIEFING_SUGGESTION) {
                      void send(BRIEFING_PROMPT);
                    } else if (suggestion.includes('…')) {
                      setInput(suggestion.replace('…', ''));
                      inputRef.current?.focus();
                    } else {
                      void send(suggestion);
                    }
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, index) => (
          <div key={index} className="jarvis-turn">
            <div className="jarvis-question">
              {turn.question.voice && <span className="jarvis-question-voice" title="Řečeno hlasem">{Icon.micSmall}</span>}
              {turn.question.text}
              <QuestionAttachments attachments={turn.question.attachments} />
            </div>
            <Steps steps={turn.steps} open={false} />
            {turn.answer && (
              <div className="jarvis-answer">
                <MarkdownMessage content={turn.answer} />
              </div>
            )}
            {turn.answer && voice.canSpeak && (
              <ReadAloudButton
                reading={voice.speakingKey === `answer-${index}`}
                onRead={() => void voice.speak(turn.answer ?? '', `answer-${index}`)}
                onStop={stopSpeaking}
              />
            )}
            {renderProposals(turn.proposals, false)}
            {renderCalendar(turn.calendar, false)}
            {turn.emails.map((draft) => <EmailCard key={draft.id} draft={draft} onOpenRecord={openRecord} />)}
            {turn.notices.map((notice, noticeIndex) => (
              <div key={noticeIndex} className="jarvis-notice">{notice}</div>
            ))}
            {turn.actions.length > 0 && (
              <div className="jarvis-actions">
                {turn.actions.map((action, actionIndex) => (
                  <button key={actionIndex} type="button" className="jarvis-action" onClick={() => openRecord(action)}>
                    Otevřít · {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {live && (
          <div className="jarvis-turn">
            <div className="jarvis-question">
              {live.voice && <span className="jarvis-question-voice" title="Řečeno hlasem">{Icon.micSmall}</span>}
              {live.question}
              <QuestionAttachments attachments={live.attachments} />
            </div>
            {live.steps.length > 0 && (
              <ul className="jarvis-step-list jarvis-step-list--live">
                {live.steps.map((step) => (
                  <li key={step.id} className={step.done && !step.ok ? 'jarvis-step--failed' : ''}>
                    <span className="jarvis-step-mark">{step.done ? (step.ok ? '✓' : '!') : <span className="jarvis-spinner" />}</span> {step.label}
                  </li>
                ))}
              </ul>
            )}
            {live.text ? (
              <div className="jarvis-answer">
                <MarkdownMessage content={live.text} />
              </div>
            ) : (
              <div className="jarvis-thinking">
                <span className="jarvis-dots"><i /><i /><i /></span>
                <span>{live.thinking ? `…${live.thinking.slice(-120)}` : 'Přemýšlím…'}</span>
              </div>
            )}
            {renderProposals(live.proposals, true)}
            {renderCalendar(live.calendar, true)}
            {live.emails.map((draft) => <EmailCard key={draft.id} draft={draft} onOpenRecord={openRecord} />)}
            {live.notices.map((notice, noticeIndex) => (
              <div key={noticeIndex} className="jarvis-notice">{notice}</div>
            ))}
            {live.actions.length > 0 && (
              <div className="jarvis-actions">
                {live.actions.map((action, actionIndex) => (
                  <button key={actionIndex} type="button" className="jarvis-action" onClick={() => openRecord(action)}>
                    Otevřít · {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <div className="jarvis-callout jarvis-callout--error">{error}</div>}
      </div>

      <form
        className="jarvis-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <div className="jarvis-composer-meta">
          <div className="jarvis-context-group">
            <div className="jarvis-context" title="Jarvis ví, kde v aplikaci jste">
              {viewLabel}
            </div>
            {focus && (
              <div className="jarvis-context jarvis-context--record" title="Jarvis ví, že máte otevřený tento záznam – „tenhle“ myslí jeho">
                {Icon.record}
                <span>{focus.commission?.label ?? focus.subject.label}</span>
              </div>
            )}
          </div>
          {speaking && (
            <button type="button" className="jarvis-chip-button" onClick={stopSpeaking} title="Zastavit čtení (Esc)">
              {Icon.stop} Zastavit čtení
            </button>
          )}
        </div>
        {voice.error && (
          <div className="jarvis-voice-error" role="alert">
            <span>{voice.error}</span>
            <button type="button" className="jarvis-icon-button" onClick={voice.clearError} aria-label="Zavřít upozornění">
              {Icon.close}
            </button>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="jarvis-attachments">
            {attachments.map((attachment) => (
              <div
                key={attachment.key}
                className={`jarvis-attachment jarvis-attachment--${attachment.status}`}
                title={attachment.error ?? attachment.name}
              >
                {attachment.preview ? (
                  <img src={attachment.preview} alt="" className="jarvis-attachment-thumb" />
                ) : (
                  <span className="jarvis-attachment-icon">{Icon.file}</span>
                )}
                <span className="jarvis-attachment-text">
                  <span className="jarvis-attachment-name">{attachment.name}</span>
                  <span className="jarvis-attachment-meta">
                    {attachment.status === 'uploading' ? 'Nahrávám…' : attachment.status === 'error' ? attachment.error : formatSize(attachment.size)}
                  </span>
                </span>
                {attachment.status === 'uploading' && <span className="jarvis-spinner" aria-hidden="true" />}
                <button
                  type="button"
                  className="jarvis-attachment-remove"
                  onClick={() => removeAttachment(attachment.key)}
                  aria-label={`Odebrat ${attachment.name}`}
                  title="Odebrat"
                >
                  {Icon.close}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="jarvis-input-row">
          {!listening && (
            <>
              <button
                type="button"
                className="jarvis-attach"
                onClick={() => fileInputRef.current?.click()}
                disabled={Boolean(unavailable) || attachments.length >= MAX_ATTACHMENTS}
                title="Přiložit soubor nebo obrázek (můžete ho sem i přetáhnout nebo vložit Ctrl+V)"
                aria-label="Přiložit soubor"
              >
                {Icon.clip}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                hidden
                onChange={(event) => {
                  addFiles([...(event.target.files ?? [])]);
                  event.target.value = '';
                }}
              />
            </>
          )}
          {listening ? (
            <div className="jarvis-listening" aria-live="polite">
              {voice.listen === 'listening' && status?.voice ? (
                <LevelMeter levelRef={voice.levelRef} />
              ) : voice.listen === 'listening' ? (
                <span className="jarvis-listening-dot" aria-hidden="true" />
              ) : (
                <span className="jarvis-spinner" aria-hidden="true" />
              )}
              <div className="jarvis-listening-text">
                {voice.listen === 'starting' && <strong>Zapínám mikrofon…</strong>}
                {voice.listen === 'transcribing' && <strong>Přepisuji…</strong>}
                {voice.listen === 'listening' && (
                  <>
                    <strong>{voice.interim || `Poslouchám… ${formatElapsed(voice.elapsed)}`}</strong>
                    <span>
                      {voice.followUp && !voice.interim
                        ? 'Můžete pokračovat. Když nic neřeknete, rozhovor skončí.'
                        : voiceSettings.sendMode === 'manual'
                          ? 'Až domluvíte, klikněte na Odeslat'
                          : `Odešlu, až ${String(voiceSettings.pauseMs / 1000).replace('.', ',')} s nebudete mluvit`}
                    </span>
                  </>
                )}
              </div>
              <button type="button" className="jarvis-icon-button" onClick={cancelListening} title="Zahodit (Esc)" aria-label="Zahodit nahrávku">
                {Icon.close}
              </button>
            </div>
          ) : (
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onPaste={(event) => {
                // A copied screenshot or file attaches; copied text pastes as usual.
                const files = [...event.clipboardData.files];
                if (files.length === 0 || event.clipboardData.getData('text/plain')) return;
                event.preventDefault();
                addFiles(files.map(namePastedImage));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              placeholder={unavailable ? 'Jarvis není dostupný' : attachments.length ? 'Co s přílohou udělat? (nebo rovnou odešlete)' : 'Zeptejte se Jarvise…'}
              rows={2}
              maxLength={8000}
              disabled={Boolean(unavailable)}
            />
          )}
          {speaking && !listening && (
            <button
              type="button"
              className="jarvis-mic jarvis-mic--stop"
              onClick={stopSpeaking}
              title="Zastavit čtení (Esc)"
              aria-label="Zastavit čtení"
            >
              {Icon.stop}
            </button>
          )}
          {voice.canListen && !listening && !speaking && (
            <button
              type="button"
              className="jarvis-mic"
              onClick={() => void voice.startListening()}
              disabled={busy || Boolean(unavailable)}
              title="Zeptat se hlasem"
              aria-label="Zeptat se hlasem"
            >
              {Icon.mic}
            </button>
          )}
          {listening ? (
            <button
              type="button"
              className="jarvis-send"
              onClick={voice.stopListening}
              disabled={voice.listen !== 'listening'}
              title="Odeslat hned"
              aria-label="Odeslat hned"
            >
              {Icon.send}
            </button>
          ) : busy ? (
            <button type="button" className="jarvis-send jarvis-send--stop" onClick={stop} title="Zastavit (Esc)" aria-label="Zastavit">
              {Icon.stop}
            </button>
          ) : (
            <button
              type="submit"
              className="jarvis-send"
              disabled={(!input.trim() && readyAttachments.length === 0) || uploading || Boolean(unavailable)}
              title={uploading ? 'Čekám na nahrání příloh' : 'Odeslat (Enter)'}
              aria-label="Odeslat"
            >
              {Icon.send}
            </button>
          )}
        </div>
      </form>
    </aside>
    </>
  );
}
