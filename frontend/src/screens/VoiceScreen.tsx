import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Animated,
  AppState,
  AppStateStatus,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, SIZES } from '../constants/theme';
import { STORAGE_KEYS } from '../constants/config';
import MicButton, { MicState } from '../components/MicButton';
import MessageBubble from '../components/MessageBubble';
import StatusDot from '../components/StatusDot';
import { useWebSocket, WSMessage } from '../hooks/useWebSocket';
import { useSpeech } from '../hooks/useSpeech';

const PROCESSING_TIMEOUT_MS = 30_000; // show error if backend doesn't respond in 30s

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

const STATUS_LABELS: Record<MicState, string> = {
  idle: 'Tap to speak',
  listening: 'Listening...',
  processing: 'Processing...',
  speaking: 'Speaking...',
};

const VoiceScreen: React.FC = () => {
  const [micState, setMicState] = useState<MicState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  // Start at 1 — the container is ALWAYS visible. The 800ms fade-in only runs once on
  // very first mount. Setting initial value to 1 means if Android triggers onPause →
  // onResume (e.g. STT overlay dismisses), the native animation driver NEVER resets
  // this to 0 and makes the screen black.
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const fadeAnimStarted = useRef(false);
  const headerGlow = useRef(new Animated.Value(0)).current;
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micStateRef = useRef<MicState>('idle'); // mirror for use inside closures

  const { speak, stopSpeaking, isSpeaking, startListening, stopListening } = useSpeech();

  // Keep micStateRef in sync
  useEffect(() => {
    micStateRef.current = micState;
  }, [micState]);

  // ── Animations ─────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(headerGlow, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(headerGlow, { toValue: 0.4, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
    // Fade in from 0 → 1 on very first mount only
    if (!fadeAnimStarted.current) {
      fadeAnimStarted.current = true;
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    }
  }, [fadeAnim, headerGlow]);

  // Re-ensure opacity=1 when app comes back to foreground (STT overlay dismissal,
  // permission dialog dismiss, or any other Android onPause → onResume cycle).
  useEffect(() => {
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        fadeAnim.stopAnimation();
        fadeAnim.setValue(1);
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [fadeAnim]);

  // ── Sync isSpeaking → idle ──────────────────────────────────────────────
  useEffect(() => {
    if (!isSpeaking && micStateRef.current === 'speaking') {
      setMicState('idle');
    }
  }, [isSpeaking]);

  // ── Processing timeout guard ────────────────────────────────────────────
  const clearProcessingTimer = useCallback(() => {
    if (processingTimerRef.current) {
      clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
    }
  }, []);

  const startProcessingTimer = useCallback(() => {
    clearProcessingTimer();
    processingTimerRef.current = setTimeout(() => {
      if (micStateRef.current === 'processing') {
        const errText = "I'm sorry, the response took too long. Please try again.";
        addMessage('assistant', errText);
        setMicState('speaking');
        speak(errText);
      }
    }, PROCESSING_TIMEOUT_MS);
  }, [clearProcessingTimer, speak]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Message management ──────────────────────────────────────────────────
  const addMessage = useCallback((role: 'user' | 'assistant', text: string) => {
    if (!text.trim()) return;
    const msg: Message = {
      id: `${Date.now()}-${Math.random()}`,
      role,
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => {
      const updated = [...prev, msg];
      AsyncStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(updated.slice(-100))).catch(() => {});
      return updated;
    });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);


  // ── WebSocket message handler ───────────────────────────────────────────
  const handleWSMessage = useCallback((msg: WSMessage) => {
    clearProcessingTimer();
    if (msg.type === 'response' && typeof msg.text === 'string' && msg.text.trim()) {
      addMessage('assistant', msg.text);
      setMicState('speaking');
      speak(msg.text);
    } else if (msg.type === 'error' && typeof msg.error === 'string') {
      const errText = `Sorry, I encountered an error: ${msg.error}`;
      addMessage('assistant', errText);
      setMicState('speaking');
      speak(errText);
    } else if (msg.type === 'response') {
      // Empty/unexpected response
      const errText = "I didn't get a response. Please try again.";
      addMessage('assistant', errText);
      setMicState('speaking');
      speak(errText);
    }
  }, [addMessage, speak, clearProcessingTimer]);

  const { connectionStatus, sendQuery } = useWebSocket({ onMessage: handleWSMessage });

  // ── Load saved messages on mount ────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.CONVERSATIONS)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as Message[];
          setMessages((prev) => prev.length === 0 ? parsed.slice(-20) : prev);
        }
      })
      .catch(() => {});
  }, []);

  // ── Mic button handler ──────────────────────────────────────────────────
  const handleMicPress = useCallback(async () => {
    if (micState === 'listening') {
      // FIX: stopListening now resolves the pending startListening() promise immediately.
      // The original coroutine resumes with the partial transcript and owns the rest of the flow.
      await stopListening();
      return;
    }

    if (micState === 'speaking') {
      stopSpeaking();
      setMicState('idle');
      return;
    }

    if (micState === 'processing') {
      // Give haptic feedback so it doesn't feel dead
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return;
    }

    // Guard: don't start recording when offline (sendQuery would silently drop)
    if (connectionStatus !== 'connected') {
      addMessage('assistant', 'JARVIS is offline. Please check your connection and try again.');
      return;
    }

    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setMicState('listening');

    const transcript = await startListening();
    if (!transcript) {
      setMicState('idle');
      addMessage('assistant', "I didn't catch that. Tap the microphone and try again.");
      return;
    }

    addMessage('user', transcript);
    setMicState('processing');
    startProcessingTimer();        // ← guard: shows timeout error if backend hangs

    const sent = sendQuery(transcript);
    if (!sent) {
      clearProcessingTimer();
      setMicState('idle');
      addMessage('assistant', 'Connection lost. Reconnecting — please try again in a moment.');
    }
  }, [micState, connectionStatus, startListening, stopListening, stopSpeaking, addMessage, sendQuery]);

  // ── Status label color ─────────────────────────────────────────────────
  const statusLabelColor =
    micState === 'listening' ? COLORS.accent2
    : micState === 'processing' ? COLORS.warning
    : micState === 'speaking' ? COLORS.purple
    : COLORS.textSecondary;

  const headerGlowColor = headerGlow.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,173,239,0.4)', 'rgba(0,173,239,0.9)'],
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Animated.Text style={[styles.logo, { color: headerGlowColor as unknown as string }]}>
              J A R V I S
            </Animated.Text>
            <Text style={styles.subtitle}>Executive AI Assistant</Text>
          </View>
          <View style={styles.headerRight}>
            <StatusDot status={connectionStatus} />
            <Text style={styles.connLabel}>
              {connectionStatus === 'connected' ? 'Online'
                : connectionStatus === 'connecting' ? 'Connecting'
                : 'Offline'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Messages ── */}
        <ScrollView
          ref={scrollRef}
          style={styles.messagesScroll}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>✦</Text>
              <Text style={styles.emptyTitle}>JARVIS is ready</Text>
              <Text style={styles.emptySubtitle}>
                Tap the microphone to give a voice command.{'\n'}
                Your schedule, meetings, and briefings — all at once.
              </Text>
            </View>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                text={msg.text}
                timestamp={msg.timestamp}
              />
            ))
          )}
        </ScrollView>

        {/* ── Mic + status ── */}
        <View style={styles.micSection}>
          <View style={styles.micGlow}>
            <MicButton state={micState} onPress={handleMicPress} />
          </View>
          <Text style={[styles.statusLabel, { color: statusLabelColor }]}>
            {STATUS_LABELS[micState]}
          </Text>
          {micState === 'speaking' && (
            <TouchableOpacity
              onPress={() => { stopSpeaking(); setMicState('idle'); }}
              style={styles.stopBtn}
            >
              <Text style={styles.stopBtnText}>Stop</Text>
            </TouchableOpacity>
          )}
          {connectionStatus === 'disconnected' && micState === 'idle' && (
            <Text style={styles.offlineHint}>Reconnecting…</Text>
          )}
        </View>

        {/* ── Bottom hint ── */}
        <View style={styles.bottomHint}>
          <Text style={styles.hintText}>History  ·  Settings</Text>
        </View>

      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.lg,
    paddingTop: SIZES.md,
    paddingBottom: SIZES.sm,
  },
  headerLeft: { flex: 1 },
  logo: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.extraBold,
    letterSpacing: 8,
    color: COLORS.accent,
  },
  subtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    letterSpacing: 2,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SIZES.xs },
  connLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, letterSpacing: 1 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginHorizontal: SIZES.lg,
    marginBottom: SIZES.sm,
  },

  messagesScroll: { flex: 1 },
  messagesContent: { paddingVertical: SIZES.sm, flexGrow: 1 },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SIZES.xxl,
    paddingTop: SIZES.xxxl,
  },
  emptyIcon: { fontSize: 32, color: COLORS.accent, marginBottom: SIZES.md },
  emptyTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.semiBold,
    color: COLORS.textPrimary,
    marginBottom: SIZES.sm,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  emptySubtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  micSection: {
    alignItems: 'center',
    paddingVertical: SIZES.xl,
    paddingBottom: SIZES.lg,
  },
  micGlow: {
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 10,
    marginBottom: SIZES.lg,
  },
  statusLabel: {
    fontSize: FONTS.sizes.sm,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: FONTS.weights.medium,
  },
  stopBtn: {
    marginTop: SIZES.sm,
    paddingHorizontal: SIZES.lg,
    paddingVertical: SIZES.xs + 2,
    borderRadius: SIZES.radiusFull,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  stopBtnText: {
    color: COLORS.danger,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
    letterSpacing: 1,
  },
  offlineHint: {
    marginTop: SIZES.xs,
    fontSize: FONTS.sizes.xs,
    color: COLORS.warning,
    letterSpacing: 1,
  },

  bottomHint: { alignItems: 'center', paddingBottom: SIZES.md },
  hintText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});

export default VoiceScreen;
