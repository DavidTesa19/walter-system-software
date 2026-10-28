// Jarvis's voice, browser side: recording a spoken question, and reading an
// answer aloud. With the server's voice (OpenAI) the audio goes there both
// ways; without it the browser's own speech engines stand in.

// ---------- answer text → something worth hearing ----------

// Markdown read aloud verbatim is noise ("hvězdička hvězdička"), so the answer
// is flattened first: table rows become comma lists, links their text, and
// every line ends in a full stop so the voice pauses between items.
export function toSpeechText(markdown: string): string {
  const isRule = (line: string) => /^[\s|:-]+$/.test(line) && line.includes('-');
  const raw = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .split('\n')
    .map((line) => line.trim());
  const lines = raw
    // A table's header row (the one above its |---| row) is not worth hearing.
    .map((line, index) => (line.startsWith('|') && isRule(raw[index + 1] ?? '') ? '' : line))
    .map((line) => {
      // Table separator rows and horizontal rules.
      if (isRule(line)) return '';
      if (line.startsWith('|')) {
        return line
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((cell) => cell.trim())
          .filter(Boolean)
          .join(', ');
      }
      return line.replace(/^#{1,6}\s+/, '').replace(/^>\s?/, '').replace(/^[-*+]\s+/, '');
    })
    .map((line) => line.replace(/(\*\*|__|~~|`)/g, '').replace(/(^|[\s(])[*_](\S[^*_]*\S|\S)[*_](?=[\s.,!?:;)]|$)/g, '$1$2'))
    .map((line) => line.replace(/\p{Extended_Pictographic}/gu, '').trim())
    .filter(Boolean)
    .map((line) => (/[.!?:;,…]$/.test(line) ? line : `${line}.`));
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

// Pieces small enough to start speaking quickly: a short first piece, then
// longer ones that are fetched while the previous one plays. Splits only
// before a capital letter, so "19. 10. 2026" stays in one piece.
export function splitForSpeech(text: string, firstLimit = 220, limit = 650): string[] {
  const sentences = text.split(/(?<=[.!?…])\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ„"(])/u);
  const pieces: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) pieces.push(current.trim());
    current = '';
  };
  for (const sentence of sentences) {
    const max = pieces.length === 0 ? firstLimit : limit;
    if (current && current.length + sentence.length + 1 > max) flush();
    if (sentence.length <= (pieces.length === 0 ? firstLimit : limit)) {
      current = current ? `${current} ${sentence}` : sentence;
      continue;
    }
    // One very long sentence: break it between words.
    let rest = sentence;
    while (rest.length > limit) {
      const cut = rest.lastIndexOf(' ', limit);
      pieces.push(rest.slice(0, cut > 0 ? cut : limit).trim());
      rest = rest.slice(cut > 0 ? cut : limit);
    }
    current = rest.trim();
  }
  flush();
  return pieces;
}

// ---------- conversation ----------

// Said instead of a next question, these end a spoken conversation rather
// than going to Jarvis ("děkuji, to je vše").
const CONVERSATION_ENDINGS = new Set([
  'konec',
  'konec rozhovoru',
  'ukonči rozhovor',
  'ukončit',
  'stačí',
  'to stačí',
  'to je vše',
  'to je všechno',
  'to je zatím vše',
  'to je zatím všechno',
  'nic',
  'nic dalšího',
  'nic víc',
  'už nic',
  'díky',
  'děkuji',
  'děkuju',
  'dobře díky',
  'ne díky',
  'ne děkuji',
  'ne děkuju',
  'díky to je vše',
  'děkuji to je vše',
  'děkuju to je vše',
  'díky to je všechno',
  'děkuji to je všechno',
  'děkuju to je všechno',
  'na shledanou',
]);

export function isConversationEnd(text: string): boolean {
  const normalized = text
    .toLocaleLowerCase('cs')
    .replace(/[.,!?…;:„“"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return CONVERSATION_ENDINGS.has(normalized);
}

// A short rising tone: the microphone is on again by itself, speak now.
export async function playListenCue() {
  try {
    const ctx = audioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const start = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    gain.connect(ctx.destination);
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(660, start);
    tone.frequency.setValueAtTime(880, start + 0.09);
    tone.connect(gain);
    tone.start(start);
    tone.stop(start + 0.24);
    // The recording measures the room's noise in its first moments; let the
    // tone finish first.
    await new Promise((resolve) => window.setTimeout(resolve, 260));
  } catch {
    // No Web Audio: listening starts without the tone.
  }
}

// ---------- speaking ----------

export interface Speaker {
  // Resolves when the text has been read, or as soon as stop() is called.
  // `rate` is the browser voice's speed; the server voice gets its speed with
  // each request instead (the server speeds speech up without changing pitch).
  speak(text: string, options?: { rate?: number }): Promise<void>;
  stop(): void;
}

let sharedContext: AudioContext | null = null;
const audioContext = () => {
  if (!sharedContext || sharedContext.state === 'closed') sharedContext = new AudioContext();
  return sharedContext;
};

// Safari only lets audio start inside a click or key press. Call this from
// one (the mic button, sending a question) so a later answer can play.
export function unlockAudio() {
  try {
    void audioContext().resume();
  } catch {
    // No Web Audio: the browser speaker does not need it.
  }
}

// Reads through the server: each piece comes back as an MP3, the next is
// fetched while the current one plays.
export function createServerSpeaker(fetchAudio: (text: string, signal: AbortSignal) => Promise<Blob>): Speaker {
  let controller: AbortController | null = null;
  let source: AudioBufferSourceNode | null = null;

  const stop = () => {
    controller?.abort();
    controller = null;
    try {
      source?.stop();
    } catch {
      // Already finished.
    }
    source = null;
  };

  const play = (buffer: AudioBuffer, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      const ctx = audioContext();
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(ctx.destination);
      node.onended = () => resolve();
      signal.addEventListener('abort', () => resolve(), { once: true });
      source = node;
      node.start();
    });

  const speak = async (text: string) => {
    stop();
    const own = new AbortController();
    controller = own;
    const pieces = splitForSpeech(text);
    const pending: Array<Promise<AudioBuffer>> = [];
    const load = (index: number) =>
      (pending[index] ??= fetchAudio(pieces[index], own.signal).then(async (blob) => audioContext().decodeAudioData(await blob.arrayBuffer())));
    try {
      const ctx = audioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      for (let index = 0; index < pieces.length; index += 1) {
        const buffer = await load(index);
        if (own.signal.aborted) return;
        if (index + 1 < pieces.length) load(index + 1).catch(() => undefined);
        await play(buffer, own.signal);
        if (own.signal.aborted) return;
      }
    } catch (error) {
      if (own.signal.aborted) return;
      throw error;
    } finally {
      if (controller === own) controller = null;
    }
  };

  return { speak, stop };
}

// The browser's own voices. Quality depends on the system: Edge has natural
// Czech voices, Chrome on Windows only the older "Microsoft Jakub".
export function createBrowserSpeaker(): Speaker | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const synth = window.speechSynthesis;
  let finish: (() => void) | null = null;

  const pickVoice = () => {
    const czech = synth.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('cs'));
    return czech.find((voice) => /natural|online|neural/i.test(voice.name)) ?? czech[0] ?? null;
  };

  const stop = () => {
    synth.cancel();
    finish?.();
    finish = null;
  };

  const speak = (text: string, options?: { rate?: number }) => {
    stop();
    // Chrome cuts off utterances after ~15 s, so read sentence-sized pieces.
    const pieces = splitForSpeech(text, 200, 200);
    if (pieces.length === 0) return Promise.resolve();
    const voice = pickVoice();
    return new Promise<void>((resolve) => {
      finish = resolve;
      pieces.forEach((piece, index) => {
        const utterance = new SpeechSynthesisUtterance(piece);
        utterance.lang = 'cs-CZ';
        utterance.rate = options?.rate ?? 1;
        if (voice) utterance.voice = voice;
        if (index === pieces.length - 1) {
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
        }
        synth.speak(utterance);
      });
    });
  };

  return { speak, stop };
}

// ---------- listening ----------

export type RecordingEnd = 'stopped' | 'silence' | 'cancelled' | 'no-speech' | 'limit';

export interface Recording {
  // Ends the recording and hands over what was said.
  stop(): void;
  // Ends it and throws the audio away.
  cancel(): void;
  result: Promise<{ blob: Blob | null; end: RecordingEnd }>;
}

const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export const canRecord = () =>
  typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

const NO_SPEECH_TIMEOUT_MS = 8000;
const MAX_RECORDING_MS = 120_000;
// Sent by hand, a question can be long: a dictated note, a list of changes.
const MAX_MANUAL_RECORDING_MS = 300_000;

export interface ListenOptions {
  // true: the question goes off by itself after `silenceMs` of silence.
  // false: listening goes on until stop() (the send button).
  autoStop: boolean;
  silenceMs: number;
  // Give up when nothing is said for this long, in either mode (the
  // microphone reopened after an answer and the user has nothing to add).
  // Without it, only `autoStop` listening gives up, after 8 s.
  noSpeechMs?: number;
}

const DEFAULT_LISTEN: ListenOptions = { autoStop: true, silenceMs: 2500 };

// Records from the microphone until stop(), or until the speaker pauses after
// saying something (so a question goes off by itself, like in a call).
// onLevel gets the input loudness 0–1 for the meter.
export async function startRecording(onLevel: (level: number) => void, options: ListenOptions = DEFAULT_LISTEN): Promise<Recording> {
  // The shared context, unlocked by an earlier click: Safari keeps a context
  // made outside one suspended, and the pause detection with it. That matters
  // when the microphone reopens by itself after an answer.
  const ctx = audioContext();
  void ctx.resume();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  let recorder: MediaRecorder;
  try {
    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const input = ctx.createMediaStreamSource(stream);
  input.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  let end: RecordingEnd = 'stopped';
  let resolveResult: (value: { blob: Blob | null; end: RecordingEnd }) => void = () => undefined;
  const result = new Promise<{ blob: Blob | null; end: RecordingEnd }>((resolve) => {
    resolveResult = resolve;
  });

  const startedAt = Date.now();
  const noSpeechMs = options.noSpeechMs ?? (options.autoStop ? NO_SPEECH_TIMEOUT_MS : Infinity);
  let floor = 0;
  let floorSamples = 0;
  let speechMs = 0;
  let lastLoudAt = 0;

  const finish = (reason: RecordingEnd) => {
    if (recorder.state === 'inactive') return;
    end = reason;
    recorder.stop();
  };

  // A timer rather than requestAnimationFrame, which stops in background tabs.
  const timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const rms = Math.sqrt(sum / samples.length);
    onLevel(Math.min(1, Math.sqrt(rms / 0.2)));

    const now = Date.now();
    // The first 300 ms set the room's noise floor; speech is well above it.
    if (now - startedAt < 300) {
      floor = (floor * floorSamples + rms) / (floorSamples + 1);
      floorSamples += 1;
      return;
    }
    if (rms > Math.max(0.02, floor * 3)) {
      speechMs += 50;
      lastLoudAt = now;
    }
    const heardSpeech = speechMs >= 250;
    if (!heardSpeech && now - startedAt > noSpeechMs) {
      finish('no-speech');
      return;
    }
    if (!options.autoStop) {
      if (now - startedAt > MAX_MANUAL_RECORDING_MS) finish('limit');
      return;
    }
    if (heardSpeech && now - lastLoudAt > options.silenceMs) finish('silence');
    else if (now - startedAt > MAX_RECORDING_MS) finish('limit');
  }, 50);

  recorder.onstop = () => {
    window.clearInterval(timer);
    stream.getTracks().forEach((track) => track.stop());
    input.disconnect();
    onLevel(0);
    const keep = end !== 'cancelled' && end !== 'no-speech' && chunks.length > 0;
    resolveResult({ blob: keep ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null, end });
  };
  recorder.start(250);

  return {
    stop: () => finish('stopped'),
    cancel: () => finish('cancelled'),
    result,
  };
}

// ---------- listening without the server: the browser's recognizer ----------

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface BrowserRecognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognizerConstructor = new () => BrowserRecognizer;

const recognizerConstructor = (): RecognizerConstructor | null => {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { SpeechRecognition?: RecognizerConstructor; webkitSpeechRecognition?: RecognizerConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
};

export const canRecognizeInBrowser = () => recognizerConstructor() !== null;

export interface BrowserListening {
  stop(): void;
  cancel(): void;
  // The final text; empty when nothing was understood or it was cancelled.
  result: Promise<string>;
}

// Chrome, Edge and Safari can transcribe on their own (Chrome sends the audio
// to Google). The recognizer would end at its own short pause, so it runs
// continuously and the pause length is ours, as with the server's voice.
export function startBrowserRecognition(
  onInterim: (text: string) => void,
  onError: (code: string) => void,
  options: ListenOptions = DEFAULT_LISTEN
): BrowserListening {
  const Recognizer = recognizerConstructor();
  if (!Recognizer) throw new Error('Prohlížeč neumí rozpoznávat řeč.');
  const recognizer = new Recognizer();
  recognizer.lang = 'cs-CZ';
  recognizer.interimResults = true;
  recognizer.continuous = true;
  const startedAt = Date.now();
  const noSpeechMs = options.noSpeechMs ?? (options.autoStop ? NO_SPEECH_TIMEOUT_MS : Infinity);
  let lastHeardAt = 0;
  let heardText = '';

  let finalText = '';
  let cancelled = false;
  let resolveResult: (text: string) => void = () => undefined;
  const result = new Promise<string>((resolve) => {
    resolveResult = resolve;
  });

  recognizer.onresult = (event) => {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const item = event.results[index];
      if (item.isFinal) finalText += item[0].transcript;
      else interim += item[0].transcript;
    }
    heardText = `${finalText}${interim}`.trim();
    lastHeardAt = Date.now();
    onInterim(heardText);
  };
  const timer = window.setInterval(() => {
    const now = Date.now();
    if (!heardText && now - startedAt > noSpeechMs) {
      recognizer.stop();
      return;
    }
    if (!options.autoStop) {
      if (now - startedAt > MAX_MANUAL_RECORDING_MS) recognizer.stop();
      return;
    }
    if (heardText && now - lastHeardAt > options.silenceMs) recognizer.stop();
  }, 200);
  recognizer.onerror = (event) => {
    if (event.error !== 'aborted' && event.error !== 'no-speech') onError(event.error);
  };
  recognizer.onend = () => {
    window.clearInterval(timer);
    // Text still marked interim when it was stopped by hand counts too.
    resolveResult(cancelled ? '' : (finalText.trim() || heardText));
  };
  recognizer.start();

  return {
    stop: () => recognizer.stop(),
    cancel: () => {
      cancelled = true;
      recognizer.abort();
    },
    result,
  };
}
