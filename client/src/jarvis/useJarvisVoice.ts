import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { jarvisApi } from './jarvisApi';
import {
  canRecognizeInBrowser,
  canRecord,
  createBrowserSpeaker,
  createServerSpeaker,
  startBrowserRecognition,
  startRecording,
  toSpeechText,
  unlockAudio,
} from './voice';
import type { BrowserListening, ListenOptions, Recording, Speaker } from './voice';
import type { VoiceSettings } from './voiceSettings';

export type ListenState = 'idle' | 'starting' | 'listening' | 'transcribing';

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
// undefined (status not loaded yet) neither.
export function useJarvisVoice(serverVoice: boolean | undefined, onTranscript: (text: string) => void, settings: VoiceSettings) {
  const [listen, setListen] = useState<ListenState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [interim, setInterim] = useState('');
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The microphone's loudness 0–1, read by the meter on its own animation
  // frame so the panel does not re-render 20 times a second.
  const levelRef = useRef(0);
  const listenRef = useRef<ListenState>('idle');
  const recordingRef = useRef<Recording | null>(null);
  const browserRef = useRef<BrowserListening | null>(null);
  const transcribeAbortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  // Read when speaking or listening starts, so a changed setting applies to
  // the next answer or question without rebuilding the speakers.
  const settingsRef = useRef(settings);
  const speakerRef = useRef<Speaker | null>(null);
  const speakTokenRef = useRef(0);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const listenOptions = (): ListenOptions => ({
    autoStop: settingsRef.current.sendMode === 'auto',
    silenceMs: settingsRef.current.pauseMs,
  });

  const setListenState = (state: ListenState) => {
    listenRef.current = state;
    setListen(state);
  };

  const useServer = serverVoice === true;
  const serverSpeaker = useMemo(
    () =>
      createServerSpeaker((text, signal) =>
        jarvisApi.speech(text, signal, { voice: settingsRef.current.voice, speed: settingsRef.current.speed })
      ),
    []
  );
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
  const speak = useCallback(
    async (markdown: string, key: string) => {
      stopSpeaking();
      const text = toSpeechText(markdown);
      if (!text) return;
      const token = speakTokenRef.current;
      setSpeakingKey(key);
      const speakers = (useServer ? [serverSpeaker, browserSpeaker] : [browserSpeaker]).filter((item): item is Speaker => item !== null);
      for (const speaker of speakers) {
        speakerRef.current = speaker;
        try {
          await speaker.speak(text, { rate: settingsRef.current.speed });
          break;
        } catch (err) {
          console.warn('Jarvis: reading aloud failed', err);
          if (speakTokenRef.current !== token) return;
        }
      }
      if (speakTokenRef.current === token) {
        speakerRef.current = null;
        setSpeakingKey(null);
      }
    },
    [browserSpeaker, serverSpeaker, stopSpeaking, useServer]
  );

  const startListening = useCallback(async () => {
    if (listenRef.current !== 'idle' || !canListen) return;
    stopSpeaking();
    unlockAudio();
    setError(null);
    setInterim('');
    cancelledRef.current = false;

    if (!useServer) {
      let listening: BrowserListening;
      try {
        listening = startBrowserRecognition(setInterim, (code) => setError(recognitionError(code)), listenOptions());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Rozpoznávání řeči selhalo.');
        return;
      }
      browserRef.current = listening;
      setListenState('listening');
      const text = await listening.result;
      browserRef.current = null;
      setInterim('');
      setListenState('idle');
      if (text) onTranscriptRef.current(text);
      return;
    }

    // Waiting on the browser's microphone prompt the first time.
    setListenState('starting');
    let recording: Recording;
    try {
      recording = await startRecording((value) => {
        levelRef.current = value;
      }, listenOptions());
    } catch (err) {
      setListenState('idle');
      setError(micError(err));
      return;
    }
    recordingRef.current = recording;
    if (cancelledRef.current) recording.cancel();
    else setListenState('listening');

    const { blob, end } = await recording.result;
    recordingRef.current = null;
    if (!blob) {
      setListenState('idle');
      if (end === 'no-speech') setError('Nic jsem neslyšel. Zkuste to znovu, nebo zkontrolujte mikrofon.');
      return;
    }

    setListenState('transcribing');
    const controller = new AbortController();
    transcribeAbortRef.current = controller;
    try {
      const text = await jarvisApi.transcribe(blob, controller.signal);
      if (controller.signal.aborted) return;
      if (text) onTranscriptRef.current(text);
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
    stopSpeaking,
  };
}
