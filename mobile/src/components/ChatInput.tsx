import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../styles/ThemeContext';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
}

export function ChatInput({ onSend, onStop, disabled, isGenerating }: ChatInputProps) {
  const { theme } = useTheme();
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [keyboardHeight] = useState(new Animated.Value(0));

  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        Animated.timing(keyboardHeight, {
          toValue: e.endCoordinates.height,
          duration: Platform.OS === 'ios' ? 250 : 100,
          useNativeDriver: false,
        }).start();
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        Animated.timing(keyboardHeight, {
          toValue: 0,
          duration: Platform.OS === 'ios' ? 250 : 100,
          useNativeDriver: false,
        }).start();
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleButtonPress = () => {
    if (isGenerating) {
      onStop?.();
      return;
    }

    handleSend();
  };

  const styles = createStyles(theme);

  return (
    <Animated.View style={[styles.container, { bottom: Animated.add(keyboardHeight, 10) }]}> 
      <View style={[styles.inputContainer, isFocused && styles.inputContainerFocused]}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={theme.colors.textMuted}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={2000}
          editable={!disabled}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            isGenerating
              ? styles.stopButton
              : (!message.trim() || disabled) && styles.sendButtonDisabled,
          ]}
          onPress={handleButtonPress}
          disabled={isGenerating ? false : !message.trim() || disabled}
        >
          <Ionicons
            name={isGenerating ? 'stop' : 'send'}
            size={18}
            color={
              isGenerating
                ? '#fff'
                : !message.trim() || disabled
                  ? theme.colors.textMuted
                  : '#fff'
            }
          />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      left: 16,
      right: 16,
      paddingTop: 2,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(20, 24, 33, 0.84)',
      borderRadius: 22,
      paddingLeft: 12,
      paddingRight: 4,
      paddingVertical: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.24,
      shadowRadius: 18,
      elevation: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    inputContainerFocused: {
      borderColor: theme.colors.primary,
      shadowColor: theme.colors.primary,
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 10,
    },
    input: {
      flex: 1,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      maxHeight: 100,
      minHeight: 34,
      paddingVertical: 7,
      paddingHorizontal: 0,
    },
    sendButton: {
      backgroundColor: theme.colors.primary,
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 8,
    },
    sendButtonDisabled: {
      backgroundColor: theme.colors.backgroundTertiary,
    },
    stopButton: {
      backgroundColor: theme.colors.error,
    },
  });
