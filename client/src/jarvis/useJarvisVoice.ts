import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { jarvisApi } from './jarvisApi';
import {
  canRecognizeInBrowser,
  canRecord,
  createBrowserSpeaker,
  SpeechFailure,
  createServerSpeaker,
  createSpeechStream,
  playListenCue,
  startBrowserRecognition,
  startRecording,
  toSpeechText,
  unlockAudio,
} from './voice';
import type { TranscriptionHints } from './transcriptionHints';
import type { BrowserListening, ListenOptions, Recording, Speaker } from './voice';
import type { VoiceSettings } from './voiceSettings';

export type ListenState = 'idle' | 'starting' | 'listening' | 'transcribing';

// The microphone reopened after an answer gives up this soon when nobody
// speaks: the conversation is over.
const FOLLOW_UP_NO_SPEECH_MS = 7000;

// The last question as recorded, and with which microphone.
export interface LastRecording {
  url: string;
  device: string;
  avoided: string | null;
}

export interface TranscriptInfo {
  // Said into a microphone that reopened by itself after an answer.
  followUp: boolean;
}

const MIC_BLOCKED = 'Přístup k mikrofonu je zablokovaný. Povolte ho v prohlížeči (ikona vlevo od adresy stránky) a zkuste to znovu.';

const micError = (error: unknown) => {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return MIC_BLOCKED;
  if (name === 'NotFoundError') return 'Nenašel jsem žádný mikrofon.';
  if (name === 'NotReadableError') return 'Mikrofon právě používá jiná aplikace.';
  return 'Mikrofon se nepodařilo zapnout.';
};

const recognitionError = (code: string) => {
  if (code === 'not-allowed' || code === 'service-not-allowed') return MIC_BLOCKED;
  if (code === 'audio-capture') return 'Nenašel jsem žádný mikrofon.';
  if (code === 'network') return 'Rozpoznávání řeči v prohlížeči potřebuje připojení k internetu.';
  return 'Rozpoznávání řeči selhalo.';
};

// Jarvis's ears and mouth. `serverVoice` comes from /api/jarvis/status:
// true uses the server (OpenAI) both ways, false the browser's own engines,
// undefined (status not loaded yet) neither. `getHints` names what the next
// question probably mentions, for the server's transcription.
export function useJarvisVoice(
  serverVoice: boolean | undefined,
  onTranscript: (text: string, info: TranscriptInfo) => void,
  settings: VoiceSettings,
  getHints?: () => TranscriptionHints
) {
  const [listen, setListen] = useState<ListenState>('idle');
  // The current listening was started by the conversation, not by a click.
  const [followUp, setFollowUp] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [interim, setInterim] = useState('');
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The last question as recorded, to hear what Jarvis heard (voice menu).
  const [lastRecording, setLastRecording] = useState<LastRecording | null>(null);

  // The microphone's loudness 0–1, read by the meter on its own animation
  // frame so the panel does not re-render 20 times a second.
  const levelRef = useRef(0);
  const listenRef = useRef<ListenState>('idle');
  const recordingRef = useRef<Recording | null>(null);
  const browserRef = useRef<BrowserListening | null>(null);
  const transcribeAbortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const getHintsRef = useRef(getHints);
  // Read when speaking or listening starts, so a changed setting applies to
  // the next answer or question without rebuilding the speakers.
  const settingsRef = useRef(settings);
  const speakerRef = useRef<Speaker | null>(null);
  const speakTokenRef = useRef(0);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    getHintsRef.current = getHints;
  }, [getHints]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const listenOptions = (isFollowUp: boolean): ListenOptions => ({
    autoStop: settingsRef.current.sendMode === 'auto',
    silenceMs: settingsRef.current.pauseMs,
    ...(isFollowUp ? { noSpeechMs: FOLLOW_UP_NO_SPEECH_MS } : {}),
  });

  const setListenState = (state: ListenState) => {
    listenRef.current = state;
    setListen(state);
  };

  const useServer = serverVoice === true;
  const fetchSpeech = useCallback(
    (text: string, signal: AbortSignal) =>
      jarvisApi.speech(text, signal, {
        engine: settingsRef.current.engine,
        voice: settingsRef.current.voice,
        speed: settingsRef.current.speed,
      }),
    []
  );
  const serverSpeaker = useMemo(() => createServerSpeaker(fetchSpeech), [fetchSpeech]);
  const browserSpeaker = useMemo(() => createBrowserSpeaker(), []);
  const canListen = serverVoice !== undefined && (useServer ? canRecord() : canRecognizeInBrowser());
  const canSpeak = serverVoice !== undefined && (useServer || browserSpeaker !== null);

  const stopSpeaking = useCallback(() => {
    speakTokenRef.current += 1;
    speakerRef.current?.stop();
    speakerRef.current = null;
    setSpeakingKey(null);
  }, []);

  // Reads an answer aloud; `key` names it, so its button can show "stop".
  // If the server's voice fails, the browser's takes over for this answer.
  // Resolves true when it was read to the end, false when it was stopped.
  // `voice` and `engine` read in that voice and engine instead of the chosen
  // ones (a sample of a voice just picked, before the new choice has reached
  // the settings).
  const speak = useCallback(
    async (markdown: string, key: string, { voice, engine }: { voice?: string; engine?: string } = {}): Promise<boolean> => {
      stopSpeaking();
      const text = toSpeechText(markdown);
      if (!text) return false;
      const token = speakTokenRef.current;
      setSpeakingKey(key);
      const server =
        voice || engine
          ? createServerSpeaker((piece, signal) =>
              jarvisApi.speech(piece, signal, {
                engine: engine ?? settingsRef.current.engine,
                voice: voice ?? settingsRef.current.voice,
                speed: settingsRef.current.speed,
              })
            )
          : serverSpeaker;
      const speakers = (useServer ? [server, browserSpeaker] : [browserSpeaker]).filter((item): item is Speaker => item !== null);
      let unread = text;
      for (const speaker of speakers) {
        speakerRef.current = speaker;
        try {
          await speaker.speak(unread, { rate: settingsRef.current.speed });
          break;
        } catch (err) {
          console.warn('Jarvis: reading aloud failed', err);
          if (speakTokenRef.current !== token) return false;
          // What the server's voice already read is not read again.
          if (err instanceof SpeechFailure) unread = err.remaining;
        }
      }
      if (speakTokenRef.current !== token) return false;
      speakerRef.current = null;
      setSpeakingKey(null);
      return true;
    },
    [browserSpeaker, serverSpeaker, stopSpeaking, useServer]
  );

  // Starts reading an answer while Jarvis is still writing it, so the first
  // sentence is heard sooner. Server voice only: the browser's own voice is
  // instant anyway and reads the whole answer through speak().
  const streamSpeech = useCallback(
    (key: string) => {
      if (!useServer) return null;
      stopSpeaking();
      const token = speakTokenRef.current;
      const stream = createSpeechStream(fetchSpeech, {
        onStart: () => {
          if (speakTokenRef.current === token) setSpeakingKey(key);
        },
      });
      speakerRef.current = { speak: () => Promise.resolve(), stop: () => stream.stop() };
      const done = stream.done
        .catch(async (err: unknown) => {
          // The server's voice failed: the browser's reads the rest.
          if (speakTokenRef.current !== token || !(err instanceof SpeechFailure) || !browserSpeaker) return false;
          setSpeakingKey(key);
          speakerRef.current = browserSpeaker;
          await browserSpeaker.speak(err.remaining, { rate: settingsRef.current.speed });
          return true;
        })
        .then((finished) => {
          if (speakTokenRef.current !== token) return false;
          speakerRef.current = null;
          setSpeakingKey(null);
          return finished;
        });
      return {
        update: (markdown: string) => stream.update(markdown),
        // Resolves true when the whole answer was read, false when stopped.
        finish: (markdown: string) => {
          stream.finish(markdown);
          return done;
        },
        // What was written turned out not to be the answer (a note before a tool).
        cancel: () => {
          if (speakTokenRef.current === token) stopSpeaking();
        },
      };
    },
    [browserSpeaker, fetchSpeech, stopSpeaking, useServer]
  );

  // `followUp`: opened by the conversation after an answer, not by a click.
  // It announces itself with a tone and, when nobody speaks, quietly ends.
  const startListening = useCallback(async ({ followUp: isFollowUp = false }: { followUp?: boolean } = {}) => {
    if (listenRef.current !== 'idle' || !canListen) return;
    stopSpeaking();
    if (!isFollowUp) unlockAudio();
    setError(null);
    setInterim('');
    setFollowUp(isFollowUp);
    cancelledRef.current = false;
    const info: TranscriptInfo = { followUp: isFollowUp };

    // Waiting on the tone, or on the browser's microphone prompt the first time.
    setListenState('starting');
    if (isFollowUp) {
      await playListenCue();
      if (cancelledRef.current) {
        setListenState('idle');
        return;
      }
    }

    if (!useServer) {
      let listening: BrowserListening;
      try {
        listening = startBrowserRecognition(setInterim, (code) => setError(recognitionError(code)), listenOptions(isFollowUp));
      } catch (err) {
        setListenState('idle');
        setError(err instanceof Error ? err.message : 'Rozpoznávání řeči selhalo.');
        return;
      }
      browserRef.current = listening;
      setListenState('listening');
      const text = await listening.result;
      browserRef.current = null;
      setInterim('');
      setListenState('idle');
      if (text) onTranscriptRef.current(text, info);
      return;
    }

    let recording: Recording;
    try {
      recording = await startRecording((value) => {
        levelRef.current = value;
      }, listenOptions(isFollowUp));
    } catch (err) {
      setListenState('idle');
      setError(micError(err));
      return;
    }
    recordingRef.current = recording;
    if (cancelledRef.current) recording.cancel();
    else setListenState('listening');

    const { blob, end, device, avoided } = await recording.result;
    recordingRef.current = null;
    if (blob) {
      const url = URL.createObjectURL(blob);
      setLastRecording((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return { url, device, avoided };
      });
    }
    if (!blob) {
      setListenState('idle');
      // Silence after an answer just ends the conversation.
      if (end === 'no-speech' && !isFollowUp) setError('Nic jsem neslyšel. Zkuste to znovu, nebo zkontrolujte mikrofon.');
      return;
    }

    setListenState('transcribing');
    const controller = new AbortController();
    transcribeAbortRef.current = controller;
    try {
      const text = await jarvisApi.transcribe(blob, controller.signal, getHintsRef.current?.());
      if (controller.signal.aborted) return;
      if (text) onTranscriptRef.current(text, info);
      else setError('Nerozuměl jsem. Zkuste to prosím znovu.');
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Nahrávku se nepodařilo přepsat.');
    } finally {
      transcribeAbortRef.current = null;
      setListenState('idle');
    }
  }, [canListen, stopSpeaking, useServer]);

  // Done talking: send what was said now instead of waiting for the pause.
  const stopListening = useCallback(() => {
    recordingRef.current?.stop();
    browserRef.current?.stop();
  }, []);

  // Throw away what was said, including a transcription on its way.
  const cancelListening = useCallback(() => {
    cancelledRef.current = true;
    recordingRef.current?.cancel();
    browserRef.current?.cancel();
    transcribeAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (listen !== 'listening') return undefined;
    const startedAt = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [listen]);

  useEffect(
    () => () => {
      cancelListening();
      stopSpeaking();
    },
    [cancelListening, stopSpeaking]
  );

  return {
    canListen,
    canSpeak,
    listen,
    followUp,
    lastRecording,
    levelRef,
    elapsed,
    interim,
    speakingKey,
    error,
    clearError: () => setError(null),
    startListening,
    stopListening,
    cancelListening,
    speak,
    streamSpeech,
    stopSpeaking,
  };
}
