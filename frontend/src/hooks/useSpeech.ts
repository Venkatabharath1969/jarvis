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
  const resolveRef = useRef<((t: string) => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partialRef = useRef<string>('');

  // Wire up Voice events once on mount
  useEffect(() => {
    if (!Voice) return;

    Voice.onSpeechPartialResults = (e: any) => {
      const partial = e.value?.[0] ?? '';
      partialRef.current = partial;
    };

    Voice.onSpeechResults = (e: any) => {
      const transcript = e.value?.[0] ?? partialRef.current;
      if (transcript && resolveRef.current) {
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        const cb = resolveRef.current;
        resolveRef.current = null;
        setIsListening(false);
        cb(transcript);
      }
    };

    Voice.onSpeechError = (_e: any) => {
      // On error fall through to the timeout which returns a demo query
      // so the UX never hangs
    };

    return () => {
      Voice.destroy().catch(() => {});
    };
  }, []);

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

  const stopListening = useCallback(async (): Promise<void> => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    try { if (Voice) await Voice.stop(); } catch { /* ignore */ }
    setIsListening(false);
  }, []);

  const startListening = useCallback(async (): Promise<string | null> => {
    const hasPermission = await requestMicPermission();
    if (!hasPermission) return null;

    setIsListening(true);
    partialRef.current = '';

    return new Promise<string | null>((resolve) => {
      resolveRef.current = (t: string) => resolve(t);

      // 10-second hard timeout — always resolves so UI never hangs
      timeoutRef.current = setTimeout(async () => {
        resolveRef.current = null;
        try { if (Voice) await Voice.stop(); } catch { /* ignore */ }
        setIsListening(false);

        // If we got a partial result during recording, use it
        if (partialRef.current) {
          resolve(partialRef.current);
          return;
        }

        // No Voice module or nothing heard — use demo cycling
        if (!Voice) {
          const q = DEMO_QUERIES[demoIndexRef.current % DEMO_QUERIES.length];
          demoIndexRef.current += 1;
          resolve(q);
        } else {
          // Real STT but nothing heard — resolve null so UI shows idle
          resolve(null);
        }
      }, 10000);

      if (Voice) {
        Voice.start('en-US').catch(() => {
          // Start failed — fall to demo
          if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
          resolveRef.current = null;
          const q = DEMO_QUERIES[demoIndexRef.current % DEMO_QUERIES.length];
          demoIndexRef.current += 1;
          setIsListening(false);
          resolve(q);
        });
      }
    });
  }, [requestMicPermission]);

  const speak = useCallback((text: string) => {
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
