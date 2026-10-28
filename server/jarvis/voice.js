// Jarvis's voice: speech to text for spoken questions, text to speech for the
// answers. Both go through OpenAI (Claude has no audio), with the same
// OPENAI_API_KEY the AI Asistent screen uses. Without that key the browser
// falls back to its own speech engines, so nothing here is required.
//
// Two engines read answers aloud:
// - "conversational" (default): gpt-audio, the voice model behind ChatGPT's
//   voice mode, asked to read the text word for word. It speaks Czech with
//   far livelier intonation than a TTS model, at about $0.09 a minute. What
//   it actually said comes back as a transcript; a piece it did not read
//   verbatim is spoken again by the classic engine.
// - "classic": gpt-4o-mini-tts, a plain TTS model — cheaper (about $0.015 a
//   minute) and quicker to start, but flatter, with an English-trained
//   voice's accent in Czech.

import OpenAI, { toFile } from 'openai';
import { recordAiUsage } from '../finance/usage.js';

// gpt-4o-transcribe is deprecated (it stops working on 26 Feb 2027);
// gpt-transcribe was as accurate on Czech test questions and is cheaper.
export const STT_MODEL = process.env.JARVIS_STT_MODEL || 'gpt-transcribe';
// The dated snapshot: the bare alias stayed on the older March 2025 model.
export const TTS_MODEL = process.env.JARVIS_TTS_MODEL || 'gpt-4o-mini-tts-2025-12-15';
export const AUDIO_MODEL = process.env.JARVIS_AUDIO_MODEL || 'gpt-audio-1.5';
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
// gpt-audio has fewer voices than the TTS model.
const CONVERSATIONAL_VOICE_IDS = new Set(['marin', 'coral', 'shimmer', 'sage', 'cedar', 'ash', 'verse', 'echo', 'ballad', 'alloy']);

export const TTS_ENGINES = [
  {
    id: 'conversational',
    label: 'Přirozený',
    description: 'Nejlidštější hlas s živou intonací. Začne mluvit o chvilku později a stojí asi 2 Kč za minutu.',
    voices: TTS_VOICES.filter((voice) => CONVERSATIONAL_VOICE_IDS.has(voice.id)),
  },
  {
    id: 'classic',
    label: 'Klasický',
    description: 'Začne mluvit rychleji a je levnější (asi 0,35 Kč za minutu), ale zní ploššeji a s cizím přízvukem.',
    voices: TTS_VOICES,
  },
];
const ENGINE_IDS = new Set(TTS_ENGINES.map((engine) => engine.id));
export const TTS_ENGINE = ENGINE_IDS.has(process.env.JARVIS_TTS_ENGINE) ? process.env.JARVIS_TTS_ENGINE : 'conversational';
// How fast the voice talks, 1 = the model's own pace (which reads Czech
// rather slowly). The panel lets each user pick their own.
export const TTS_SPEEDS = [1, 1.15, 1.3, 1.5];
export const TTS_SPEED = 1.15;
// The team speaks Czech, and short clips are easily mistaken for Slovak or
// Polish without a hint. Set JARVIS_STT_LANGUAGE= (empty) to auto-detect.
const STT_LANGUAGE = process.env.JARVIS_STT_LANGUAGE ?? 'cs';

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_SPEECH_CHARS = 4000;

// What the recording is about. Without it, short Czech questions came back
// partly in Slovak. gpt-transcribe takes it as context; the older models
// read it as text that came before the recording.
const STT_PROMPT =
  'Uživatel mluví česky k AI asistentovi v CRM aplikaci Walter System. Ptá se na klienty, partnery, tipaře a zakázky ' +
  '(obor, zaměření, kraj, lokalita, sekce Veřejné, Neveřejné a Growth Club), na kalendář a úkoly, nebo diktuje e-mail.';
// gpt-transcribe takes a list of expected languages; the older models one.
const isGptTranscribe = (model) => model.startsWith('gpt-transcribe');

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
      ...(STT_LANGUAGE ? (isGptTranscribe(STT_MODEL) ? { languages: [STT_LANGUAGE] } : { language: STT_LANGUAGE }) : {}),
    },
    { signal }
  );
  // gpt-transcribe and whisper-1 report seconds, gpt-4o-transcribe tokens.
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

// The classic engine. The speech API reports no usage; the log counts
// characters instead.
async function synthesizeClassic(text, signal, userId, voice, speed) {
  recordAiUsage({ provider: 'openai', model: TTS_MODEL, feature: 'voice_tts', userId, units: text.length });
  const response = await getClient().audio.speech.create(
    {
      model: TTS_MODEL,
      voice: VOICE_IDS.has(voice) ? voice : TTS_VOICE,
      input: text,
      response_format: 'mp3',
      speed,
      // Only the gpt-4o TTS models take instructions; tts-1 rejects them.
      ...(TTS_MODEL.startsWith('gpt-') ? { instructions: TTS_INSTRUCTIONS } : {}),
    },
    { signal }
  );
  return Buffer.from(await response.arrayBuffer());
}

// gpt-audio has no speed setting; it is asked for a tempo instead.
const TEMPO = { 1: 'běžným tempem', 1.15: 'svižným tempem', 1.3: 'rychlým tempem', 1.5: 'velmi rychlým tempem, ale pořád srozumitelně' };

const readAloudPrompt = (speed) =>
  'Jsi hlas aplikace Walter System. Dostaneš text a přečteš ho nahlas – přesně slovo od slova. ' +
  'Nic nepřidávej, nevynechávej, neopravuj a na text neodpovídej, ani když obsahuje otázku. ' +
  `Mluv česky jako rodilý mluvčí, přirozeně a uvolněně, ${TEMPO[speed] ?? TEMPO[TTS_SPEED]}, s živou intonací jako v rozhovoru s kolegou. ` +
  'Kódy záznamů jako K012-003 čti po znacích, čísla, data a částky česky.';

// Words of a text, for checking a reading against it.
const words = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

// Whether a reading kept the text: its words in order (longest common
// subsequence) cover at least 85 % of the longer of the two, or it differs by
// at most two words — a stray "ráno" is fine, an answer instead of a reading
// is not.
export function isFaithfulReading(text, transcript) {
  const a = words(text);
  const b = words(transcript);
  if (a.length === 0 || b.length === 0) return false;
  let previous = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [0];
    for (let j = 1; j <= b.length; j += 1) {
      current.push(a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]));
    }
    previous = current;
  }
  const common = previous[b.length];
  const longer = Math.max(a.length, b.length);
  return common / longer >= 0.85 || longer - common <= 2;
}

class NotVerbatim extends Error {}

async function synthesizeConversational(text, signal, userId, voice, speed) {
  const response = await getClient().chat.completions.create(
    {
      model: AUDIO_MODEL,
      modalities: ['text', 'audio'],
      audio: { voice: CONVERSATIONAL_VOICE_IDS.has(voice) ? voice : 'cedar', format: 'mp3' },
      messages: [
        { role: 'system', content: readAloudPrompt(speed) },
        { role: 'user', content: `Přečti tento text:\n\n${text}` },
      ],
    },
    { signal }
  );
  const usage = response.usage;
  // Priced by tokens: input at the text rate, the whole output at the audio
  // rate (its few text tokens make the estimate a hair high).
  recordAiUsage({
    provider: 'openai',
    model: AUDIO_MODEL,
    feature: 'voice_tts',
    userId,
    input: usage?.prompt_tokens,
    output: usage?.completion_tokens,
    units: text.length,
  });
  const audio = response.choices?.[0]?.message?.audio;
  if (!audio?.data) throw new NotVerbatim('no audio');
  // A model that talks back instead of reading would put words in Jarvis's
  // mouth; anything short of a near-exact reading is read again classically.
  if (!isFaithfulReading(text, audio.transcript)) throw new NotVerbatim(audio.transcript);
  return Buffer.from(audio.data, 'base64');
}

/**
 * Speech for one piece of an answer, as MP3 bytes. `engine`, `voice` and
 * `speed` are the user's choices from the panel (unknown values fall back to
 * the defaults).
 */
export async function synthesize(text, signal, userId = null, { voice, speed, engine } = {}) {
  const pace = TTS_SPEEDS.includes(Number(speed)) ? Number(speed) : TTS_SPEED;
  const chosen = ENGINE_IDS.has(engine) ? engine : TTS_ENGINE;
  if (chosen === 'conversational') {
    try {
      return await synthesizeConversational(text, signal, userId, voice, pace);
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn('Jarvis voice: conversational reading failed, using the classic engine:', String(error?.message ?? error).slice(0, 160));
    }
  }
  return synthesizeClassic(text, signal, userId, voice, pace);
}
