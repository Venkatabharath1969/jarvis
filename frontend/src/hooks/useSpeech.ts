import { useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

// Demo query cycle for the Expo prototype (no native STT required)
const DEMO_QUERIES = [
  'What is my schedule for today?',
  'What are my top action items this week?',
  'Summarize my last meeting.',
  'When is my next meeting and with whom?',
  'Give me a brief executive summary of overnight developments.',
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
  const recordingRef = useRef<Audio.Recording | null>(null);
  const demoIndexRef = useRef(0);
  const listenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopListening = useCallback(async (): Promise<void> => {
    if (listenTimeoutRef.current) {
      clearTimeout(listenTimeoutRef.current);
      listenTimeoutRef.current = null;
    }
    if (recordingRef.current) {
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording) {
          await recordingRef.current.stopAndUnloadAsync();
        }
      } catch {
        // ignore cleanup errors
      }
      recordingRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(async (): Promise<string | null> => {
    // Request microphone permission
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) {
      return null;
    }

    setIsListening(true);

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;

      // Auto-stop after 10 seconds maximum
      const transcript = await new Promise<string>((resolve) => {
        listenTimeoutRef.current = setTimeout(async () => {
          listenTimeoutRef.current = null;
          if (recordingRef.current) {
            try {
              const status = await recordingRef.current.getStatusAsync();
              if (status.isRecording) {
                await recordingRef.current.stopAndUnloadAsync();
              }
            } catch {
              // ignore
            }
            recordingRef.current = null;
          }
          // Return next demo query in cycle
          const query = DEMO_QUERIES[demoIndexRef.current % DEMO_QUERIES.length];
          demoIndexRef.current += 1;
          resolve(query);
        }, 2500); // 2.5s listening window for demo responsiveness

        // Also resolve immediately via cycling demo for snappy demo UX:
        // We wait the timeout to simulate real recording
      });

      setIsListening(false);
      return transcript;
    } catch {
      setIsListening(false);
      // Return demo query even on error so demo still works
      const query = DEMO_QUERIES[demoIndexRef.current % DEMO_QUERIES.length];
      demoIndexRef.current += 1;
      return query;
    }
  }, []);

  const speak = useCallback((text: string) => {
    // Stop any current speech first
    Speech.stop();
    setIsSpeaking(true);

    Speech.speak(text, {
      rate: 0.9,
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

  return {
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    isSpeaking,
    isListening,
  };
}
