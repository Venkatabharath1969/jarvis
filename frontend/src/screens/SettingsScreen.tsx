import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS, SIZES } from '../constants/theme';
import { APP_VERSION, DEFAULT_WS_URL, STORAGE_KEYS } from '../constants/config';

const SettingsScreen: React.FC = () => {
  const [wsUrl, setWsUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.WS_URL).then((v) => {
      setWsUrl(v ?? DEFAULT_WS_URL);
    });
  }, []);

  const save = useCallback(async () => {
    const url = wsUrl.trim();
    await AsyncStorage.setItem(STORAGE_KEYS.WS_URL, url);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [wsUrl]);

  const testConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    const url = wsUrl.trim();
    // Derive health URL from WS URL
    const healthUrl = url
      .replace(/^wss:\/\//, 'https://')
      .replace(/^ws:\/\//, 'http://')
      .replace(/\/ws$/, '/health');
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(6000) });
      setTestResult(res.ok ? 'ok' : 'fail');
    } catch {
      setTestResult('fail');
    }
    setTesting(false);
  }, [wsUrl]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>JARVIS Executive Assistant</Text>
        </View>
        <View style={styles.divider} />

        {/* Wake word always-on status */}
        <View style={styles.statusCard}>
          <View style={styles.statusDot} />
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>Wake Word Active</Text>
            <Text style={styles.statusHint}>
              Say "Hey Jarvis" anytime to activate — no tap needed.
            </Text>
          </View>
        </View>

        {/* Server URL */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Server</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>WebSocket URL</Text>
          <TextInput
            style={styles.input}
            value={wsUrl}
            onChangeText={setWsUrl}
            placeholder="wss://your-server/ws"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.fieldHint}>
            The WebSocket address of your JARVIS backend. Change this to point to your own server.
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline]}
              onPress={testConnection}
              disabled={testing}
            >
              <Text style={styles.btnOutlineText}>
                {testing ? 'Testing…' : 'Test Connection'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={save}
            >
              <Text style={styles.btnPrimaryText}>{saved ? 'Saved ✓' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
          {testResult === 'ok' && (
            <Text style={[styles.testFeedback, { color: COLORS.accent }]}>
              ✓ Server is reachable
            </Text>
          )}
          {testResult === 'fail' && (
            <Text style={[styles.testFeedback, { color: COLORS.danger }]}>
              ✗ Could not reach server — check URL and network
            </Text>
          )}
        </View>

        {/* About */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>About</Text>
        </View>
        <View style={styles.aboutCard}>
          <AboutRow label="Application" value="JARVIS Executive Assistant" />
          <View style={styles.rowDivider} />
          <AboutRow label="Version" value={APP_VERSION} />
          <View style={styles.rowDivider} />
          <AboutRow label="Platform" value={Platform.OS === 'ios' ? 'iOS' : 'Android'} />
          <View style={styles.rowDivider} />
          <AboutRow label="AI Engine" value="Gemini + LangGraph" />
          <View style={styles.rowDivider} />
          <AboutRow label="Wake Word" value="Sherpa-ONNX KWS" />
        </View>

        <View style={{ height: SIZES.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const AboutRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.aboutRow}>
    <Text style={styles.aboutLabel}>{label}</Text>
    <Text style={styles.aboutValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: SIZES.xxl },
  header: {
    paddingHorizontal: SIZES.lg,
    paddingTop: SIZES.md,
    paddingBottom: SIZES.sm,
  },
  title: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
    letterSpacing: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginHorizontal: SIZES.lg,
    marginBottom: SIZES.md,
  },
  statusCard: {
    marginHorizontal: SIZES.md,
    marginBottom: SIZES.md,
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.md,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  statusText: { flex: 1 },
  statusTitle: {
    fontSize: FONTS.sizes.base,
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.medium,
  },
  statusHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  sectionHeader: {
    paddingHorizontal: SIZES.lg,
    paddingTop: SIZES.md,
    paddingBottom: SIZES.xs,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semiBold,
    color: COLORS.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  card: {
    marginHorizontal: SIZES.md,
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SIZES.md,
  },
  fieldLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    marginBottom: SIZES.xs,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    paddingHorizontal: SIZES.sm,
    paddingVertical: SIZES.xs + 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fieldHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    marginTop: SIZES.xs,
    lineHeight: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SIZES.sm,
    marginTop: SIZES.md,
  },
  btn: {
    flex: 1,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radiusSm,
    alignItems: 'center',
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  btnOutlineText: {
    color: COLORS.accent,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
  },
  btnPrimary: {
    backgroundColor: COLORS.accent,
  },
  btnPrimaryText: {
    color: COLORS.white ?? '#fff',
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semiBold,
  },
  testFeedback: {
    fontSize: FONTS.sizes.xs,
    marginTop: SIZES.xs,
    letterSpacing: 0.3,
  },
  aboutCard: {
    marginHorizontal: SIZES.md,
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 2,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginHorizontal: SIZES.md,
  },
  aboutLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
  aboutValue: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.medium,
    textAlign: 'right',
    flex: 1,
    marginLeft: SIZES.md,
  },
});

export default SettingsScreen;
