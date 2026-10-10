import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Easing } from 'react-native';
import { COLORS } from '../constants/theme';

const NUM_BARS = 5;
const BAR_WIDTH = 4;
const BAR_GAP = 5;
const MAX_HEIGHT = 32;
const MIN_HEIGHT = 6;

const WaveformBars: React.FC = () => {
  const animations = useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(0))
  ).current;
  const loops = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    loops.current.forEach((l) => l.stop());
    loops.current = animations.map((anim, i) => {
      const delay = i * 80;
      const duration = 380 + i * 40;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: 0.15,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ])
      );
    });
    loops.current.forEach((l) => l.start());

    return () => loops.current.forEach((l) => l.stop());
  }, [animations]);

  return (
    <View style={styles.container}>
      {animations.map((anim, i) => {
        const height = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [MIN_HEIGHT, MAX_HEIGHT],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                height,
                marginHorizontal: BAR_GAP / 2,
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: MAX_HEIGHT + 4,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: COLORS.accent2,
  },
});

export default WaveformBars;
