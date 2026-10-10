import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS, SIZES } from '../constants/theme';
import { DEFAULT_WS_URL, STORAGE_KEYS, APP_VERSION, HEALTH_ENDPOINT_SUFFIX } from '../constants/config';
import { useWakeWord } from '../hooks/useWakeWord';

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  hint?: string;
  disabled?: boolean;
  keyboardType?: 'default' | 'url' | 'email-address';
}

const SettingsField: React.FC<FieldProps> = ({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  secureTextEntry = false,
  hint,
  disabled = false,
  keyboardType = 'default',
}) => (
  <View style={[styles.field, disabled && styles.fieldDisabled]}>
    <Text style={[styles.fieldLabel, disabled && styles.fieldLabelDisabled]}>{label}</Text>
    <TextInput
      style={[styles.input, disabled && styles.inputDisabled]}
      value={value}
      onChangeText={disabled ? undefined : onChangeText}
      onBlur={disabled ? undefined : onBlur}
      placeholder={placeholder}
      placeholderTextColor={COLORS.textMuted}
      secureTextEntry={secureTextEntry}
      editable={!disabled}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType={keyboardType}
      keyboardAppearance="dark"
    />
    {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
  </View>
);

const SectionHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
  </View>
);

const SettingsScreen: React.FC = () => {
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);
  const [geminiKey, setGeminiKey] = useState('');
  const [awsAccessKey, setAwsAccessKey] = useState('');
  const [awsSecretKey, setAwsSecretKey] = useState('');
  const [awsRegion, setAwsRegion] = useState('us-east-1');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { wakeWordEnabled, isStarting, toggleWakeWord } = useWakeWord();

  // Load on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [url, key, ak, sk, region] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.WS_URL),
          AsyncStorage.getItem(STORAGE_KEYS.GEMINI_KEY),
          AsyncStorage.getItem(STORAGE_KEYS.AWS_ACCESS_KEY),
          AsyncStorage.getItem(STORAGE_KEYS.AWS_SECRET_KEY),
          AsyncStorage.getItem(STORAGE_KEYS.AWS_REGION),
        ]);
        if (url) setWsUrl(url);
        if (key) setGeminiKey(key);
        if (ak) setAwsAccessKey(ak);
        if (sk) setAwsSecretKey(sk);
        if (region) setAwsRegion(region);
      } catch {
        // ignore
      }
    };
    load();
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.WS_URL, wsUrl.trim() || DEFAULT_WS_URL),
        AsyncStorage.setItem(STORAGE_KEYS.GEMINI_KEY, geminiKey.trim()),
        AsyncStorage.setItem(STORAGE_KEYS.AWS_ACCESS_KEY, awsAccessKey.trim()),
        AsyncStorage.setItem(STORAGE_KEYS.AWS_SECRET_KEY, awsSecretKey.trim()),
        AsyncStorage.setItem(STORAGE_KEYS.AWS_REGION, awsRegion.trim() || 'us-east-1'),
      ]);
      setSaved(true);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaved(false), 2500);
    } catch {
      Alert.alert('Error', 'Could not save settings. Please try again.');
    }
  }, [wsUrl, geminiKey, awsAccessKey, awsSecretKey, awsRegion]);

  // Auto-save WS URL on blur
  const handleWsUrlBlur = useCallback(async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.WS_URL, wsUrl.trim() || DEFAULT_WS_URL);
    } catch {
      // ignore
    }
  }, [wsUrl]);

  const handleTestConnection = useCallback(async () => {
    setTestStatus('testing');
    setTestMessage('');

    // Derive HTTP URL from WS URL
    const base = wsUrl.trim() || DEFAULT_WS_URL;
    const httpBase = base
      .replace(/^ws:\/\//, 'http://')
      .replace(/^wss:\/\//, 'https://')
      .replace(/\/ws$/, '');
    const healthUrl = httpBase + HEALTH_ENDPOINT_SUFFIX;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json().catch(() => ({})) as Record<string, unknown>;
        const statusMsg = (data.status as string) || 'OK';
        setTestStatus('ok');
        setTestMessage(`Connected — ${statusMsg}`);
      } else {
        setTestStatus('fail');
        setTestMessage(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (err: unknown) {
      setTestStatus('fail');
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setTestMessage(msg.includes('aborted') ? 'Connection timed out' : msg);
    }
  }, [wsUrl]);

  const testColor =
    testStatus === 'ok'
      ? COLORS.success
      : testStatus === 'fail'
      ? COLORS.danger
      : COLORS.textSecondary;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Title */}
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
            <Text style={styles.subtitle}>Configure your JARVIS assistant</Text>
          </View>
          <View style={styles.divider} />

          {/* Backend */}
          <SectionHeader
            title="Backend Connection"
            subtitle="WebSocket endpoint of your JARVIS backend server"
          />
          <SettingsField
            label="WebSocket URL"
            value={wsUrl}
            onChangeText={setWsUrl}
            onBlur={handleWsUrlBlur}
            placeholder={DEFAULT_WS_URL}
            hint="Pre-configured for VPS. Edit only if you deploy your own instance."
            keyboardType="url"
          />

          {/* Connection test */}
          <TouchableOpacity
            style={[styles.testBtn, testStatus === 'testing' && styles.testBtnLoading]}
            onPress={handleTestConnection}
            disabled={testStatus === 'testing'}
          >
            {testStatus === 'testing' ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <Text style={styles.testBtnText}>Test Connection</Text>
            )}
          </TouchableOpacity>

          {testStatus !== 'idle' && testStatus !== 'testing' && (
            <View style={[styles.testResult, { borderColor: testColor }]}>
              <Text style={[styles.testResultIcon, { color: testColor }]}>
                {testStatus === 'ok' ? '✓' : '✗'}
              </Text>
              <Text style={[styles.testResultText, { color: testColor }]}>{testMessage}</Text>
            </View>
          )}

          {/* Wake Word */}
          <SectionHeader
            title="Wake Word"
            subtitle="Say &quot;Jarvis&quot; to activate hands-free — like Hey Siri"
          />
          <View style={styles.wakeWordRow}>
            <View style={styles.wakeWordInfo}>
              <Text style={styles.wakeWordLabel}>
                {wakeWordEnabled ? 'Listening for "Jarvis"' : 'Wake word off'}
              </Text>
              <Text style={styles.wakeWordHint}>
                {wakeWordEnabled
                  ? 'Background microphone service active. Works with screen off.'
                  : 'Enable to use hands-free voice activation anywhere.'}
              </Text>
            </View>
            {isStarting ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <Switch
                value={wakeWordEnabled}
                onValueChange={toggleWakeWord}
                trackColor={{ false: COLORS.border, true: COLORS.accentDark }}
                thumbColor={wakeWordEnabled ? COLORS.accent : COLORS.textSecondary}
              />
            )}
          </View>
          {Platform.OS === 'android' && (
            <View style={styles.wakeWordNote}>
              <Text style={styles.wakeWordNoteText}>
                ⓘ  Requires a free Picovoice AccessKey. Get one at console.picovoice.ai and add it to the app's{' '}
                <Text style={{ fontFamily: 'monospace' }}>.env</Text> as{' '}
                <Text style={{ fontFamily: 'monospace' }}>EXPO_PUBLIC_PICOVOICE_ACCESS_KEY</Text> before building.
              </Text>
            </View>
          )}

          {/* Gemini */}
          <SectionHeader
            title="Google Gemini"
            subtitle="Used for natural language understanding"
          />
          <SettingsField
            label="Gemini API Key"
            value={geminiKey}
            onChangeText={setGeminiKey}
            placeholder="AIza..."
            secureTextEntry
            hint="Get a free key at aistudio.google.com"
          />

          {/* AWS Polly — v2 */}
          <SectionHeader
            title="Amazon Polly"
            subtitle="High-quality neural TTS voices — Coming in v2"
          />
          <SettingsField
            label="AWS Access Key ID"
            value={awsAccessKey}
            onChangeText={setAwsAccessKey}
            placeholder="AKIA... (Coming in v2)"
            disabled
            hint="(Coming in v2 — configure later)"
          />
          <SettingsField
            label="AWS Secret Access Key"
            value={awsSecretKey}
            onChangeText={setAwsSecretKey}
            placeholder="(Coming in v2)"
            secureTextEntry
            disabled
            hint="(Coming in v2)"
          />
          <SettingsField
            label="AWS Region"
            value={awsRegion}
            onChangeText={setAwsRegion}
            placeholder="us-east-1 (Coming in v2)"
            disabled
            hint="(Coming in v2)"
          />

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveBtn, saved && styles.saveBtnSuccess]}
            onPress={handleSave}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>{saved ? '✓  Saved' : 'Save Settings'}</Text>
          </TouchableOpacity>

          {/* About */}
          <SectionHeader title="About" />
          <View style={styles.aboutCard}>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Application</Text>
              <Text style={styles.aboutValue}>JARVIS Executive Assistant</Text>
            </View>
            <View style={styles.aboutDivider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Version</Text>
              <Text style={styles.aboutValue}>{APP_VERSION}</Text>
            </View>
            <View style={styles.aboutDivider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Platform</Text>
              <Text style={styles.aboutValue}>{Platform.OS === 'ios' ? 'iOS' : 'Android'}</Text>
            </View>
            <View style={styles.aboutDivider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Built with</Text>
              <Text style={styles.aboutValue}>React Native + Expo + Gemini AI</Text>
            </View>
          </View>

          <View style={{ height: SIZES.xxxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: SIZES.xxl,
  },

  // Header
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

  // Section header
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
  sectionSubtitle: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Field
  field: {
    marginHorizontal: SIZES.md,
    marginBottom: SIZES.sm,
  },
  fieldDisabled: {
    opacity: 0.45,
  },
  fieldLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    fontWeight: FONTS.weights.medium,
    marginBottom: SIZES.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  fieldLabelDisabled: {
    color: COLORS.textMuted,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 2,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.base,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  inputDisabled: {
    color: COLORS.textMuted,
    borderColor: COLORS.borderSubtle,
  },
  fieldHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    marginTop: 4,
    paddingHorizontal: SIZES.xs,
  },

  // Wake word toggle
  wakeWordRow: {
    marginHorizontal: SIZES.md,
    marginBottom: SIZES.sm,
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.md,
  },
  wakeWordInfo: {
    flex: 1,
  },
  wakeWordLabel: {
    fontSize: FONTS.sizes.base,
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.medium,
  },
  wakeWordHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  wakeWordNote: {
    marginHorizontal: SIZES.md,
    marginBottom: SIZES.sm,
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
  },
  wakeWordNoteText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },

  // Test connection
  testBtn: {
    marginHorizontal: SIZES.md,
    marginTop: SIZES.xs,
    marginBottom: SIZES.sm,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: SIZES.radiusMd,
    paddingVertical: SIZES.sm + 2,
    alignItems: 'center',
  },
  testBtnLoading: {
    borderColor: COLORS.border,
  },
  testBtnText: {
    color: COLORS.accent,
    fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.medium,
    letterSpacing: 1,
  },
  testResult: {
    marginHorizontal: SIZES.md,
    marginBottom: SIZES.md,
    borderWidth: 1,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    backgroundColor: COLORS.surface,
  },
  testResultIcon: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
  },
  testResultText: {
    fontSize: FONTS.sizes.sm,
    flex: 1,
  },

  // Save button
  saveBtn: {
    marginHorizontal: SIZES.md,
    marginTop: SIZES.lg,
    backgroundColor: COLORS.accentDark,
    borderRadius: SIZES.radiusMd,
    paddingVertical: SIZES.md,
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  saveBtnSuccess: {
    backgroundColor: COLORS.accent2Dark,
    shadowColor: COLORS.accent2,
  },
  saveBtnText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semiBold,
    letterSpacing: 1,
  },

  // About card
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
  aboutDivider: {
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
