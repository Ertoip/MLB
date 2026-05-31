import React from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { useTheme } from '../styles/ThemeContext';

interface LoadingScreenProps {
  message?: string;
  progress?: number;
  downloadedSize?: string;
  totalSize?: string;
}

export function LoadingScreen({ message, progress, downloadedSize, totalSize }: LoadingScreenProps) {
  const { theme, persona } = useTheme();
  const logo =
    persona === 'ladybug'
      ? require('../assets/Ladybug.png')
      : persona === 'chatnoir'
        ? require('../assets/Charnoir.png')
        : null;

  const styles = createStyles(theme);

  // Format progress percentage
  const progressPercent = progress !== undefined ? Math.round(progress * 100) : 0;

  return (
    <View style={styles.container}>
      {logo ? (
        <Image source={logo} style={styles.logo} />
      ) : (
        <View style={styles.assistantLogo}>
          <Text style={styles.assistantLogoText}>AI</Text>
        </View>
      )}
      <ActivityIndicator size="large" color={theme.colors.primary} />
      {message && <Text style={styles.message}>{message}</Text>}
      {progress !== undefined && (
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressBar, { width: `${progressPercent}%` }]}
            />
          </View>
          <Text style={styles.progressText}>
            {progressPercent}%
          </Text>
          {downloadedSize && totalSize && (
            <Text style={styles.sizeText}>
              {downloadedSize} / {totalSize}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.spacing.xl,
    },
    logo: {
      width: 80,
      height: 80,
      marginBottom: theme.spacing.lg,
    },
    assistantLogo: {
      width: 80,
      height: 80,
      borderRadius: 40,
      marginBottom: theme.spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.backgroundTertiary,
    },
    assistantLogoText: {
      color: theme.colors.primary,
      fontSize: theme.fontSize.xl,
      fontWeight: '700',
      letterSpacing: 2,
    },
    message: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.md,
      textAlign: 'center',
    },
    progressContainer: {
      width: '100%',
      maxWidth: 300,
      marginTop: theme.spacing.lg,
      alignItems: 'center',
    },
    progressTrack: {
      width: '100%',
      height: 8,
      backgroundColor: theme.colors.backgroundTertiary,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressBar: {
      height: '100%',
      backgroundColor: theme.colors.primary,
      borderRadius: 4,
    },
    progressText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
      fontWeight: '600',
    },
    sizeText: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textMuted,
      marginTop: theme.spacing.xs,
    },
  });
