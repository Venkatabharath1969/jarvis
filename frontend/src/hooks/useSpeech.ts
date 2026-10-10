import { useState, useRef, useCallback, useEffect } from 'react';
import * as Speech from 'expo-speech';
import { Platform, PermissionsAndroid } from 'react-native';

let Voice: any = null;
try {
  Voice = require('@react-native-voice/voice').default;
} catch {
  // fallback to demo mode if native module not linked
}

// Fallback demo cycle — used only if native STT is unavailable
const DEMO_QUERIES = [
  'What are my overdue action items?',
  'What meetings did I have this week?',
  'Summarise the Q4 budget review.',
  'Who is Klaus Weber and what did he commit to?',
  'What is the latest on Project Delta?',
];

interface ListenSession {
  resolve: (t: string | null) => void;
  timeout: ReturnType<typeof setTimeout> | null;
  settled: boolean;
}

interface UseSpeechReturn {
  startListening: () => Promise<string | null>;
  stopListening: () => Promise<void>;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  isSpeaking: boolean;
  isListening: boolean;
}

export function useSpeech(): UseSpeechReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const demoIndexRef = useRef(0);
  const sessionRef = useRef<ListenSession | null>(null);
  const partialRef = useRef<string>('');
  const utteranceIdRef = useRef(0);
  const ttsWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cache mic permission so we never show the system dialog mid-flow (which
  // triggers onPause → onResume → Android windowBackground flash).
  const micPermGrantedRef = useRef<boolean | null>(null);

  // Settle the current listen session exactly once (idempotent)
  const settle = useCallback((t: string | null) => {
    const s = sessionRef.current;
    if (!s || s.settled) return;
    s.settled = true;
    if (s.timeout) { clearTimeout(s.timeout); }
    sessionRef.current = null;
    setIsListening(false);
    partialRef.current = '';
    // CRITICAL: tell Voice to stop so it releases Android audio focus BEFORE
    // expo-speech tries to acquire it for TTS. Without this, Voice holds the
    // audio focus after natural STT completion (onSpeechResults) and TTS is
    // silently blocked or degraded.
    try { if (Voice) Voice.stop().catch(() => {}); } catch {}
    s.resolve(t);
  }, []);

  // Wire up Voice events once on mount
  useEffect(() => {
    if (!Voice) return;

    Voice.onSpeechPartialResults = (e: any) => {
      partialRef.current = e.value?.[0] ?? '';
    };

    // FIX: use || not ?? so empty string "" falls back to partial
    Voice.onSpeechResults = (e: any) => {
      const transcript = e.value?.[0] || partialRef.current || null;
      settle(transcript);
    };

    // FIX: was completely silent — now settles with partial or null so promise never hangs
    Voice.onSpeechError = (_e: any) => {
      settle(partialRef.current || null);
    };

    return () => {
      settle(null); // unblock any pending session on unmount
      Voice.destroy().catch(() => {});
    };
  }, [settle]);

  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    // Return cached result — avoids showing the system dialog on every mic press
    // which would trigger onPause() → onResume() → Android windowBackground flash.
    if (micPermGrantedRef.current !== null) return micPermGrantedRef.current;
    // Check first (no dialog if already granted)
    const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (already) { micPermGrantedRef.current = true; return true; }
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'JARVIS needs microphone access to hear your voice commands.',
        buttonPositive: 'Allow',
      },
    );
    const result = granted === PermissionsAndroid.RESULTS.GRANTED;
    micPermGrantedRef.current = result;
    return result;
  }, []);

  // FIX: now always unblocks startListening() — calls Voice.stop() for native cleanup,
  // then settles the session with whatever partial transcript we have (or null)
  const stopListening = useCallback(async (): Promise<void> => {
    try { if (Voice) await Voice.stop(); } catch {}
    settle(partialRef.current || null);
  }, [settle]);

  const startListening = useCallback(async (): Promise<string | null> => {
    const hasPermission = await requestMicPermission();
    if (!hasPermission) return null;

    setIsListening(true);
    partialRef.current = '';

    return new Promise<string | null>((resolve) => {
      const timeout = setTimeout(async () => {
        try { if (Voice) await Voice.stop(); } catch {}
        if (partialRef.current) { settle(partialRef.current); return; }
        if (!Voice) {
          const q = DEMO_QUERIES[demoIndexRef.current % DEMO_QUERIES.length];
          demoIndexRef.current += 1;
          settle(q);
        } else {
          settle(null); // real STT but nothing heard
        }
      }, 10000);

      sessionRef.current = { resolve, timeout, settled: false };

      if (Voice) {
        Voice.start('en-US').catch(() => {
          // Start failed — settle as null, don't fabricate a demo query for real STT failure
          settle(null);
        });
      }
      // No Voice module: timeout fires demo query after 10s
    });
  }, [requestMicPermission, settle]);

  // FIX: utterance-ID guard prevents stale onDone/onStopped from a previous
  // utterance from calling setIsSpeaking(false) on the current one (Android race)
  const speak = useCallback((text: string) => {
    if (!text.trim()) return;
    Speech.stop();
    const id = ++utteranceIdRef.current;
    setIsSpeaking(true);

    // Watchdog: if callbacks never fire (Android TTS engine crash / no data), clean up
    if (ttsWatchdogRef.current) clearTimeout(ttsWatchdogRef.current);
    ttsWatchdogRef.current = setTimeout(
      () => { if (utteranceIdRef.current === id) setIsSpeaking(false); },
      Math.min(60000, 2000 + text.length * 70),
    );

    const done = () => {
      if (utteranceIdRef.current === id) {
        if (ttsWatchdogRef.current) { clearTimeout(ttsWatchdogRef.current); ttsWatchdogRef.current = null; }
        setIsSpeaking(false);
      }
    };

    // Android: brief delay lets Speech.stop() complete before new utterance queues
    const doSpeak = () => {
      try {
        Speech.speak(text.slice(0, 3900), { // Android TTS cap ~4000 chars
          rate: 0.92,
          pitch: 1.0,
          language: 'en-US',
          onDone: done,
          onError: done,
          onStopped: done,
        });
      } catch {
        done();
      }
    };

    // Android: STT (Voice) holds audio focus. Give it 300ms to fully release
    // focus before expo-speech tries to acquire it. 50ms was too short — TTS
    // was silently dropped when the STT audio session hadn't closed yet.
    Platform.OS === 'android' ? setTimeout(doSpeak, 300) : doSpeak();
  }, []);

  const stopSpeaking = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
  }, []);

  // Stop TTS on unmount
  useEffect(() => {
    return () => {
      Speech.stop();
      if (ttsWatchdogRef.current) clearTimeout(ttsWatchdogRef.current);
    };
  }, []);

  return { startListening, stopListening, speak, stopSpeaking, isSpeaking, isListening };
}
