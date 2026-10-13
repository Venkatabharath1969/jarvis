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
import SuggestionChips from '../components/SuggestionChips';
import PrecisionRing from '../components/PrecisionRing';
import { useWebSocket, WSMessage } from '../hooks/useWebSocket';
import { useSpeech } from '../hooks/useSpeech';

const PROCESSING_TIMEOUT_MS = 30_000;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

const STATUS_LABELS: Record<MicState, string> = {
  idle: 'TAP TO SPEAK',
  listening: 'LISTENING',
  processing: 'PROCESSING',
  speaking: 'SPEAKING',
};

const VoiceScreen: React.FC = () => {
  const [micState, setMicState] = useState<MicState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const fadeAnimStarted = useRef(false);
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micStateRef = useRef<MicState>('idle');

  const { speak, stopSpeaking, isSpeaking, startListening, stopListening } = useSpeech();

  // Keep micStateRef in sync
  useEffect(() => {
    micStateRef.current = micState;
  }, [micState]);

  // Fade in on first mount only
  useEffect(() => {
    if (!fadeAnimStarted.current) {
      fadeAnimStarted.current = true;
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    }
  }, [fadeAnim]);

  // Restore opacity on foreground
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

  // Sync isSpeaking → idle; show chips after speaking ends
  useEffect(() => {
    if (!isSpeaking && micStateRef.current === 'speaking') {
      setMicState('idle');
    }
  }, [isSpeaking]);

  // ── Processing timeout guard ─────────────────────────────────────────────
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

  // ── Message management ───────────────────────────────────────────────────
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

  // ── WebSocket message handler ────────────────────────────────────────────
  const handleWSMessage = useCallback((msg: WSMessage) => {
    clearProcessingTimer();
    if (msg.type === 'response' && typeof msg.text === 'string' && msg.text.trim()) {
      const newSuggestions = Array.isArray(msg.suggestions) ? msg.suggestions as string[] : [];
      addMessage('assistant', msg.text);
      setSuggestions(newSuggestions);
      setMicState('speaking');
      speak(msg.text);
    } else if (msg.type === 'error' && typeof msg.error === 'string') {
      const errText = `Sorry, I encountered an error: ${msg.error}`;
      addMessage('assistant', errText);
      setSuggestions([]);
      setMicState('speaking');
      speak(errText);
    } else if (msg.type === 'response') {
      const errText = "I didn't get a response. Please try again.";
      addMessage('assistant', errText);
      setSuggestions([]);
      setMicState('speaking');
      speak(errText);
    }
  }, [addMessage, speak, clearProcessingTimer]);

  const { connectionStatus, sendQuery } = useWebSocket({ onMessage: handleWSMessage });

  // ── Load saved messages on mount ─────────────────────────────────────────
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

  // ── Mic button handler ───────────────────────────────────────────────────
  const handleMicPress = useCallback(async () => {
    if (micState === 'listening') {
      await stopListening();
      return;
    }
    if (micState === 'speaking') {
      stopSpeaking();
      setMicState('idle');
      return;
    }
    if (micState === 'processing') {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    if (connectionStatus !== 'connected') {
      addMessage('assistant', 'JARVIS is offline. Please check your connection and try again.');
      return;
    }
    if (Platform.OS !== 'web') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setSuggestions([]);
    setMicState('listening');
    const transcript = await startListening();
    if (!transcript) {
      setMicState('idle');
      addMessage('assistant', "I didn't catch that. Tap the microphone and try again.");
      return;
    }
    addMessage('user', transcript);
    setMicState('processing');
    startProcessingTimer();

    const sent = sendQuery(transcript);
    if (!sent) {
      clearProcessingTimer();
      setMicState('idle');
      addMessage('assistant', 'Connection lost. Reconnecting — please try again in a moment.');
    }
  }, [micState, connectionStatus, startListening, stopListening, stopSpeaking, addMessage, sendQuery]);

  // ── Suggestion chip tap ──────────────────────────────────────────────────
  const handleSuggestionTap = useCallback(async (text: string) => {
    if (connectionStatus !== 'connected') return;
    if (Platform.OS !== 'web') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSuggestions([]);
    addMessage('user', text);
    setMicState('processing');
    startProcessingTimer();
    const sent = sendQuery(text);
    if (!sent) {
      clearProcessingTimer();
      setMicState('idle');
      addMessage('assistant', 'Connection lost. Reconnecting — please try again in a moment.');
    }
  }, [connectionStatus, addMessage, sendQuery, startProcessingTimer, clearProcessingTimer]);

  const statusColor =
    micState === 'listening' ? COLORS.accent2
    : micState === 'processing' ? COLORS.warning
    : micState === 'speaking' ? COLORS.gold
    : COLORS.textMuted;

  const showChips = micState === 'idle' && suggestions.length > 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.logo}>J A R V I S</Text>
            <View style={styles.logoRule} />
            <Text style={styles.subtitle}>EXECUTIVE AI ASSISTANT</Text>
          </View>
          <View style={styles.headerRight}>
            <StatusDot status={connectionStatus} />
            <Text style={styles.connLabel}>
              {connectionStatus === 'connected' ? 'ONLINE'
                : connectionStatus === 'connecting' ? 'CONNECTING'
                : 'OFFLINE'}
            </Text>
          </View>
        </View>

        {/* ── Messages ────────────────────────────────────────────────── */}
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
              <Text style={styles.emptyTitle}>JARVIS IS READY</Text>
              <Text style={styles.emptySubtitle}>
                Tap the microphone or say{'\n'}"Hey Jarvis" to begin.
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

        {/* ── Suggestion chips ────────────────────────────────────────── */}
        <SuggestionChips
          suggestions={suggestions}
          onSelect={handleSuggestionTap}
          visible={showChips}
        />

        {/* ── Precision ring + mic ─────────────────────────────────────── */}
        <View style={styles.micSection}>
          <View style={styles.ringContainer}>
            <PrecisionRing state={micState} size={220} />
            <View style={styles.micOverlay}>
              <View style={styles.micGlow}>
                <MicButton state={micState} onPress={handleMicPress} />
              </View>
            </View>
          </View>

          <Text style={[styles.statusLabel, { color: statusColor }]}>
            {STATUS_LABELS[micState]}
          </Text>

          {micState === 'speaking' && (
            <TouchableOpacity
              onPress={() => { stopSpeaking(); setMicState('idle'); }}
              style={styles.stopBtn}
            >
              <Text style={styles.stopBtnText}>STOP</Text>
            </TouchableOpacity>
          )}
          {connectionStatus === 'disconnected' && micState === 'idle' && (
            <Text style={styles.offlineHint}>Reconnecting…</Text>
          )}
        </View>

        {/* ── Bottom rule ─────────────────────────────────────────────── */}
        <View style={styles.bottomRule} />
        <View style={styles.bottomHint}>
          <Text style={styles.hintText}>HISTORY  ·  SETTINGS</Text>
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
  headerLeft: { flex: 1, gap: 3 },
  logo: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.extraBold,
    letterSpacing: 10,
    color: COLORS.platinum,
  },
  logoRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.gold,
    opacity: 0.55,
    marginRight: SIZES.xxl,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 8,
    color: COLORS.textMuted,
    letterSpacing: 3,
    fontWeight: FONTS.weights.semiBold,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SIZES.xs },
  connLabel: { fontSize: 9, color: COLORS.textMuted, letterSpacing: 1.5 },

  messagesScroll: { flex: 1 },
  messagesContent: { paddingVertical: SIZES.sm, flexGrow: 1 },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SIZES.xxl,
    paddingTop: SIZES.xxxl,
  },
  emptyIcon: { fontSize: 24, color: COLORS.gold, marginBottom: SIZES.md, opacity: 0.7 },
  emptyTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semiBold,
    color: COLORS.platinum,
    marginBottom: SIZES.sm,
    letterSpacing: 3.5,
  },
  emptySubtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: 0.5,
  },

  micSection: {
    alignItems: 'center',
    paddingBottom: SIZES.lg,
  },
  ringContainer: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SIZES.md,
  },
  micOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micGlow: {
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 10,
  },
  statusLabel: {
    fontSize: 9,
    letterSpacing: 3,
    fontWeight: FONTS.weights.semiBold,
    marginBottom: SIZES.xs,
  },
  stopBtn: {
    marginTop: SIZES.sm,
    paddingHorizontal: SIZES.lg,
    paddingVertical: SIZES.xs + 2,
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: COLORS.danger,
  },
  stopBtnText: {
    color: COLORS.danger,
    fontSize: 9,
    fontWeight: FONTS.weights.semiBold,
    letterSpacing: 2,
  },
  offlineHint: {
    marginTop: SIZES.xs,
    fontSize: FONTS.sizes.xs,
    color: COLORS.warning,
    letterSpacing: 1,
  },

  bottomRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginHorizontal: SIZES.lg,
    opacity: 0.5,
  },
  bottomHint: { alignItems: 'center', paddingVertical: SIZES.sm },
  hintText: {
    fontSize: 8,
    color: COLORS.textMuted,
    letterSpacing: 2.5,
    fontWeight: FONTS.weights.medium,
  },
});

export default VoiceScreen;
