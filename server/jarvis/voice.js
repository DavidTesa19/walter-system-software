// Jarvis's voice: speech to text for spoken questions, text to speech for the
// answers. Both go through OpenAI (Claude has no audio), with the same
// OPENAI_API_KEY the AI Asistent screen uses. Without that key the browser
// falls back to its own speech engines, so nothing here is required.

import OpenAI, { toFile } from 'openai';
import { recordAiUsage } from '../finance/usage.js';

export const STT_MODEL = process.env.JARVIS_STT_MODEL || 'gpt-4o-transcribe';
export const TTS_MODEL = process.env.JARVIS_TTS_MODEL || 'gpt-4o-mini-tts';
// The voices people can pick from in the Jarvis panel. All speak Czech;
// Marin and Cedar are OpenAI's most natural ones.
export const TTS_VOICES = [
  { id: 'marin', label: 'Marin', gender: 'female' },
  { id: 'coral', label: 'Coral', gender: 'female' },
  { id: 'nova', label: 'Nova', gender: 'female' },
  { id: 'shimmer', label: 'Shimmer', gender: 'female' },
  { id: 'sage', label: 'Sage', gender: 'female' },
  { id: 'cedar', label: 'Cedar', gender: 'male' },
  { id: 'ash', label: 'Ash', gender: 'male' },
  { id: 'verse', label: 'Verse', gender: 'male' },
  { id: 'echo', label: 'Echo', gender: 'male' },
  { id: 'onyx', label: 'Onyx', gender: 'male' },
  { id: 'ballad', label: 'Ballad', gender: 'male' },
  { id: 'fable', label: 'Fable', gender: 'male' },
  { id: 'alloy', label: 'Alloy', gender: 'neutral' },
];
const VOICE_IDS = new Set(TTS_VOICES.map((voice) => voice.id));
export const TTS_VOICE = VOICE_IDS.has(process.env.JARVIS_TTS_VOICE) ? process.env.JARVIS_TTS_VOICE : 'cedar';
// How fast the voice talks, 1 = the model's own pace (which reads Czech
// rather slowly). The panel lets each user pick their own.
export const TTS_SPEEDS = [1, 1.15, 1.3, 1.5];
export const TTS_SPEED = 1.15;
// The team speaks Czech, and short clips are easily mistaken for Slovak or
// Polish without a hint. Set JARVIS_STT_LANGUAGE= (empty) to auto-detect.
const STT_LANGUAGE = process.env.JARVIS_STT_LANGUAGE ?? 'cs';

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_SPEECH_CHARS = 4000;

// Words the transcriber would otherwise guess at.
const STT_PROMPT = 'Dotaz do aplikace Walter System (WSS): klienti, partneři, tipaři, zakázky, obor, zaměření, kraj, lokalita, Growth Club, Neveřejné.';

// Tone, not speed (that is the `speed` parameter): a person talking, not a
// narrator reading — the old "calm" wording made every answer drag.
const TTS_INSTRUCTIONS =
  'Mluv česky jako rodilý mluvčí, přirozeně a plynule, živým tempem běžného rozhovoru s kolegou. ' +
  'Používej přirozenou intonaci, nedělej zbytečné pauzy a nečti monotónně. Buď přátelský a věcný. ' +
  'Kódy záznamů jako K012-003 čti po znacích, čísla a částky česky.';

const AUDIO_EXTENSIONS = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

let client = null;
const getClient = () => {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
};

export const isVoiceConfigured = () => Boolean(process.env.OPENAI_API_KEY);

// The extension tells OpenAI the container; codecs parameters are dropped.
export const audioExtension = (mimeType) => AUDIO_EXTENSIONS[String(mimeType ?? '').split(';')[0].trim().toLowerCase()] ?? null;

export async function transcribe(buffer, mimeType, signal, userId = null) {
  const extension = audioExtension(mimeType) ?? 'webm';
  const result = await getClient().audio.transcriptions.create(
    {
      file: await toFile(buffer, `question.${extension}`),
      model: STT_MODEL,
      prompt: STT_PROMPT,
      ...(STT_LANGUAGE ? { language: STT_LANGUAGE } : {}),
    },
    { signal }
  );
  // gpt-4o-transcribe reports tokens, whisper-1 seconds.
  const usage = result.usage;
  recordAiUsage({
    provider: 'openai',
    model: STT_MODEL,
    feature: 'voice_stt',
    userId,
    ...(usage?.type === 'duration'
      ? { units: usage.seconds }
      : { input: usage?.input_tokens, output: usage?.output_tokens }),
  });
  return String(result.text ?? '').trim();
}

// Returns the fetch Response, so the MP3 can be streamed straight through.
// The speech API reports no usage; the log counts characters instead.
export function synthesize(text, signal, userId = null, { voice, speed } = {}) {
  recordAiUsage({ provider: 'openai', model: TTS_MODEL, feature: 'voice_tts', userId, units: text.length });
  return getClient().audio.speech.create(
    {
      model: TTS_MODEL,
      voice: VOICE_IDS.has(voice) ? voice : TTS_VOICE,
      input: text,
      response_format: 'mp3',
      speed: TTS_SPEEDS.includes(Number(speed)) ? Number(speed) : TTS_SPEED,
      // Only the gpt-4o TTS models take instructions; tts-1 rejects them.
      ...(TTS_MODEL.startsWith('gpt-') ? { instructions: TTS_INSTRUCTIONS } : {}),
    },
    { signal }
  );
}
