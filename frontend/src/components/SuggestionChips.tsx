import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
} from 'react-native';
import { COLORS, FONTS, SIZES } from '../constants/theme';

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
  visible: boolean;
}

const SuggestionChips: React.FC<SuggestionChipsProps> = ({ suggestions, onSelect, visible }) => {
  const containerAnim = useRef(new Animated.Value(0)).current;
  const containerSlide = useRef(new Animated.Value(10)).current;
  const chipAnims = useRef(
    Array.from({ length: 4 }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    if (visible && suggestions.length > 0) {
      containerAnim.setValue(0);
      containerSlide.setValue(10);
      chipAnims.forEach((a) => a.setValue(0));

      Animated.parallel([
        Animated.timing(containerAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(containerSlide, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();

      suggestions.slice(0, 4).forEach((_, i) => {
        Animated.timing(chipAnims[i], {
          toValue: 1,
          duration: 250,
          delay: 80 + i * 70,
          useNativeDriver: true,
        }).start();
      });
    } else {
      Animated.timing(containerAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    }
  }, [visible, suggestions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || suggestions.length === 0) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity: containerAnim, transform: [{ translateY: containerSlide }] },
      ]}
    >
      <Text style={styles.label}>SUGGESTED</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {suggestions.slice(0, 4).map((text, i) => (
          <Animated.View
            key={`${i}-${text.slice(0, 8)}`}
            style={{
              opacity: chipAnims[i],
              transform: [
                {
                  translateY: chipAnims[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            }}
          >
            <TouchableOpacity
              style={styles.chip}
              onPress={() => onSelect(text)}
              activeOpacity={0.65}
            >
              <View style={styles.chipAccentBar} />
              <Text style={styles.chipText} numberOfLines={1}>
                {text}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: SIZES.sm,
  },
  label: {
    fontSize: 9,
    letterSpacing: 2.5,
    color: COLORS.gold,
    opacity: 0.5,
    paddingHorizontal: SIZES.lg,
    marginBottom: SIZES.xs + 2,
    fontWeight: FONTS.weights.semiBold,
  },
  scrollContent: {
    paddingHorizontal: SIZES.md,
    gap: SIZES.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: SIZES.xl,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: SIZES.chipHeight,
    paddingHorizontal: SIZES.chipPaddingH,
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: COLORS.chipBorder,
    backgroundColor: COLORS.chipBg,
    overflow: 'hidden',
  },
  chipAccentBar: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 1.5,
    backgroundColor: COLORS.gold,
    borderRadius: 1,
  },
  chipText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.chipText,
    fontWeight: FONTS.weights.medium,
    letterSpacing: 0.5,
    maxWidth: 210,
    paddingLeft: 6,
  },
});

export default SuggestionChips;
