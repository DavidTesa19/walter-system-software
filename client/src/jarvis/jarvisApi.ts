import { API_BASE, apiDelete, apiGet } from '../utils/api';

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

export type TranscriptItem =
  | { type: 'question'; text: string; at?: string }
  | { type: 'answer'; text: string; model?: string }
  | { type: 'note'; text: string }
  | { type: 'tool'; name: string; label: string; ok: boolean }
  | { type: 'notice'; text: string }
  | { type: 'action'; action: JarvisOpenAction };

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JarvisContext {
  view?: string;
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

export const jarvisApi = {
  status: () => apiGet<{ available: boolean; model: string }>('/api/jarvis/status'),
  conversations: () => apiGet<ConversationSummary[]>('/api/jarvis/conversations'),
  conversation: (id: string) =>
    apiGet<{ id: string; title: string | null; transcript: TranscriptItem[] }>(`/api/jarvis/conversations/${id}`),
  deleteConversation: (id: string) => apiDelete(`/api/jarvis/conversations/${id}`),

  // Sends one message and calls onEvent for every Server-Sent Event of the
  // reply. Resolves when the reply ends; rejects with the server's message on
  // an HTTP error. Abort the signal to stop Jarvis.
  async chat(
    body: { message: string; conversationId?: string | null; context?: JarvisContext },
    onEvent: (event: JarvisEvent) => void,
    signal: AbortSignal
  ): Promise<void> {
    const token = getToken();
    const response = await fetch(`${API_BASE}/api/jarvis/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || `Jarvis neodpověděl (${response.status}).`);
    }

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
