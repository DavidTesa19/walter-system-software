// Each user's own voice preferences for Jarvis, kept in this browser.

export type SendMode = 'auto' | 'manual';

export interface VoiceSettings {
  // 'realtime' (fast), 'conversational' (gpt-audio, the earlier one) or
  // 'elevenlabs'; null or an engine no longer offered = the server's default.
  engine: string | null;
  // A voice id of that engine (Marin, Cedar, …, Ondřej); null = the engine's
  // default.
  voice: string | null;
  // 1 = the voice's own pace.
  speed: number;
  // 'auto' sends a spoken question once the speaker pauses; 'manual' keeps
  // listening until the send button is clicked.
  sendMode: SendMode;
  // How long a pause ends the question in 'auto' mode.
  pauseMs: number;
  // After reading the answer to a spoken question, listen again for the next
  // one, like a phone call.
  conversation: boolean;
  // The engine and voice last used with each provider (OpenAI, ElevenLabs),
  // so switching back to one brings them back.
  byProvider: Record<string, ProviderChoice>;
}

export interface ProviderChoice {
  engine: string | null;
  voice: string | null;
}

export const SPEED_OPTIONS = [1, 1.15, 1.3, 1.5];
// A breath between sentences is under a second; a finished question is
// followed by a longer silence.
export const PAUSE_OPTIONS = [
  { ms: 1500, label: 'Krátká (1,5 s)' },
  { ms: 2500, label: 'Střední (2,5 s)' },
  { ms: 4000, label: 'Dlouhá (4 s)' },
];

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  engine: null,
  voice: null,
  speed: 1.15,
  sendMode: 'auto',
  pauseMs: 2500,
  conversation: true,
  byProvider: {},
};

const textOrNull = (value: unknown) => (typeof value === 'string' ? value : null);

function readByProvider(value: unknown): Record<string, ProviderChoice> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, choice]) => choice && typeof choice === 'object')
      .map(([provider, choice]) => {
        const { engine, voice } = choice as Record<string, unknown>;
        return [provider, { engine: textOrNull(engine), voice: textOrNull(voice) }];
      })
  );
}

const STORAGE_KEY = 'walterJarvisVoiceSettings';

export function loadVoiceSettings(): VoiceSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<VoiceSettings> | null;
    if (!stored || typeof stored !== 'object') return DEFAULT_VOICE_SETTINGS;
    return {
      engine: typeof stored.engine === 'string' ? stored.engine : null,
      voice: typeof stored.voice === 'string' ? stored.voice : null,
      speed: SPEED_OPTIONS.includes(Number(stored.speed)) ? Number(stored.speed) : DEFAULT_VOICE_SETTINGS.speed,
      sendMode: stored.sendMode === 'manual' ? 'manual' : 'auto',
      pauseMs: PAUSE_OPTIONS.some((option) => option.ms === stored.pauseMs) ? Number(stored.pauseMs) : DEFAULT_VOICE_SETTINGS.pauseMs,
      conversation: stored.conversation !== false,
      byProvider: readByProvider(stored.byProvider),
    };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

export function saveVoiceSettings(settings: VoiceSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Remembering the choice is a convenience only.
  }
}

export const formatSpeed = (speed: number) => `${String(speed).replace('.', ',')}×`;
