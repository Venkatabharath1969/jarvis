/**
 * Wake word detection — Sherpa-ONNX KWS (Apache 2.0) + Android Foreground Service.
 *
 * Always-on: starts automatically on app launch, no toggle needed.
 * Model files are copied from APK assets to internal storage on first launch.
 * Audio: react-native-audio-record at 16 kHz / mono / Int16 → Float32 → KWS.
 * On detection, emits JARVIS_WAKE_WORD_DETECTED → App.tsx navigates to Voice.
 *
 * Android 14+: BOOT_COMPLETED cannot start mic services directly.
 * BootReceiver shows a tap-to-reactivate notification instead.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { STORAGE_KEYS } from '../constants/config';

export const WAKE_WORD_EVENT = 'JARVIS_WAKE_WORD_DETECTED';

let AudioRecord: any = null;
let BackgroundService: any = null;
let KWS: any = null;

try { AudioRecord = require('react-native-audio-record').default; } catch { /* no-op */ }
try { BackgroundService = require('react-native-background-actions').default; } catch { /* no-op */ }
try { KWS = require('@siteed/sherpa-onnx.rn').KWS; } catch { /* no-op */ }

// ─── Model asset management ───────────────────────────────────────────────────

const ASSET_DIR = 'jarvis_kws';
const MODEL_FILES = ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt', 'keywords.txt'];

function getModelDir(): string {
  return `${FileSystem.documentDirectory}sherpa_kws`;
}

async function ensureModelsOnDisk(): Promise<void> {
  const modelDir = getModelDir();
  const dirInfo = await FileSystem.getInfoAsync(modelDir);
  if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(modelDir, { intermediates: true });
  await Promise.all(
    MODEL_FILES.map(async (file) => {
      const dest = `${modelDir}/${file}`;
      const destInfo = await FileSystem.getInfoAsync(dest);
      if (!destInfo.exists) {
        await FileSystem.copyAsync({ from: `asset://${ASSET_DIR}/${file}`, to: dest });
      }
    }),
  );
}

// ─── Background foreground-service task ──────────────────────────────────────

let _taskRunning = false;

const wakeWordTask = async (_taskData: unknown) => {
  if (!AudioRecord || !KWS) return;

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
    audioSource: 6, // VOICE_RECOGNITION
    wavFile: 'kws_capture.wav',
  });

  AudioRecord.on('data', async (base64Chunk: string) => {
    if (!_taskRunning) return;
    try {
      const binary = Buffer.from(base64Chunk, 'base64');
      const int16 = new Int16Array(binary.buffer, binary.byteOffset, binary.byteLength / 2);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;

      const result = await KWS.acceptWaveform(16000, Array.from(float32));
      if (result?.detected) {
        DeviceEventEmitter.emit(WAKE_WORD_EVENT, { keyword: result.keyword });
        _taskRunning = false;
        setTimeout(() => { _taskRunning = true; }, 1500);
      }
    } catch (err) {
      console.warn('[WakeWord] chunk error:', err);
    }
  });

  _taskRunning = true;
  AudioRecord.start();

  await new Promise<void>((resolve) => {
    const tick = setInterval(() => {
      if (!_taskRunning && !BackgroundService?.isRunning?.()) { clearInterval(tick); resolve(); }
    }, 500);
  });

  AudioRecord.stop().catch(() => {});
  KWS.release().catch(() => {});
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseWakeWordReturn {
  wakeWordActive: boolean;
}

export function useWakeWord(): UseWakeWordReturn {
  const [wakeWordActive, setWakeWordActive] = useState(false);
  const mountedRef = useRef(true);

  const startWakeWord = useCallback(async () => {
    if (!BackgroundService || !AudioRecord || !KWS) return;
    if (Platform.OS !== 'android') return;
    if (BackgroundService.isRunning?.()) return;

    try {
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
      if (mountedRef.current) {
        setWakeWordActive(true);
        await AsyncStorage.setItem(STORAGE_KEYS.WAKE_WORD_ENABLED, 'true');
      }
    } catch (err) {
      console.error('[WakeWord] Failed to start:', err);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (Platform.OS !== 'android') return;

    // Always start on launch — no user toggle needed
    ensureModelsOnDisk()
      .then(() => startWakeWord())
      .catch((err) => console.error('[WakeWord] init error:', err));

    return () => { mountedRef.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { wakeWordActive };
}
