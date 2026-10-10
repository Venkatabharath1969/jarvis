/**
 * useSpeech — voice input/output hook.
 *
 * API change (v1.2.1): startListening now accepts a callback instead of returning
 * a Promise. This eliminates the stale-promise / manual-stop hang that caused the
 * blank-screen bug: when the user taps mic to STOP, stopListening() fires the
 * callback immediately with whatever partial transcript exists, rather than leaving
 * an orphaned Promise that never resolves.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import * as Speech from 'expo-speech';
import { Platform, PermissionsAndroid } from 'react-native';

let Voice: any = null;
try {
  Voice = require('@react-native-voice/voice').default;
} catch {
  // fallback to demo mode if native module not linked
}

// Demo cycle — used only when native STT is unavailable
const DEMO_QUERIES = [
  'What are my overdue action items?',
  'What meetings do I have this week?',
  'Summarise the Q4 budget review.',
  'Who is Klaus Weber and what did he commit to?',
  'What is the latest on Project Delta?',
];

export interface UseSpeechReturn {
  startListening: (onResult: (transcript: string | null) => void) => void;
  stopListening: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  isSpeaking: boolean;
  isListening: boolean;
}

export function useSpeech(): UseSpeechReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const onResultRef = useRef<((t: string | null) => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partialRef = useRef<string>('');
  const demoIndexRef = useRef(0);

  // ── single-fire result emitter ────────────────────────────────────────────
  const fireResult = useCallback((transcript: string | null) => {
    if (!onResultRef.current) return; // already fired or not started
    const cb = onResultRef.current;
    onResultRef.current = null;
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    setIsListening(false);
    cb(transcript);
  }, []);

  // ── Voice event wiring ────────────────────────────────────────────────────
  useEffect(() => {
    if (!Voice) return;

    Voice.onSpeechPartialResults = (e: any) => {
      partialRef.current = e.value?.[0] ?? '';
    };

    Voice.onSpeechResults = (e: any) => {
      const transcript = e.value?.[0] ?? partialRef.current;
      if (transcript) fireResult(transcript);
    };

    Voice.onSpeechError = () => {
      // Let the 10s timeout handle it — never hang the UI
    };

    return () => {
      Voice.destroy().catch(() => {});
    };
  }, [fireResult]);

  // ── Permission ────────────────────────────────────────────────────────────
  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'JARVIS needs microphone access to hear your voice commands.',
        buttonPositive: 'Allow',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  // ── startListening ────────────────────────────────────────────────────────
  const startListening = useCallback(async (onResult: (t: string | null) => void) => {
    // Cancel any in-progress session
    if (onResultRef.current) {
      onResultRef.current = null;
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      try { if (Voice) await Voice.stop(); } catch { /* ignore */ }
    }

    const hasPermission = await requestMicPermission();
    if (!hasPermission) {
      onResult(null);
      return;
    }

    partialRef.current = '';
    onResultRef.current = onResult;
    setIsListening(true);

    // 10-second hard timeout — always fires so UI never hangs
    timeoutRef.current = setTimeout(() => {
      if (!Voice) {
        // Demo mode: cycle through sample queries
        const q = DEMO_QUERIES[demoIndexRef.current % DEMO_QUERIES.length];
        demoIndexRef.current += 1;
        fireResult(q);
      } else {
        // Nothing recognised — fire with partial or null
        Voice.stop().catch(() => {});
        fireResult(partialRef.current || null);
      }
    }, 10000);

    if (Voice) {
      Voice.start('en-US').catch(() => {
        // STT failed to start — fall back to demo
        const q = DEMO_QUERIES[demoIndexRef.current % DEMO_QUERIES.length];
        demoIndexRef.current += 1;
        fireResult(q);
      });
    }
    // If no Voice module, wait for the 10s timeout to fire demo query
  }, [fireResult, requestMicPermission]);

  // ── stopListening — IMMEDIATELY fires the callback ────────────────────────
  const stopListening = useCallback(() => {
    if (!onResultRef.current) return; // nothing in progress

    // Capture partial before clearing
    const partial = partialRef.current;

    // Stop Voice (may trigger onSpeechResults which calls fireResult again —
    // that's fine: fireResult is single-fire, second call is a no-op)
    try { if (Voice) Voice.stop().catch(() => {}); } catch { /* ignore */ }

    // Fire immediately with whatever we have so UI never hangs
    fireResult(partial || null);
  }, [fireResult]);

  // ── TTS ───────────────────────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (!text.trim()) return;
    Speech.stop();
    setIsSpeaking(true);
    Speech.speak(text, {
      rate: 0.92,
      pitch: 1.0,
      language: 'en-US',
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
  }, []);

  return { startListening, stopListening, speak, stopSpeaking, isSpeaking, isListening };
}
