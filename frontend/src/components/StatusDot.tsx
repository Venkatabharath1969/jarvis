import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { ConnectionStatus } from '../hooks/useWebSocket';

interface StatusDotProps {
  status: ConnectionStatus;
}

const StatusDot: React.FC<StatusDotProps> = ({ status }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loopRef.current?.stop();
    if (status === 'connecting') {
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      loopRef.current.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => loopRef.current?.stop();
  }, [status, pulseAnim]);

  const color =
    status === 'connected'
      ? COLORS.success
      : status === 'connecting'
      ? COLORS.warning
      : COLORS.danger;

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: color, opacity: pulseAnim },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

export default StatusDot;
