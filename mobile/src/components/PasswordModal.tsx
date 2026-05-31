import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../styles/ThemeContext';

interface PasswordModalProps {
  isNewAccount: boolean;
  onSubmit: (credentials: { name: string; password: string }) => void;
  initialName?: string;
  error?: string | null;
  isLoading?: boolean;
}

export function PasswordModal({
  isNewAccount,
  onSubmit,
  initialName,
  error,
  isLoading,
}: PasswordModalProps) {
  const [name, setName] = useState(initialName || '');
  const { theme } = useTheme();
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (initialName) {
      setName(initialName);
    }
  }, [initialName]);

  const handleSubmit = () => {
    setLocalError(null);

    if (!name.trim()) {
      setLocalError('Name is required');
      return;
    }

    if (!password) {
      setLocalError('Password is required');
      return;
    }

    onSubmit({ name: name.trim(), password });
  };

  const displayError = localError || error;

  const styles = createStyles(theme);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.modal}>
        <View style={styles.header}>
          <Image
            source={require('../assets/Ladybug.png')}
            style={styles.logo}
          />
          <Text style={styles.title}>
            {isNewAccount ? 'Create Your Account' : 'Welcome Back'}
          </Text>
          <Text style={styles.subtitle}>
            {isNewAccount
              ? 'Set a password to encrypt your chats. This password cannot be recovered!'
              : 'Enter your password to unlock your chats.'}
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder={isNewAccount ? 'Enter your name' : 'Enter your name'}
              placeholderTextColor={theme.colors.textMuted}
              value={name}
              onChangeText={setName}
              autoFocus
              editable={!isLoading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder={
                isNewAccount ? 'Create a password' : 'Enter your password'
              }
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!isLoading}
            />
          </View>

          {displayError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{displayError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isNewAccount ? 'Create Account' : 'Unlock'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {isNewAccount && (
          <Text style={styles.warning}>
            Warning: If you forget your password, your chats cannot be
            recovered.
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.spacing.md,
    },
    modal: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.xl,
      width: '100%',
      maxWidth: 400,
    },
    header: {
      alignItems: 'center',
      marginBottom: theme.spacing.lg,
    },
    logo: {
      width: 64,
      height: 64,
      marginBottom: theme.spacing.md,
    },
    title: {
      fontSize: theme.fontSize.xl,
      color: theme.colors.text,
      fontWeight: 'bold',
      marginBottom: theme.spacing.sm,
    },
    subtitle: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    form: {
      gap: theme.spacing.md,
    },
    inputGroup: {
      gap: theme.spacing.xs,
    },
    label: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    input: {
      backgroundColor: theme.colors.backgroundTertiary,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.sm,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
    },
    errorContainer: {
      backgroundColor: 'rgba(242, 28, 30, 0.1)',
      padding: theme.spacing.sm,
      borderRadius: theme.borderRadius.sm,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: theme.fontSize.sm,
      textAlign: 'center',
    },
    button: {
      backgroundColor: theme.colors.primary,
      padding: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
      alignItems: 'center',
      marginTop: theme.spacing.sm,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: '#fff',
      fontSize: theme.fontSize.base,
      fontWeight: '500',
    },
    warning: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textMuted,
      textAlign: 'center',
      marginTop: theme.spacing.md,
    },
  });
