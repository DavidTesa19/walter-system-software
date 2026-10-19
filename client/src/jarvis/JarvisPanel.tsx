import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MarkdownMessage from '../components/MarkdownMessage';
import { jarvisApi } from './jarvisApi';
import type { ConversationSummary, JarvisEvent, JarvisOpenAction, JarvisStatus, TranscriptItem } from './jarvisApi';
import { useJarvisVoice } from './useJarvisVoice';
import { useJarvisFocus } from './jarvisFocus';
import type { JarvisFocus } from './jarvisFocus';
import { unlockAudio } from './voice';
import './JarvisPanel.css';

const CONVERSATION_KEY = 'walterJarvisConversation';
// Read answers to typed questions aloud too (spoken ones always are).
const READ_ALOUD_KEY = 'walterJarvisReadAloud';

const SUGGESTIONS = [
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
}

// The flat transcript, grouped into one block per question.
function groupTurns(items: TranscriptItem[]): Turn[] {
  const turns: Turn[] = [];
  for (const item of items) {
    if (item.type === 'question') {
      turns.push({ question: item, steps: [], answer: null, notices: [], actions: [] });
      continue;
    }
    const turn = turns[turns.length - 1];
    if (!turn) continue;
    if (item.type === 'tool' || item.type === 'note') turn.steps.push(item);
    else if (item.type === 'answer') turn.answer = turn.answer ? `${turn.answer}\n\n${item.text}` : item.text;
    else if (item.type === 'notice') turn.notices.push(item.text);
    else if (item.type === 'action') turn.actions.push(item.action);
  }
  return turns;
}

interface LiveTurn {
  question: string;
  voice: boolean;
  steps: Array<{ id: string; label: string; done: boolean; ok: boolean }>;
  text: string;
  thinking: string;
  actions: JarvisOpenAction[];
  notices: string[];
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

  const busy = live !== null;

  // A spoken question goes off as soon as it has been transcribed.
  const voice = useJarvisVoice(status?.voice, (text) => void send(text, true));
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

  const openHistory = async () => {
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
    if (!message || busy) return;
    setInput('');
    setError(null);
    voice.clearError();
    stopSpeaking();
    // Typed questions start here from a key press: let their answer play later.
    unlockAudio();
    setShowHistory(false);
    const controller = new AbortController();
    abortRef.current = controller;
    let activeId = conversationId;
    setLive({ question: message, voice: spoken, steps: [], text: '', thinking: '', actions: [], notices: [] });

    const onEvent = (event: JarvisEvent) => {
      switch (event.event) {
        case 'conversation':
          activeId = event.data.id;
          setConversationId(event.data.id);
          writeStored(CONVERSATION_KEY, event.data.id);
          break;
        case 'text':
          setLive((turn) => (turn ? { ...turn, text: turn.text + event.data.delta, thinking: '' } : turn));
          break;
        case 'text_reset':
          setLive((turn) => (turn ? { ...turn, text: '' } : turn));
          break;
        case 'thinking':
          setLive((turn) => (turn ? { ...turn, thinking: (turn.thinking + event.data.delta).slice(-240) } : turn));
          break;
        case 'tool':
          // Text written before a tool call is a progress note, not the answer.
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
      // The server's transcript is the record of what happened; show that.
      let answer: { text: string; key: string } | null = null;
      if (activeId) {
        try {
          const data = await jarvisApi.conversation(activeId);
          setTranscript(data.transcript);
          const all = groupTurns(data.transcript);
          const last = all[all.length - 1];
          if (last?.answer) answer = { text: last.answer, key: `answer-${all.length - 1}` };
        } catch {
          // Keep what is on screen.
        }
      }
      setLive(null);
      if (openRef.current) inputRef.current?.focus();
      else setUnseen(true);
      // Answer aloud what was asked aloud (or everything, when chosen).
      if (answer && !controller.signal.aborted && (spoken || readAloudRef.current)) void voice.speak(answer.text, answer.key);
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
  const unavailable = status && !status.available;
  const subtitle = busy
    ? 'Pracuji…'
    : voice.listen === 'listening'
      ? 'Poslouchám…'
      : voice.listen === 'transcribing'
        ? 'Přepisuji…'
        : speaking
          ? 'Mluvím…'
          : 'AI asistent · zatím jen čte data';

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
      <span className="jarvis-launcher-tip" aria-hidden="true">
        Jarvis <kbd>Alt+J</kbd>
      </span>
    </button>

    <aside className={`jarvis-panel${open ? ' jarvis-panel--open' : ''}`} aria-hidden={!open} aria-label="Jarvis">
      <header className="jarvis-header">
        <JarvisMark busy={busy || speaking || listening} />
        <div className="jarvis-title">
          <strong>Jarvis</strong>
          <span>{subtitle}</span>
        </div>
        <div className="jarvis-header-actions">
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
            <p>Hledám v klientech, partnerech, tipařích a zakázkách, kam máte přístup, ve vašem kalendáři a v nahraných dokumentech. Data zatím jen čtu.</p>
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
                  onClick={() => {
                    if (suggestion.includes('…')) {
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
        <div className="jarvis-input-row">
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
                    <span>Po krátké pauze dotaz odešlu sám</span>
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
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              placeholder={unavailable ? 'Jarvis není dostupný' : 'Zeptejte se Jarvise…'}
              rows={2}
              maxLength={8000}
              disabled={Boolean(unavailable)}
            />
          )}
          {voice.canListen && !listening && (
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
            <button type="submit" className="jarvis-send" disabled={!input.trim() || Boolean(unavailable)} title="Odeslat (Enter)" aria-label="Odeslat">
              {Icon.send}
            </button>
          )}
        </div>
      </form>
    </aside>
    </>
  );
}
