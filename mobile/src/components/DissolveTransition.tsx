import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Dimensions, View, Image, Text } from 'react-native';
import { Canvas, Shader, Fill, Skia } from '@shopify/react-native-skia';
import { Persona } from '../types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TRANSITION_DURATION_MS = 850;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Perlin noise dissolve shader
const dissolveShader = Skia.RuntimeEffect.Make(`
  uniform float progress;
  uniform float3 burnColor;
  uniform float2 resolution;

  float hash(float2 p) {
    return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    float a = hash(i);
    float b = hash(i + float2(1.0, 0.0));
    float c = hash(i + float2(0.0, 1.0));
    float d = hash(i + float2(1.0, 1.0));
    float2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(float2 p) {
    float v = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
      v += amp * noise(p * freq);
      amp *= 0.5;
      freq *= 2.0;
    }
    return v;
  }

  half4 main(float2 xy) {
    float2 uv = xy / resolution;
    float n = fbm(uv * 6.0 + float2(progress * 1.7, -progress * 1.1));

    float threshold = progress;
    float mask = 1.0 - smoothstep(threshold - 0.08, threshold + 0.08, n);
    float edge = smoothstep(threshold - 0.03, threshold + 0.01, n) -
                 smoothstep(threshold + 0.01, threshold + 0.09, n);

    float alpha = clamp(mask + edge * 0.45, 0.0, 1.0);
    float3 glow = burnColor * (0.55 + edge * 1.8);
    return half4(glow, alpha);
  }
`);

interface DissolveTransitionProps {
  isActive: boolean;
  color: string;
  onComplete?: () => void;
  direction: 'in' | 'out'; // 'out' = dissolve away, 'in' = form from nothing
  persona: Persona;
}

// Parse hex color to RGB
const parseColor = (hex: string): [number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
};

export function DissolveTransition({
  isActive,
  color,
  onComplete,
  direction,
  persona,
}: DissolveTransitionProps) {
  const [progress, setProgress] = useState(direction === 'out' ? 0 : 1);
  const frameRef = useRef<number | null>(null);

  const [r, g, b] = parseColor(color);

  useEffect(() => {
    if (!isActive) {
      setProgress(direction === 'out' ? 0 : 1);
      return;
    }

    const from = direction === 'out' ? 0 : 1;
    const to = direction === 'out' ? 1 : 0;
    const start = Date.now();
    setProgress(from);

    const animate = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / TRANSITION_DURATION_MS);
      const eased = easeInOutCubic(t);
      setProgress(from + (to - from) * eased);

      if (t < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else if (onComplete) {
        onComplete();
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [isActive, direction, onComplete]);

  const uniforms = useMemo(
    () => ({
      progress,
      burnColor: [r, g, b],
      resolution: [SCREEN_WIDTH, SCREEN_HEIGHT],
    }),
    [progress, r, g, b]
  );

  if (!isActive || !dissolveShader) {
    return null;
  }

  const emblemOpacity = direction === 'out'
    ? Math.min(1, progress * 1.15)
    : Math.min(1, (1 - progress) * 1.15);

  const emblemScale = direction === 'out'
    ? 0.82 + progress * 0.45
    : 1.25 - progress * 0.45;

  const emblem = persona === 'ladybug'
    ? require('../assets/Ladybug.png')
    : persona === 'chatnoir'
      ? require('../assets/Charnoir.png')
      : null;

  return (
    <View style={styles.container} pointerEvents="none">
      <Canvas style={styles.canvas}>
        <Fill>
          <Shader source={dissolveShader} uniforms={uniforms} />
        </Fill>
      </Canvas>
      <View style={styles.emblemWrap}>
        {emblem ? (
          <Image
            source={emblem}
            style={[
              styles.emblem,
              { opacity: emblemOpacity, transform: [{ scale: emblemScale }] },
            ]}
          />
        ) : (
          <View
            style={[
              styles.assistantEmblem,
              { opacity: emblemOpacity, transform: [{ scale: emblemScale }] },
            ]}
          >
            <Text style={styles.assistantEmblemText}>AI</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  canvas: {
    flex: 1,
  },
  emblemWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblem: {
    width: 132,
    height: 132,
    borderRadius: 66,
  },
  assistantEmblem: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  assistantEmblemText: {
    color: '#93c5fd',
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 4,
  },
});
