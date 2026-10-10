import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS, SIZES } from '../constants/theme';
import { STORAGE_KEYS } from '../constants/config';

interface ConversationEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

interface ConversationPair {
  id: string;
  userText: string;
  assistantText: string;
  timestamp: number;
}

function pairMessages(messages: ConversationEntry[]): ConversationPair[] {
  const pairs: ConversationPair[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      const next = messages[i + 1];
      pairs.push({
        id: messages[i].id,
        userText: messages[i].text,
        assistantText: next?.role === 'assistant' ? next.text : '',
        timestamp: messages[i].timestamp,
      });
      if (next?.role === 'assistant') i++;
    }
  }
  return pairs.reverse(); // newest first
}

const HistoryScreen: React.FC = () => {
  const [pairs, setPairs] = useState<ConversationPair[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
      if (raw) {
        const messages: ConversationEntry[] = JSON.parse(raw);
        setPairs(pairMessages(messages));
      } else {
        setPairs([]);
      }
    } catch {
      setPairs([]);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  }, [loadHistory]);

  const handleClear = useCallback(() => {
    Alert.alert(
      'Clear History',
      'Are you sure you want to delete all conversation history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(STORAGE_KEYS.CONVERSATIONS);
            setPairs([]);
          },
        },
      ]
    );
  }, []);

  const formatDate = (ts: number): string => {
    const d = new Date(ts);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const renderItem = ({ item }: { item: ConversationPair }) => (
    <View style={styles.card}>
      {/* User query */}
      <View style={styles.queryRow}>
        <View style={styles.queryTag}>
          <Text style={styles.queryTagText}>YOU</Text>
        </View>
        <Text style={styles.queryText}>{item.userText}</Text>
      </View>

      {/* Divider */}
      {item.assistantText ? <View style={styles.cardDivider} /> : null}

      {/* JARVIS response */}
      {item.assistantText ? (
        <View style={styles.responseRow}>
          <View style={styles.responseTag}>
            <Text style={styles.responseTagText}>JARVIS</Text>
          </View>
          <Text style={styles.responseText} numberOfLines={4}>
            {item.assistantText}
          </Text>
        </View>
      ) : null}

      {/* Timestamp */}
      <Text style={styles.timestamp}>{formatDate(item.timestamp)}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>History</Text>
            <Text style={styles.subtitle}>
              {pairs.length === 0
                ? 'No conversations yet'
                : `${pairs.length} exchange${pairs.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
          {pairs.length > 0 && (
            <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.divider} />

        {/* List */}
        <FlatList
          data={pairs}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={pairs.length === 0 ? styles.emptyContainer : styles.listContent}
          showsVerticalScrollIndicator={false}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>◎</Text>
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap the microphone on the main screen to start talking to JARVIS.
              </Text>
            </View>
          }
        />
      </View>
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
  clearBtn: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.xs,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  clearBtnText: {
    color: COLORS.danger,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginHorizontal: SIZES.lg,
    marginBottom: SIZES.sm,
  },

  // List
  listContent: {
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.xl,
    paddingTop: SIZES.xs,
  },
  emptyContainer: {
    flex: 1,
  },

  // Card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SIZES.md,
    marginBottom: SIZES.sm,
  },
  queryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.sm,
  },
  queryTag: {
    backgroundColor: COLORS.accentDeep,
    borderRadius: SIZES.radiusSm,
    paddingHorizontal: SIZES.xs,
    paddingVertical: 2,
    marginTop: 1,
  },
  queryTagText: {
    fontSize: 9,
    fontWeight: FONTS.weights.bold,
    color: COLORS.accent,
    letterSpacing: 1,
  },
  queryText: {
    flex: 1,
    fontSize: FONTS.sizes.base,
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.medium,
    lineHeight: 20,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: SIZES.sm,
  },
  responseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.sm,
  },
  responseTag: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusSm,
    paddingHorizontal: SIZES.xs,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 1,
  },
  responseTagText: {
    fontSize: 9,
    fontWeight: FONTS.weights.bold,
    color: COLORS.accent2,
    letterSpacing: 1,
  },
  responseText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  timestamp: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    marginTop: SIZES.sm,
    textAlign: 'right',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SIZES.xxl,
    paddingTop: SIZES.xxxl + SIZES.xl,
  },
  emptyIcon: {
    fontSize: 32,
    color: COLORS.textMuted,
    marginBottom: SIZES.md,
  },
  emptyTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.semiBold,
    color: COLORS.textPrimary,
    marginBottom: SIZES.sm,
    letterSpacing: 1,
  },
  emptySubtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default HistoryScreen;
