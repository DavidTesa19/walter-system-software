// Jarvis's voice: speech to text for spoken questions, text to speech for the
// answers. Both go through OpenAI (Claude has no audio), with the same
// OPENAI_API_KEY the AI Asistent screen uses. Without that key the browser
// falls back to its own speech engines, so nothing here is required.
//
// Two engines read answers aloud, both voice models asked to read the text
// word for word. What they actually said comes back as a transcript; a piece
// one did not read verbatim (or failed on) is read by the other.
// - "realtime" (default): gpt-realtime-2.1-mini over the Realtime API, OpenAI's
//   successor to its TTS models. On 2026-10-28 it finished a first sentence in
//   ~1.5 s against gpt-audio's ~2.6 s, sounded about the same and costs about
//   a quarter (~$0.027 a minute).
// - "conversational": gpt-audio-1.5 through chat completions, the engine
//   Jarvis used before (~$0.1 a minute).
// The plain TTS model (gpt-4o-mini-tts) is gone: it shuts down on 6 Jan 2027.

import OpenAI, { toFile } from 'openai';
import WebSocket from 'ws';
import { recordAiUsage } from '../finance/usage.js';

// gpt-4o-transcribe is deprecated (it stops working on 26 Feb 2027);
// gpt-transcribe was as accurate on Czech test questions and is cheaper.
export const STT_MODEL = process.env.JARVIS_STT_MODEL || 'gpt-transcribe';
export const REALTIME_MODEL = process.env.JARVIS_REALTIME_MODEL || 'gpt-realtime-2.1-mini';
export const AUDIO_MODEL = process.env.JARVIS_AUDIO_MODEL || 'gpt-audio-1.5';
// The voices people can pick from in the Jarvis panel: the three of each
// gender that read Czech best when all nine of gpt-audio's voices read the
// same answers (2026-10-28: accent, intonation and how well a transcriber
// understood them; the differences were small). Each has a face in the panel
// (client/src/jarvis/VoiceAvatar.tsx). All six are on both engines and on
// gpt-realtime-2.1-mini, the TTS models' successor.
export const TTS_VOICES = [
  { id: 'marin', label: 'Marin', gender: 'female', description: 'Přirozená a vlídná' },
  { id: 'shimmer', label: 'Shimmer', gender: 'female', description: 'Jasná a energická' },
  { id: 'coral', label: 'Coral', gender: 'female', description: 'Vřelá a přátelská' },
  { id: 'cedar', label: 'Cedar', gender: 'male', description: 'Klidný, hlubší hlas' },
  { id: 'verse', label: 'Verse', gender: 'male', description: 'Živý a výrazný' },
  { id: 'echo', label: 'Echo', gender: 'male', description: 'Věcný a vyrovnaný' },
];
const VOICE_IDS = new Set(TTS_VOICES.map((voice) => voice.id));
// A voice no longer offered (an older choice) reads in the default one.
export const TTS_VOICE = VOICE_IDS.has(process.env.JARVIS_TTS_VOICE) ? process.env.JARVIS_TTS_VOICE : 'cedar';

export const TTS_ENGINES = [
  {
    id: 'realtime',
    label: 'Rychlý',
    description: 'Začne mluvit nejdřív a je nejlevnější, asi 0,6 Kč za minutu.',
    voices: TTS_VOICES,
  },
  {
    id: 'conversational',
    label: 'Původní',
    description: 'Hlas, kterým Jarvis mluvil dosud. Zní podobně, ale začne mluvit o chvilku později a stojí asi 2 Kč za minutu.',
    voices: TTS_VOICES,
  },
];
const ENGINE_IDS = new Set(TTS_ENGINES.map((engine) => engine.id));
// An engine no longer offered ("classic", stored by older panels) reads in the default.
export const TTS_ENGINE = ENGINE_IDS.has(process.env.JARVIS_TTS_ENGINE) ? process.env.JARVIS_TTS_ENGINE : 'realtime';
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

// What a spoken question is likely to name, sent by the panel with the
// recording: the open record and the names and codes in Jarvis's last answer
// (`keywords`, exact spellings), and that answer itself (`context`). On test
// questions with uncommon Czech names they cut word errors from 17 % to
// about 11 %. Keywords are hints: a name nobody said stays out of the text.
const MAX_KEYWORDS = 40;
const MAX_KEYWORD_CHARS = 80;
const MAX_CONTEXT_CHARS = 600;
const NO_HINTS = { keywords: [], context: '' };

// The X-Jarvis-Hints header: base64 of a JSON object (names are not ASCII).
// gpt-transcribe refuses keywords with angle brackets or line breaks.
export function readTranscriptionHints(header) {
  if (typeof header !== 'string' || !header) return NO_HINTS;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch {
    return NO_HINTS;
  }
  const seen = new Set();
  const keywords = [];
  for (const raw of Array.isArray(parsed?.keywords) ? parsed.keywords : []) {
    if (typeof raw !== 'string') continue;
    const keyword = raw.replace(/[<>\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const key = keyword.toLocaleLowerCase('cs');
    if (keyword.length < 2 || keyword.length > MAX_KEYWORD_CHARS || seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
    if (keywords.length === MAX_KEYWORDS) break;
  }
  const context = typeof parsed?.context === 'string' ? parsed.context.replace(/\s+/g, ' ').trim().slice(0, MAX_CONTEXT_CHARS) : '';
  return { keywords, context };
}

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

export async function transcribe(buffer, mimeType, signal, userId = null, { keywords = [], context = '' } = NO_HINTS) {
  const extension = audioExtension(mimeType) ?? 'webm';
  const modern = isGptTranscribe(STT_MODEL);
  let prompt = context ? `${STT_PROMPT}\nPředchozí odpověď asistenta: ${context}` : STT_PROMPT;
  // The older models have no keywords field; names in the prompt work there.
  if (!modern && keywords.length) prompt += `\nJména a kódy: ${keywords.join(', ')}`;
  const result = await getClient().audio.transcriptions.create(
    {
      file: await toFile(buffer, `question.${extension}`),
      model: STT_MODEL,
      prompt,
      ...(STT_LANGUAGE ? (modern ? { languages: [STT_LANGUAGE] } : { language: STT_LANGUAGE }) : {}),
      ...(modern && keywords.length ? { keywords } : {}),
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

// Record codes are spelled out in Czech before reading. Left to the model,
// "K012-003" now and then came out as "K zero jedna dva".
const LETTER_NAMES = {
  A: 'á', B: 'bé', C: 'cé', D: 'dé', E: 'é', F: 'ef', G: 'gé', H: 'há', I: 'í', J: 'jé', K: 'ká', L: 'el', M: 'em',
  N: 'en', O: 'ó', P: 'pé', Q: 'kvé', R: 'er', S: 'es', T: 'té', U: 'ú', V: 'vé', W: 'dvojité vé', X: 'iks', Y: 'ypsilon', Z: 'zet',
};
const DIGIT_NAMES = ['nula', 'jedna', 'dva', 'tři', 'čtyři', 'pět', 'šest', 'sedm', 'osm', 'devět'];
const RECORD_CODE = /\b([A-Z]{1,3})(\d{2,4})(?:-(\d{2,4}))?\b/g;
const spellDigits = (digits) => [...digits].map((digit) => DIGIT_NAMES[digit]).join(' ');

export const spellCodes = (text) =>
  text.replace(RECORD_CODE, (_, letters, first, second) => {
    const spelled = `${[...letters].map((letter) => LETTER_NAMES[letter]).join(' ')} ${spellDigits(first)}`;
    return second ? `${spelled}, ${spellDigits(second)}` : spelled;
  });

// gpt-audio has no speed setting; it is asked for a tempo instead.
const TEMPO = { 1: 'běžným tempem', 1.15: 'svižným tempem', 1.3: 'rychlým tempem', 1.5: 'velmi rychlým tempem, ale pořád srozumitelně' };

// `tempo` only for gpt-audio; the realtime model has a speed setting.
const readAloudPrompt = (tempo) =>
  'Jsi hlas aplikace Walter System. Dostaneš text a přečteš ho nahlas – přesně slovo od slova. ' +
  'Nic nepřidávej, nevynechávej, neopravuj a na text neodpovídej, ani když obsahuje otázku. ' +
  `Mluv česky jako rodilý mluvčí, přirozeně a uvolněně${tempo ? `, ${tempo}` : ''}, s živou intonací jako v rozhovoru s kolegou. ` +
  'Čísla, data a částky čti česky.';

// Words of a text, for checking a reading against it.
const words = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

// Numbers, digits and letters read out one by one come back in the transcript
// either way ("30." or "třicátého", "K012" or "ká nula jedna dva"), so they
// are left out of the comparison.
const SPOKEN_SYMBOLS = new Set([...DIGIT_NAMES, ...Object.values(LETTER_NAMES).flatMap((name) => name.split(' ')), 'zero']);
const comparable = (word) => !/\d/.test(word) && !SPOKEN_SYMBOLS.has(word);

// Whether a reading kept the text: at most two words (or 15 %) of the text
// missing from the transcript in order (longest common subsequence), and at
// most as many extra — a stray "ráno" is fine, an answer instead of a reading
// is not. Each number may come back as up to four words ("2026").
export function isFaithfulReading(text, transcript) {
  const all = words(text);
  const said = words(transcript);
  if (all.length === 0 || said.length === 0) return false;
  const numbers = all.filter((word) => /\d/.test(word)).length;
  const a = all.filter(comparable);
  const b = said.filter(comparable);
  let previous = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [0];
    for (let j = 1; j <= b.length; j += 1) {
      current.push(a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]));
    }
    previous = current;
  }
  const common = previous[b.length];
  const fits = (count) => count <= 2 || count / Math.max(a.length, 1) <= 0.15;
  return fits(a.length - common) && fits(b.length - common - 4 * numbers);
}

class NotVerbatim extends Error {}

// Raw 16-bit mono PCM in a WAV header, which every browser decodes.
function wav(pcm, rate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const REALTIME_RATE = 24000;
const REALTIME_TIMEOUT_MS = 30_000;
// A piece is at most ~320 characters (~20 s, ~500 audio tokens); the cap only
// stops a model that would talk on.
const REALTIME_MAX_OUTPUT_TOKENS = 1500;
// Output prices per million tokens: the transcript (and the little reasoning)
// is text, priced far below the audio.
const REALTIME_TEXT_TO_AUDIO_PRICE = 2.4 / 20;

// The default engine. The realtime model has no plain HTTP endpoint: each
// piece is one short WebSocket session (one message in, one spoken reply
// out). Minimal reasoning: with the default, the first sentence took ~0.7 s
// longer and nothing sounded better.
function synthesizeRealtime(text, signal, userId, voice, speed) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('aborted'));
      return;
    }
    const socket = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(REALTIME_MODEL)}`, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    });
    const chunks = [];
    let transcript = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      socket.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    const onAbort = () => finish(signal.reason ?? new Error('aborted'));
    const timer = setTimeout(() => finish(new Error('the realtime reading timed out')), REALTIME_TIMEOUT_MS);
    signal?.addEventListener('abort', onAbort, { once: true });
    socket.on('error', (error) => finish(error));
    socket.on('close', () => finish(new Error('the realtime connection closed')));
    socket.on('open', () => {
      const send = (event) => socket.send(JSON.stringify(event));
      send({
        type: 'session.update',
        session: {
          type: 'realtime',
          instructions: readAloudPrompt(null),
          output_modalities: ['audio'],
          reasoning: { effort: 'minimal' },
          max_output_tokens: REALTIME_MAX_OUTPUT_TOKENS,
          audio: { output: { voice, speed, format: { type: 'audio/pcm', rate: REALTIME_RATE } } },
        },
      });
      send({
        type: 'conversation.item.create',
        item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `Přečti tento text:\n\n${text}` }] },
      });
      send({ type: 'response.create' });
    });
    socket.on('message', (data) => {
      let message;
      try {
        message = JSON.parse(String(data));
      } catch {
        return;
      }
      if (message.type === 'response.output_audio.delta') chunks.push(Buffer.from(message.delta, 'base64'));
      else if (message.type === 'response.output_audio_transcript.done') transcript = message.transcript ?? '';
      else if (message.type === 'error') finish(new Error(message.error?.message ?? 'realtime error'));
      else if (message.type === 'response.done') {
        const usage = message.response?.usage;
        const output = usage?.output_token_details;
        recordAiUsage({
          provider: 'openai',
          model: REALTIME_MODEL,
          feature: 'voice_tts',
          userId,
          input: usage?.input_tokens,
          output: (output?.audio_tokens ?? 0) + Math.round(((output?.text_tokens ?? 0) + (output?.reasoning_tokens ?? 0)) * REALTIME_TEXT_TO_AUDIO_PRICE),
          units: text.length,
        });
        if (message.response?.status !== 'completed') finish(new Error(`the realtime reading ended as ${message.response?.status}`));
        else if (chunks.length === 0) finish(new NotVerbatim('no audio'));
        // A model that talks back instead of reading would put words in
        // Jarvis's mouth.
        else if (!isFaithfulReading(text, transcript)) finish(new NotVerbatim(transcript));
        else finish(null, { audio: wav(Buffer.concat(chunks), REALTIME_RATE), contentType: 'audio/wav' });
      }
    });
  });
}

async function synthesizeConversational(text, signal, userId, voice, speed) {
  const response = await getClient().chat.completions.create(
    {
      model: AUDIO_MODEL,
      modalities: ['text', 'audio'],
      audio: { voice, format: 'mp3' },
      messages: [
        { role: 'system', content: readAloudPrompt(TEMPO[speed] ?? TEMPO[TTS_SPEED]) },
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
  if (!isFaithfulReading(text, audio.transcript)) throw new NotVerbatim(audio.transcript);
  return { audio: Buffer.from(audio.data, 'base64'), contentType: 'audio/mpeg' };
}

const ENGINES = { realtime: synthesizeRealtime, conversational: synthesizeConversational };

/**
 * Speech for one piece of an answer: `{ audio, contentType }` (WAV from the
 * realtime engine, MP3 from gpt-audio). `engine`, `voice` and `speed` are the
 * user's choices from the panel (unknown values fall back to the defaults).
 * When the chosen engine fails or does not read the piece verbatim, the other
 * one reads it; when both fail, the browser's own voice takes over.
 */
export async function synthesize(text, signal, userId = null, { voice, speed, engine } = {}) {
  const pace = TTS_SPEEDS.includes(Number(speed)) ? Number(speed) : TTS_SPEED;
  const chosen = ENGINE_IDS.has(engine) ? engine : TTS_ENGINE;
  const speaker = VOICE_IDS.has(voice) ? voice : TTS_VOICE;
  const spoken = spellCodes(text);
  let failure = null;
  for (const id of [chosen, ...[...ENGINE_IDS].filter((other) => other !== chosen)]) {
    try {
      return await ENGINES[id](spoken, signal, userId, speaker, pace);
    } catch (error) {
      if (signal?.aborted) throw error;
      failure = error;
      console.warn(`Jarvis voice: the ${id} reading failed:`, String(error?.message ?? error).slice(0, 160));
    }
  }
  throw failure;
}
