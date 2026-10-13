import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { COLORS } from '../constants/theme';
import type { MicState } from './MicButton';

// AnimatedCircle for strokeDashoffset-driven arc
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// 12 tick mark angles (clock face — 30° apart, starting 12 o'clock = -90°)
const TICK_ANGLES = Array.from({ length: 12 }, (_, i) => {
  const deg = i * 30 - 90;
  return (deg * Math.PI) / 180;
});

interface PrecisionRingProps {
  state: MicState;
  size?: number;
}

const PrecisionRing: React.FC<PrecisionRingProps> = ({ state, size = 220 }) => {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const arcR = outerR - 10;
  const circumference = 2 * Math.PI * arcR;

  const dashOffset = useRef(new Animated.Value(circumference)).current; // full dash = no arc
  const arcOpacity = useRef(new Animated.Value(0.25)).current;
  const tickOpacity = useRef(new Animated.Value(0.25)).current;
  const breathScale = useRef(new Animated.Value(1)).current;
  const breathLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    breathLoop.current?.stop();

    const targetOffset: Record<MicState, number> = {
      idle: circumference * 0.97,
      listening: circumference * 0.17,
      processing: 0,
      speaking: 0,
    };
    const targetArcOpacity: Record<MicState, number> = {
      idle: 0.22,
      listening: 1,
      processing: 0.5,
      speaking: 0.85,
    };
    const targetTickOpacity: Record<MicState, number> = {
      idle: 0.22,
      listening: 1,
      processing: 0.35,
      speaking: 0.75,
    };

    Animated.parallel([
      Animated.timing(dashOffset, { toValue: targetOffset[state], duration: 480, useNativeDriver: false }),
      Animated.timing(arcOpacity, { toValue: targetArcOpacity[state], duration: 400, useNativeDriver: false }),
      Animated.timing(tickOpacity, { toValue: targetTickOpacity[state], duration: 400, useNativeDriver: false }),
    ]).start();

    if (state === 'listening' || state === 'speaking') {
      breathLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(breathScale, { toValue: 1.025, duration: 700, useNativeDriver: true }),
          Animated.timing(breathScale, { toValue: 0.975, duration: 700, useNativeDriver: true }),
        ]),
      );
      breathLoop.current.start();
    } else {
      Animated.spring(breathScale, { toValue: 1, useNativeDriver: true }).start();
    }

    return () => { breathLoop.current?.stop(); };
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Inner breathing glow */}
      <Animated.View
        style={{
          position: 'absolute',
          width: arcR * 1.6,
          height: arcR * 1.6,
          borderRadius: arcR * 0.8,
          backgroundColor: COLORS.goldGlow,
          transform: [{ scale: breathScale }],
        }}
      />

      <Svg width={size} height={size}>
        {/* Chassis ring — static platinum hairline */}
        <Circle
          cx={cx}
          cy={cy}
          r={outerR}
          stroke={COLORS.platinum}
          strokeWidth={0.5}
          fill="none"
          opacity={0.2}
        />

        {/* 12 tick marks at clock positions */}
        {TICK_ANGLES.map((angle, i) => {
          const isQuarter = i % 3 === 0;
          const tickLen = isQuarter ? 8 : 4;
          const r1 = outerR - 1;
          const r2 = outerR - 1 - tickLen;
          return (
            <Line
              key={i}
              x1={cx + r1 * Math.cos(angle)}
              y1={cy + r1 * Math.sin(angle)}
              x2={cx + r2 * Math.cos(angle)}
              y2={cy + r2 * Math.sin(angle)}
              stroke={COLORS.gold}
              strokeWidth={isQuarter ? 1.2 : 0.7}
              opacity={0.35}
            />
          );
        })}

        {/* Gold progress arc — driven by dashOffset */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={arcR}
          stroke={COLORS.gold}
          strokeWidth={1.2}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation={-90}
          originX={cx}
          originY={cy}
          opacity={arcOpacity}
        />
      </Svg>
    </View>
  );
};

export default PrecisionRing;
