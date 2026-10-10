import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Animated,
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
  const pendingQueryRef = useRef<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const headerGlow = useRef(new Animated.Value(0)).current;

  const { speak, stopSpeaking, isSpeaking, startListening, stopListening } = useSpeech();

  // Animate header glow on mount
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(headerGlow, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(headerGlow, { toValue: 0.4, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }, [fadeAnim, headerGlow]);

  // Sync speaking state back to micState
  useEffect(() => {
    if (!isSpeaking && micState === 'speaking') {
      setMicState('idle');
    }
  }, [isSpeaking, micState]);

  const addMessage = useCallback((role: 'user' | 'assistant', text: string) => {
    const msg: Message = {
      id: `${Date.now()}-${Math.random()}`,
      role,
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => {
      const updated = [...prev, msg];
      // Persist to AsyncStorage
      const toSave = updated.slice(-100); // keep last 100
      AsyncStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(toSave)).catch(() => {});
      return updated;
    });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return msg;
  }, []);

  const handleWSMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'response' && typeof msg.text === 'string') {
      addMessage('assistant', msg.text);
      setMicState('speaking');
      speak(msg.text);
    } else if (msg.type === 'error' && typeof msg.error === 'string') {
      const errText = `Sorry, I encountered an error: ${msg.error}`;
      addMessage('assistant', errText);
      setMicState('speaking');
      speak(errText);
    }
  }, [addMessage, speak]);

  const { connectionStatus, sendQuery } = useWebSocket({ onMessage: handleWSMessage });

  // Load saved messages on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.CONVERSATIONS)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as Message[];
          // Show only the last 20 in this session view
          setMessages(parsed.slice(-20));
        }
      })
      .catch(() => {});
  }, []);

  const handleMicPress = useCallback(async () => {
    if (micState === 'listening') {
      // Manual stop
      await stopListening();
      if (pendingQueryRef.current) {
        const query = pendingQueryRef.current;
        pendingQueryRef.current = null;
        addMessage('user', query);
        setMicState('processing');
        sendQuery(query);
      } else {
        setMicState('idle');
      }
      return;
    }

    if (micState === 'speaking') {
      stopSpeaking();
      setMicState('idle');
      return;
    }

    if (micState === 'processing') {
      return; // Don't interrupt processing
    }

    // Start listening
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setMicState('listening');

    // startListening resolves after the timeout or manual stop
    const transcript = await startListening();
    if (!transcript) {
      setMicState('idle');
      return;
    }

    addMessage('user', transcript);
    setMicState('processing');
    sendQuery(transcript);
  }, [micState, startListening, stopListening, stopSpeaking, addMessage, sendQuery]);

  const statusLabelColor =
    micState === 'listening'
      ? COLORS.accent2
      : micState === 'processing'
      ? COLORS.warning
      : micState === 'speaking'
      ? COLORS.purple
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
              {connectionStatus === 'connected'
                ? 'Online'
                : connectionStatus === 'connecting'
                ? 'Connecting'
                : 'Offline'}
            </Text>
          </View>
        </View>

        {/* ── Divider ── */}
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
                Tap the microphone to give a voice command.{'\n'}Your schedule, meetings, and briefings — all at once.
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
            <TouchableOpacity onPress={() => { stopSpeaking(); setMicState('idle'); }} style={styles.stopBtn}>
              <Text style={styles.stopBtnText}>Stop</Text>
            </TouchableOpacity>
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
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.lg,
    paddingTop: SIZES.md,
    paddingBottom: SIZES.sm,
  },
  headerLeft: {
    flex: 1,
  },
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.xs,
  },
  connLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginHorizontal: SIZES.lg,
    marginBottom: SIZES.sm,
  },

  // Messages
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: SIZES.sm,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SIZES.xxl,
    paddingTop: SIZES.xxxl,
  },
  emptyIcon: {
    fontSize: 32,
    color: COLORS.accent,
    marginBottom: SIZES.md,
  },
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

  // Mic section
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

  // Bottom hint
  bottomHint: {
    alignItems: 'center',
    paddingBottom: SIZES.md,
  },
  hintText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});

export default VoiceScreen;
