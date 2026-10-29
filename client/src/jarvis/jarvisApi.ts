import { API_BASE, apiDelete, apiGet, apiPost, apiUpload } from '../utils/api';
import type { TranscriptionHints } from './transcriptionHints';

export type JarvisSection = 'public' | 'projects' | 'growth';
export type JarvisRole = 'client' | 'partner' | 'tiper';
export type JarvisKind = 'subject' | 'commission';

export interface JarvisOpenAction {
  type: 'open_record';
  section: JarvisSection;
  role: JarvisRole;
  kind: JarvisKind;
  id: number;
  entityId: number;
  status: string;
  label: string;
}

// A change Jarvis proposes; applied only when the user confirms it.
export interface JarvisProposalChange {
  field: string;
  label: string;
  fromText: string;
  toText: string;
}

export interface JarvisProposal {
  id: string;
  type: 'update' | 'note';
  kind: JarvisKind;
  section: JarvisSection;
  role: JarvisRole;
  recordId: number;
  label: string;
  where: string;
  changes?: JarvisProposalChange[];
  note?: string;
  reason?: string;
}

export type ProposalStatus = 'applied' | 'rejected' | 'stale' | 'failed';

export interface ProposalDecision {
  type: 'proposal_status';
  id: string;
  status: ProposalStatus;
  error?: string;
  at: string;
}

// A change Jarvis made to (or proposes for) the user's calendar.
export interface JarvisCalendarCard {
  id: string;
  action: 'create' | 'update' | 'delete';
  eventId: number;
  title: string;
  when: string;
  changes?: Array<{ label: string; fromText: string; toText: string }>;
  overlaps?: string[];
  reason?: string;
}

export type CalendarCardStatus = 'undone' | 'deleted' | 'kept' | 'restored' | 'changed' | 'gone' | 'failed';

export interface CalendarDecision {
  type: 'calendar_status';
  id: string;
  status: CalendarCardStatus;
  error?: string;
  at: string;
}

// An e-mail Jarvis drafted. It is never sent by Jarvis: the card lets the user
// edit it, copy it or open it in their own mail program.
export interface JarvisEmailDraft {
  id: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  related?: JarvisOpenAction;
}

// What needs the user's attention: their zakázky past or near their deadline,
// untouched ones, and personal to-dos due (GET /api/jarvis/attention).
export type AttentionKind = 'overdue' | 'today' | 'task' | 'soon' | 'stale';

export interface AttentionItem {
  kind: AttentionKind;
  label: string;
  detail: string;
  ref?: string;
  action?: JarvisOpenAction;
}

export interface JarvisAttention {
  urgent: number;
  counts: Record<AttentionKind, number>;
  items: AttentionItem[];
}

export type TranscriptItem =
  | { type: 'question'; text: string; at?: string; voice?: boolean; attachments?: AttachmentSummary[] }
  | { type: 'answer'; text: string; model?: string }
  | { type: 'note'; text: string }
  | { type: 'tool'; name: string; label: string; ok: boolean }
  | { type: 'notice'; text: string }
  | { type: 'action'; action: JarvisOpenAction }
  | { type: 'proposal'; proposal: JarvisProposal }
  | ProposalDecision
  | { type: 'calendar'; card: JarvisCalendarCard }
  | CalendarDecision
  | { type: 'email'; draft: JarvisEmailDraft };

export type AttachmentKind = 'image' | 'pdf' | 'text';

// A file attached to a question, as the transcript remembers it.
export interface AttachmentSummary {
  name: string;
  kind: AttachmentKind;
}

// One uploaded file: its id to send with the message, or why it was refused.
export type UploadedAttachment =
  | { id: string; name: string; kind: AttachmentKind; size: number; error?: undefined }
  | { id?: undefined; name: string; error: string };

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

// An open record, as the server's <kontext> block names it.
export interface JarvisContextRecord {
  section: JarvisSection;
  role: JarvisRole;
  kind: JarvisKind;
  id: number;
  label: string;
}

export interface JarvisContext {
  view?: string;
  // The subject whose profile is open, and the zakázka selected in it.
  record?: JarvisContextRecord;
  commission?: JarvisContextRecord;
  // The question was spoken: Jarvis keeps the answer short and speakable.
  voice?: boolean;
}

export interface JarvisVoiceOption {
  id: string;
  label: string;
  gender: 'female' | 'male' | 'neutral';
}

export interface JarvisVoiceEngine {
  id: string;
  // 'openai' or 'elevenlabs': the voice menu groups the engines by it (a
  // server from before the providers sends none, which means OpenAI).
  provider?: string;
  label: string;
  description: string;
  voices: JarvisVoiceOption[];
  // The voice this engine reads in until the user picks one.
  defaultVoice?: string;
}

export interface JarvisVoiceProvider {
  id: string;
  label: string;
  description: string;
}

export interface JarvisStatus {
  available: boolean;
  model: string;
  // The server can transcribe and speak (OpenAI); otherwise the browser's own
  // speech engines are used.
  voice?: boolean;
  // Who reads answers aloud (ElevenLabs only when the server has its key).
  providers?: JarvisVoiceProvider[];
  engines?: JarvisVoiceEngine[];
  defaultEngine?: string;
  defaultVoice?: string;
  speeds?: number[];
  defaultSpeed?: number;
}

export type JarvisEvent =
  | { event: 'conversation'; data: { id: string; isNew: boolean } }
  | { event: 'text_start'; data: Record<string, never> }
  | { event: 'text'; data: { delta: string } }
  | { event: 'text_reset'; data: Record<string, never> }
  | { event: 'thinking'; data: { delta: string } }
  | { event: 'tool'; data: { id: string; name: string; label: string } }
  | { event: 'tool_done'; data: { id: string; ok: boolean } }
  | { event: 'action'; data: JarvisOpenAction }
  | { event: 'proposal'; data: JarvisProposal }
  | { event: 'calendar'; data: JarvisCalendarCard }
  | { event: 'email'; data: JarvisEmailDraft }
  | { event: 'notice'; data: { text: string } }
  | { event: 'error'; data: { message: string } }
  | { event: 'done'; data: { stopReason: string } };

const getToken = (): string | null => {
  try {
    const stored = localStorage.getItem('walterUser');
    return stored ? (JSON.parse(stored).token as string) ?? null : null;
  } catch {
    return null;
  }
};

const authHeaders = (): Record<string, string> => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const toBase64 = (text: string) => {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const failure = async (response: Response, fallback: string) => {
  const data = await response.json().catch(() => ({}));
  return new Error(data?.error || `${fallback} (${response.status}).`);
};

export const jarvisApi = {
  status: () => apiGet<JarvisStatus>('/api/jarvis/status'),

  // A recorded question in, its text out. The hints (names it probably
  // mentions) travel in a header, base64 because names are not ASCII.
  async transcribe(audio: Blob, signal?: AbortSignal, hints?: TranscriptionHints): Promise<string> {
    const encoded = hints && (hints.keywords.length > 0 || hints.context) ? toBase64(JSON.stringify(hints)) : null;
    const response = await fetch(`${API_BASE}/api/jarvis/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': audio.type || 'audio/webm', ...(encoded ? { 'X-Jarvis-Hints': encoded } : {}), ...authHeaders() },
      body: audio,
      signal,
    });
    if (!response.ok) throw await failure(response, 'Nahrávku se nepodařilo přepsat');
    const data = (await response.json()) as { text?: string };
    return (data.text ?? '').trim();
  },

  // Text in, speech out (WAV or MP3; the browser decodes either).
  async speech(text: string, signal?: AbortSignal, options: { engine?: string | null; voice?: string | null; speed?: number } = {}): Promise<Blob> {
    const response = await fetch(`${API_BASE}/api/jarvis/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        text,
        ...(options.engine ? { engine: options.engine } : {}),
        ...(options.voice ? { voice: options.voice } : {}),
        ...(options.speed ? { speed: options.speed } : {}),
      }),
      signal,
    });
    if (!response.ok) throw await failure(response, 'Odpověď se nepodařilo přečíst');
    return response.blob();
  },

  attention: (fresh = false) => apiGet<JarvisAttention>(`/api/jarvis/attention${fresh ? '?fresh=1' : ''}`),

  conversations: () => apiGet<ConversationSummary[]>('/api/jarvis/conversations'),
  conversation: (id: string) =>
    apiGet<{ id: string; title: string | null; transcript: TranscriptItem[] }>(`/api/jarvis/conversations/${id}`),
  deleteConversation: (id: string) => apiDelete(`/api/jarvis/conversations/${id}`),
  // Undo a calendar change, or confirm / keep a proposed deletion.
  decideCalendar: (conversationId: string, cardId: string, action: 'undo' | 'confirm' | 'keep') =>
    apiPost<CalendarDecision>(`/api/jarvis/conversations/${conversationId}/calendar/${cardId}`, { action }),
  // Confirm (apply) or turn down a change Jarvis proposed.
  decideProposal: (conversationId: string, proposalId: string, decision: 'apply' | 'reject') =>
    apiPost<ProposalDecision>(`/api/jarvis/conversations/${conversationId}/proposals/${proposalId}`, { decision }),

  // Upload a file to attach to the next message.
  async uploadAttachment(file: File): Promise<UploadedAttachment> {
    const form = new FormData();
    form.append('files', file, file.name);
    const data = await apiUpload<{ attachments: UploadedAttachment[] }>('/api/jarvis/attachments', form);
    return data.attachments[0] ?? { name: file.name, error: 'Soubor se nepodařilo nahrát.' };
  },
  // Drop an attachment that will not be sent after all.
  deleteAttachment: (id: string) => apiDelete(`/api/jarvis/attachments/${id}`),

  // Sends one message and calls onEvent for every Server-Sent Event of the
  // reply. Resolves when the reply ends; rejects with the server's message on
  // an HTTP error. Abort the signal to stop Jarvis.
  async chat(
    body: { message: string; conversationId?: string | null; context?: JarvisContext; attachments?: string[] },
    onEvent: (event: JarvisEvent) => void,
    signal: AbortSignal
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/api/jarvis/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok || !response.body) throw await failure(response, 'Jarvis neodpověděl');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = /^event: (.*)$/m.exec(chunk)?.[1];
        const data = /^data: (.*)$/m.exec(chunk)?.[1];
        if (event && data) {
          try {
            onEvent({ event, data: JSON.parse(data) } as JarvisEvent);
          } catch {
            // A malformed event is skipped rather than ending the reply.
          }
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  },
};
