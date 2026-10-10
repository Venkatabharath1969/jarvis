import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS, SIZES } from '../constants/theme';

export type MessageRole = 'user' | 'assistant';

interface MessageBubbleProps {
  role: MessageRole;
  text: string;
  timestamp: number;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ role, text, timestamp }) => {
  const isUser = role === 'user';
  const timeStr = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={[styles.wrapper, isUser ? styles.wrapperUser : styles.wrapperAssistant]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>J</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.text, isUser ? styles.textUser : styles.textAssistant]}>
          {text}
        </Text>
        <Text style={styles.timestamp}>{timeStr}</Text>
      </View>
      {isUser && (
        <View style={[styles.avatar, styles.avatarUser]}>
          <Text style={styles.avatarText}>C</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    marginVertical: SIZES.xs,
    marginHorizontal: SIZES.md,
    alignItems: 'flex-end',
  },
  wrapperUser: {
    justifyContent: 'flex-end',
  },
  wrapperAssistant: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  avatarUser: {
    backgroundColor: COLORS.accentDeep,
    borderColor: COLORS.accent,
    marginLeft: SIZES.sm,
  },
  avatarText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  bubble: {
    maxWidth: SIZES.bubbleMaxWidth,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 2,
    borderRadius: SIZES.radiusLg,
  },
  bubbleUser: {
    backgroundColor: COLORS.userBubble,
    borderWidth: 1,
    borderColor: COLORS.userBubbleBorder,
    borderBottomRightRadius: SIZES.radiusSm,
    marginLeft: SIZES.sm,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.assistantBubble,
    borderWidth: 1,
    borderColor: COLORS.assistantBubbleBorder,
    borderBottomLeftRadius: SIZES.radiusSm,
    marginLeft: SIZES.sm,
  },
  text: {
    fontSize: FONTS.sizes.base,
    lineHeight: 20,
  },
  textUser: {
    color: COLORS.white,
    fontWeight: FONTS.weights.medium,
  },
  textAssistant: {
    color: COLORS.textPrimary,
  },
  timestamp: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: 'right',
  },
});

export default MessageBubble;
