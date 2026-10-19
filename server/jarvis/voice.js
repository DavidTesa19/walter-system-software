// Jarvis's voice: speech to text for spoken questions, text to speech for the
// answers. Both go through OpenAI (Claude has no audio), with the same
// OPENAI_API_KEY the AI Asistent screen uses. Without that key the browser
// falls back to its own speech engines, so nothing here is required.

import OpenAI, { toFile } from 'openai';

export const STT_MODEL = process.env.JARVIS_STT_MODEL || 'gpt-4o-transcribe';
export const TTS_MODEL = process.env.JARVIS_TTS_MODEL || 'gpt-4o-mini-tts';
export const TTS_VOICE = process.env.JARVIS_TTS_VOICE || 'onyx';
// The team speaks Czech, and short clips are easily mistaken for Slovak or
// Polish without a hint. Set JARVIS_STT_LANGUAGE= (empty) to auto-detect.
const STT_LANGUAGE = process.env.JARVIS_STT_LANGUAGE ?? 'cs';

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_SPEECH_CHARS = 4000;

// Words the transcriber would otherwise guess at.
const STT_PROMPT = 'Dotaz do aplikace Walter System (WSS): klienti, partneři, tipaři, zakázky, obor, zaměření, kraj, lokalita, Growth Club, Neveřejné.';

const TTS_INSTRUCTIONS = 'Mluv česky s přirozenou českou výslovností, klidně, věcně a srozumitelně, jako zkušený osobní asistent. Kódy záznamů jako K012-003 čti po znacích.';

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

export async function transcribe(buffer, mimeType, signal) {
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
  return String(result.text ?? '').trim();
}

// Returns the fetch Response, so the MP3 can be streamed straight through.
export function synthesize(text, signal) {
  return getClient().audio.speech.create(
    {
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: text,
      response_format: 'mp3',
      // Only the gpt-4o TTS models take instructions; tts-1 rejects them.
      ...(TTS_MODEL.startsWith('gpt-') ? { instructions: TTS_INSTRUCTIONS } : {}),
    },
    { signal }
  );
}
