import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Easing } from 'react-native';
import { COLORS } from '../constants/theme';

// Three bouncing dots for the processing state
const BouncingDots: React.FC = () => {
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const loops = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    loops.current.forEach((l) => l.stop());
    loops.current = dots.map((anim, i) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(anim, {
            toValue: -10,
            duration: 320,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 320,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(160),
        ])
      );
    });
    loops.current.forEach((l) => l.start());
    return () => loops.current.forEach((l) => l.stop());
  }, [dots]);

  return (
    <View style={styles.container}>
      {dots.map((anim, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { transform: [{ translateY: anim }] }]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
});

export default BouncingDots;
