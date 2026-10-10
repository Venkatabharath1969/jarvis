import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, SIZES } from '../constants/theme';
import { APP_VERSION } from '../constants/config';

const SettingsScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>JARVIS Executive Assistant</Text>
        </View>
        <View style={styles.divider} />

        {/* Status row — wake word is always-on */}
        <View style={styles.statusCard}>
          <View style={styles.statusDot} />
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>Wake Word Active</Text>
            <Text style={styles.statusHint}>
              Say "Hey Jarvis" anytime to activate — no tap needed.
            </Text>
          </View>
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
          <AboutRow
            label="Platform"
            value={Platform.OS === 'ios' ? 'iOS' : 'Android'}
          />
          <View style={styles.rowDivider} />
          <AboutRow label="AI Engine" value="Gemini + LangGraph" />
          <View style={styles.rowDivider} />
          <AboutRow label="Wake Word" value="Sherpa-ONNX KWS" />
          <View style={styles.rowDivider} />
          <AboutRow label="Server" value="utilsnow.com (VPS)" />
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

  // Always-on status card
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
  statusText: {
    flex: 1,
  },
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
