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
        {!isUser && <View style={styles.leftAccent} />}
        <View style={styles.bubbleContent}>
          <Text style={[styles.text, isUser ? styles.textUser : styles.textAssistant]}>
            {text}
          </Text>
          <Text style={styles.timestamp}>{timeStr}</Text>
        </View>
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
    width: 26,
    height: 26,
    borderRadius: 2,
    backgroundColor: COLORS.surface,
    borderWidth: 0.5,
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
    color: COLORS.platinum,
    letterSpacing: 0.5,
  },
  bubble: {
    maxWidth: SIZES.bubbleMaxWidth,
    borderRadius: 2,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  bubbleContent: {
    flex: 1,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 2,
  },
  leftAccent: {
    width: 1.5,
    backgroundColor: COLORS.gold,
    opacity: 0.6,
  },
  bubbleUser: {
    backgroundColor: COLORS.userBubble,
    borderWidth: 0.5,
    borderColor: COLORS.userBubbleBorder,
    marginLeft: SIZES.sm,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.assistantBubble,
    borderWidth: 0.5,
    borderColor: COLORS.assistantBubbleBorder,
    marginLeft: SIZES.sm,
  },
  text: {
    fontSize: FONTS.sizes.base,
    lineHeight: 22,
  },
  textUser: {
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.medium,
  },
  textAssistant: {
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.regular,
  },
  timestamp: {
    fontSize: FONTS.sizes.xs - 1,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: 'right',
    letterSpacing: 0.5,
  },
});

export default MessageBubble;
