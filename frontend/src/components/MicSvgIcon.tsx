import React from 'react';
import Svg, { Path, G, Circle } from 'react-native-svg';
import { ViewStyle } from 'react-native';

interface MicSvgProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
}

/**
 * Google-style microphone SVG — clean, premium, vector-crisp at any size.
 * Uses the same path as Google's Material mic icon.
 */
const MicSvgIcon: React.FC<MicSvgProps> = ({ size = 36, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"
      fill={color}
    />
    <Path
      d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"
      fill={color}
    />
  </Svg>
);

export const SpeakerSvgIcon: React.FC<MicSvgProps> = ({ size = 36, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"
      fill={color}
    />
  </Svg>
);

export default MicSvgIcon;
