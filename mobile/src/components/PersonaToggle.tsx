import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/ThemeContext';
import { assistantTheme, chatNoirTheme, ladybugTheme } from '../styles/theme';

const SEGMENT_WIDTH = 44;
const TRACK_HEIGHT = 44;
const THUMB_SIZE = 36;
const TRACK_PADDING = (TRACK_HEIGHT - THUMB_SIZE) / 2;

const PERSONA_OPTIONS = [
  {
    key: 'ladybug',
    color: ladybugTheme.colors.primary,
    icon: 'bug',
  },
  {
    key: 'chatnoir',
    color: chatNoirTheme.colors.primary,
    icon: 'paw',
  },
  {
    key: 'assistant',
    color: assistantTheme.colors.primary,
    icon: 'sparkles',
  },
] as const;

export function PersonaToggle() {
  const { theme, persona, setPersona, transition } = useTheme();
  const activeIndex = Math.max(
    0,
    PERSONA_OPTIONS.findIndex((option) => option.key === persona)
  );

  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View
          style={[
            styles.thumb,
            {
              left: TRACK_PADDING + activeIndex * SEGMENT_WIDTH,
              backgroundColor: PERSONA_OPTIONS[activeIndex].color,
            },
          ]}
        />

        {PERSONA_OPTIONS.map((option) => {
          const isActive = persona === option.key;

          return (
            <TouchableOpacity
              key={option.key}
              style={styles.segment}
              onPress={() => setPersona(option.key)}
              disabled={transition.isActive}
              activeOpacity={0.8}
            >
              <Ionicons
                name={option.icon}
                size={18}
                color={isActive ? '#ffffff' : theme.colors.textMuted}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: 30,
      padding: 3,
      borderWidth: 2,
      borderColor: theme.colors.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 8,
    },
    track: {
      flexDirection: 'row',
      alignItems: 'center',
      width: SEGMENT_WIDTH * 3,
      height: TRACK_HEIGHT,
      backgroundColor: theme.colors.backgroundTertiary,
      borderRadius: TRACK_HEIGHT / 2,
      position: 'relative',
    },
    segment: {
      width: SEGMENT_WIDTH,
      height: TRACK_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    thumb: {
      position: 'absolute',
      top: TRACK_PADDING,
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: THUMB_SIZE / 2,
    },
  });
