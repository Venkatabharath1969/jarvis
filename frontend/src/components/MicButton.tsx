import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  TouchableOpacity,
  View,
  StyleSheet,
  Easing,
} from 'react-native';
import { COLORS, SIZES } from '../constants/theme';
import WaveformBars from './WaveformBars';
import BouncingDots from './BouncingDots';
import MicSvgIcon, { SpeakerSvgIcon } from './MicSvgIcon';

export type MicState = 'idle' | 'listening' | 'processing' | 'speaking';

interface MicButtonProps {
  state: MicState;
  onPress: () => void;
  disabled?: boolean;
}

const MicButton: React.FC<MicButtonProps> = ({ state, onPress, disabled = false }) => {
  const pulseAnim1 = useRef(new Animated.Value(0)).current;
  const pulseAnim2 = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulse1Loop = useRef<Animated.CompositeAnimation | null>(null);
  const pulse2Loop = useRef<Animated.CompositeAnimation | null>(null);
  const glowLoop = useRef<Animated.CompositeAnimation | null>(null);

  const stopAllAnimations = useCallback(() => {
    pulse1Loop.current?.stop();
    pulse2Loop.current?.stop();
    glowLoop.current?.stop();
    pulseAnim1.setValue(0);
    pulseAnim2.setValue(0);
    glowAnim.setValue(0);
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  }, [pulseAnim1, pulseAnim2, glowAnim, scaleAnim]);

  useEffect(() => {
    stopAllAnimations();

    if (state === 'idle') {
      const createPulse = (anim: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, { toValue: 1, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        );
      pulse1Loop.current = createPulse(pulseAnim1, 0);
      pulse2Loop.current = createPulse(pulseAnim2, 1000);
      pulse1Loop.current.start();
      pulse2Loop.current.start();
    } else if (state === 'listening') {
      glowLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      glowLoop.current.start();
      Animated.spring(scaleAnim, { toValue: 1.07, friction: 5, useNativeDriver: true }).start();
    } else if (state === 'processing') {
      Animated.spring(scaleAnim, { toValue: 0.93, friction: 6, useNativeDriver: true }).start();
    } else if (state === 'speaking') {
      glowLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.sine), useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.3, duration: 1000, easing: Easing.inOut(Easing.sine), useNativeDriver: true }),
        ]),
      );
      glowLoop.current.start();
    }

    return () => stopAllAnimations();
  }, [state, stopAllAnimations, pulseAnim1, pulseAnim2, glowAnim, scaleAnim]);

  const pulseScale1 = pulseAnim1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const pulseOpacity1 = pulseAnim1.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.55, 0.3, 0] });
  const pulseScale2 = pulseAnim2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const pulseOpacity2 = pulseAnim2.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.55, 0.3, 0] });

  const buttonBgColor = state === 'listening' ? COLORS.accent2Dark : COLORS.accentDark;

  const innerContent = () => {
    if (state === 'listening') return <WaveformBars />;
    if (state === 'processing') return <BouncingDots />;
    if (state === 'speaking') {
      return (
        <Animated.View style={{ opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }}>
          <SpeakerSvgIcon size={SIZES.micIconSize} color={COLORS.white} />
        </Animated.View>
      );
    }
    return <MicSvgIcon size={SIZES.micIconSize} color={COLORS.white} />;
  };

  return (
    <View style={styles.container}>
      {/* Outer glow rings — idle only */}
      {state === 'idle' && (
        <>
          <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseScale1 }], opacity: pulseOpacity1 }]} />
          <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseScale2 }], opacity: pulseOpacity2 }]} />
        </>
      )}

      {/* Listening ring */}
      {state === 'listening' && (
        <Animated.View style={[styles.listeningRing, { opacity: glowAnim }]} />
      )}

      {/* Button */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: buttonBgColor }]}
          onPress={onPress}
          disabled={disabled}
          activeOpacity={0.85}
        >
          <View style={styles.innerCircle}>
            {innerContent()}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: SIZES.micButtonSize,
    height: SIZES.micButtonSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: SIZES.micButtonSize,
    height: SIZES.micButtonSize,
    borderRadius: SIZES.micButtonSize / 2,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.transparent,
  },
  listeningRing: {
    position: 'absolute',
    width: SIZES.micButtonSize + 24,
    height: SIZES.micButtonSize + 24,
    borderRadius: (SIZES.micButtonSize + 24) / 2,
    borderWidth: 2,
    borderColor: COLORS.accent2,
    backgroundColor: COLORS.transparent,
  },
  button: {
    width: SIZES.micButtonSize,
    height: SIZES.micButtonSize,
    borderRadius: SIZES.micButtonSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  innerCircle: {
    width: SIZES.micInnerSize,
    height: SIZES.micInnerSize,
    borderRadius: SIZES.micInnerSize / 2,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MicButton;
