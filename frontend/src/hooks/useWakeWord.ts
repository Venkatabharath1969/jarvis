/**
 * Wake word detection via Sherpa-ONNX KWS + Android Foreground Service.
 *
 * Flow:
 *   1. On mount: model files are copied from app assets to internal storage.
 *      (KWSHandler.kt requires absolute filesystem paths, not asset:// URIs.)
 *   2. toggleWakeWord() → BackgroundService starts a microphone foreground
 *      service that opens AudioRecord at 16 kHz / 16-bit / mono.
 *   3. Each PCM chunk (base64 Int16) → Float32 normalised → KWS.acceptWaveform.
 *   4. On detection, DeviceEventEmitter emits WAKE_WORD_EVENT → App.tsx
 *      navigates to VoiceScreen automatically.
 *
 * Model: sherpa-onnx-kws-zipformer-gigaspeech-3.3M (Apache 2.0, ~5 MB).
 * Assets bundled at: android/app/src/main/assets/jarvis_kws/
 * Runtime copy: <documentDirectory>/sherpa_kws/   (idempotent, first launch only)
 *
 * Android 14+: Boot autostart of microphone services is blocked. BootReceiver
 * shows a notification instead; user tap → app starts the service again.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { STORAGE_KEYS } from '../constants/config';

export const WAKE_WORD_EVENT = 'JARVIS_WAKE_WORD_DETECTED';

// Lazy-load native modules — prevents crashes on iOS or in Expo Go
let AudioRecord: any = null;
let BackgroundService: any = null;
let KWS: any = null;

try { AudioRecord = require('react-native-audio-record').default; } catch { /* no-op */ }
try { BackgroundService = require('react-native-background-actions').default; } catch { /* no-op */ }
try { KWS = require('@siteed/sherpa-onnx.rn').KWS; } catch { /* no-op */ }

// ─── Model asset management ───────────────────────────────────────────────────

const ASSET_DIR = 'jarvis_kws';
const MODEL_FILES = [
  'encoder.int8.onnx',
  'decoder.int8.onnx',
  'joiner.int8.onnx',
  'tokens.txt',
  'keywords.txt',
];

function getModelDir(): string {
  // FileSystem.documentDirectory ends with '/'
  return `${FileSystem.documentDirectory}sherpa_kws`;
}

/** Copy model files from Android assets → internal storage (idempotent). */
async function ensureModelsOnDisk(): Promise<void> {
  const modelDir = getModelDir();
  const dirInfo = await FileSystem.getInfoAsync(modelDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(modelDir, { intermediates: true });
  }

  await Promise.all(
    MODEL_FILES.map(async (file) => {
      const dest = `${modelDir}/${file}`;
      const destInfo = await FileSystem.getInfoAsync(dest);
      if (!destInfo.exists) {
        await FileSystem.copyAsync({
          from: `asset://${ASSET_DIR}/${file}`,
          to: dest,
        });
      }
    }),
  );
}

// ─── Background foreground-service task ──────────────────────────────────────

// Module-level flag shared between task and hook; avoids stale closure issues
let _taskRunning = false;

const wakeWordTask = async (_taskData: unknown) => {
  if (!AudioRecord || !KWS) return;

  // Strip leading file:// — KWSHandler expects a bare absolute path
  const modelDir = getModelDir().replace(/^file:\/\//, '');

  const initResult = await KWS.init({
    modelDir,
    modelType: 'zipformer2',
    modelFiles: {
      encoder: 'encoder.int8.onnx',
      decoder: 'decoder.int8.onnx',
      joiner: 'joiner.int8.onnx',
      tokens: 'tokens.txt',
    },
    keywordsFile: 'keywords.txt',
    numThreads: 2,
    keywordsScore: 1.5,
    keywordsThreshold: 0.25,
    debug: false,
    provider: 'cpu',
  });

  if (!initResult?.success) {
    console.error('[WakeWord] KWS init failed:', initResult?.error);
    return;
  }

  AudioRecord.init({
    sampleRate: 16000,
    channels: 1,
    bitsPerSample: 16,
    audioSource: 6, // VOICE_RECOGNITION — Android-optimised for speech capture
    wavFile: 'kws_capture.wav',
  });

  // Register chunk handler before calling start()
  AudioRecord.on('data', async (base64Chunk: string) => {
    if (!_taskRunning) return;
    try {
      // Decode base64 → PCM Int16 → normalised Float32
      const binary = Buffer.from(base64Chunk, 'base64');
      const int16 = new Int16Array(binary.buffer, binary.byteOffset, binary.byteLength / 2);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      const result = await KWS.acceptWaveform(16000, Array.from(float32));
      if (result?.detected) {
        DeviceEventEmitter.emit(WAKE_WORD_EVENT, { keyword: result.keyword });
        // 1.5 s cooldown — suppress double-fires from the same utterance
        _taskRunning = false;
        setTimeout(() => { _taskRunning = true; }, 1500);
      }
    } catch (err) {
      // Chunk-level errors are non-fatal. A SIGABRT from the C++ decode layer
      // terminates the process — the service restarts via restartOnTaskRemoved.
      console.warn('[WakeWord] chunk error:', err);
    }
  });

  _taskRunning = true;
  AudioRecord.start();

  // Keep the Promise pending until the foreground service is stopped externally
  await new Promise<void>((resolve) => {
    const tick = setInterval(() => {
      if (!_taskRunning && !BackgroundService?.isRunning?.()) {
        clearInterval(tick);
        resolve();
      }
    }, 500);
  });

  AudioRecord.stop().catch(() => {});
  KWS.release().catch(() => {});
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseWakeWordReturn {
  wakeWordEnabled: boolean;
  isStarting: boolean;
  toggleWakeWord: () => Promise<void>;
}

export function useWakeWord(): UseWakeWordReturn {
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (Platform.OS !== 'android') return;

    // Kick off asset copy in the background — fast no-op on subsequent launches
    ensureModelsOnDisk().catch((err) =>
      console.error('[WakeWord] Asset copy failed:', err),
    );

    AsyncStorage.getItem(STORAGE_KEYS.WAKE_WORD_ENABLED)
      .then((v) => { if (v === 'true' && mountedRef.current) startWakeWord(); })
      .catch(() => {});

    return () => { mountedRef.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startWakeWord = useCallback(async () => {
    if (!BackgroundService || !AudioRecord || !KWS) return;
    if (Platform.OS !== 'android') return;
    try {
      setIsStarting(true);
      await ensureModelsOnDisk();
      await BackgroundService.start(wakeWordTask, {
        taskName: 'JarvisWakeWord',
        taskTitle: 'JARVIS is listening',
        taskDesc: 'Say "Hey Jarvis" to activate',
        taskIcon: { name: 'ic_launcher', type: 'mipmap' },
        color: '#00ADEF',
        parameters: {},
        foregroundServiceType: ['microphone'],
        restartOnTaskRemoved: true,
      });
      if (mountedRef.current) setWakeWordEnabled(true);
      await AsyncStorage.setItem(STORAGE_KEYS.WAKE_WORD_ENABLED, 'true');
    } catch (err) {
      console.error('[WakeWord] Failed to start service:', err);
    } finally {
      if (mountedRef.current) setIsStarting(false);
    }
  }, []);

  const stopWakeWord = useCallback(async () => {
    if (!BackgroundService) return;
    try {
      _taskRunning = false;
      await BackgroundService.stop();
      if (mountedRef.current) setWakeWordEnabled(false);
      await AsyncStorage.setItem(STORAGE_KEYS.WAKE_WORD_ENABLED, 'false');
    } catch (err) {
      console.error('[WakeWord] Failed to stop service:', err);
    }
  }, []);

  const toggleWakeWord = useCallback(async () => {
    if (wakeWordEnabled) {
      await stopWakeWord();
    } else {
      await startWakeWord();
    }
  }, [wakeWordEnabled, startWakeWord, stopWakeWord]);

  return { wakeWordEnabled, isStarting, toggleWakeWord };
}
