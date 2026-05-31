import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  Keyboard,
  Platform,
  Animated,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Chat } from '../types';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { PersonaToggle } from './PersonaToggle';
import { useTheme } from '../styles/ThemeContext';

interface ChatViewProps {
  chat: Chat | null;
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onStopGeneration: () => void;
  onMenuClick: () => void;
}

const MESSAGE_BATCH_SIZE = 10;

export function ChatView({
  chat,
  isLoading,
  onSendMessage,
  onStopGeneration,
  onMenuClick,
}: ChatViewProps) {
  const { theme, persona } = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const [keyboardHeight] = useState(new Animated.Value(0));
  const [visibleCount, setVisibleCount] = useState(MESSAGE_BATCH_SIZE);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const lastContentHeightRef = useRef(0);
  const pendingPrependRef = useRef<{ contentHeight: number; offsetY: number } | null>(null);
  const isNearBottomRef = useRef(true);

  const logo =
    persona === 'ladybug'
      ? require('../assets/Ladybug.png')
      : persona === 'chatnoir'
        ? require('../assets/Charnoir.png')
        : null;
  const name =
    persona === 'ladybug'
      ? 'Ladybug'
      : persona === 'chatnoir'
        ? 'Chat Noir'
        : 'Assistant';

  // Handle keyboard show/hide
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        Animated.timing(keyboardHeight, {
          toValue: e.endCoordinates.height,
          duration: Platform.OS === 'ios' ? 250 : 100,
          useNativeDriver: false,
        }).start();
        // Scroll to bottom when keyboard appears
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
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

  // Scroll to bottom when messages change
  useEffect(() => {
    if (isLoadingOlder) {
      return;
    }

    if (isNearBottomRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [chat?.messages, isLoadingOlder]);

  useEffect(() => {
    setVisibleCount(MESSAGE_BATCH_SIZE);
  }, [chat?.id]);

  const totalMessages = chat?.messages.length ?? 0;
  const displayedMessages = chat?.messages.slice(-visibleCount) ?? [];
  const hasOlderMessages = totalMessages > visibleCount;

  const loadOlderMessages = () => {
    if (!hasOlderMessages) return;
    pendingPrependRef.current = {
      contentHeight: lastContentHeightRef.current,
      offsetY: 0,
    };
    setIsLoadingOlder(true);
    setVisibleCount((prev) => Math.min(prev + MESSAGE_BATCH_SIZE, totalMessages));
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    isNearBottomRef.current = distanceFromBottom < 120;

    if (contentOffset.y <= 32 && hasOlderMessages && !isLoadingOlder) {
      pendingPrependRef.current = {
        contentHeight: lastContentHeightRef.current,
        offsetY: contentOffset.y,
      };
      setIsLoadingOlder(true);
      setVisibleCount((prev) => Math.min(prev + MESSAGE_BATCH_SIZE, totalMessages));
    }
  };

  const handleContentSizeChange = (_width: number, height: number) => {
    if (isLoadingOlder && pendingPrependRef.current && scrollViewRef.current) {
      const { contentHeight, offsetY } = pendingPrependRef.current;
      const delta = height - contentHeight;
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, offsetY + delta),
          animated: false,
        });
        pendingPrependRef.current = null;
        setIsLoadingOlder(false);
      });
    }

    lastContentHeightRef.current = height;
  };

  const styles = createStyles(theme);

  // Calculate bottom padding: base padding + keyboard height + input height
  const animatedPaddingBottom = keyboardHeight.interpolate({
    inputRange: [0, 1000],
    outputRange: [68, 1068],
  });

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onMenuClick} style={styles.menuButton}>
          {logo ? (
            <Image source={logo} style={styles.menuLogo} />
          ) : (
            <Text style={styles.menuBadgeText}>AI</Text>
          )}
        </TouchableOpacity>
        <PersonaToggle />
      </View>

      {/* Messages */}
      <Animated.View style={[styles.messagesWrapper, { paddingBottom: animatedPaddingBottom }]}> 
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={handleContentSizeChange}
        >
          {!chat || chat.messages.length === 0 ? (
            <View style={styles.emptyState}>
              {logo ? (
                <Image source={logo} style={styles.emptyLogo} />
              ) : (
                <View style={styles.emptyAssistantLogo}>
                  <Text style={styles.emptyAssistantLogoText}>AI</Text>
                </View>
              )}
              <Text style={styles.emptyTitle}>
                {persona === 'ladybug'
                  ? "Let's chat!"
                  : persona === 'chatnoir'
                    ? 'Hey there,'
                    : 'How can I help?'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {persona === 'ladybug'
                  ? `Send a message to begin chatting with ${name}.`
                  : persona === 'chatnoir'
                    ? 'Do you wanna chat with me?'
                    : 'Ask anything and I will answer in a clear, helpful way.'}
              </Text>
            </View>
          ) : (
            <>
              {(hasOlderMessages || isLoadingOlder) && (
                <View style={styles.topLoaderWrap}>
                  {isLoadingOlder ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <View style={styles.topLoaderSpacer} />
                  )}
                </View>
              )}
              {displayedMessages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isStreaming={isLoading && index === displayedMessages.length - 1}
                />
              ))}
            </>
          )}
        </ScrollView>
      </Animated.View>

      {/* Input */}
      <ChatInput
        onSend={onSendMessage}
        onStop={onStopGeneration}
        disabled={isLoading}
        isGenerating={isLoading}
      />
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000000',
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      paddingTop: 12,
      backgroundColor: '#000000',
      zIndex: 2,
    },
    menuButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(20, 24, 33, 0.84)',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.22,
      shadowRadius: 14,
      elevation: 7,
      borderWidth: 2,
      borderColor: theme.colors.primary,
    },
    menuLogo: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    menuBadgeText: {
      color: theme.colors.primary,
      fontSize: theme.fontSize.sm,
      fontWeight: '700',
      letterSpacing: 1,
    },
    messagesWrapper: {
      flex: 1,
    },
    messagesContainer: {
      flex: 1,
    },
    messagesContent: {
      flexGrow: 1,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.xs,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.spacing.xl,
    },
    emptyLogo: {
      width: 80,
      height: 80,
      marginBottom: theme.spacing.lg,
    },
    emptyAssistantLogo: {
      width: 80,
      height: 80,
      borderRadius: 40,
      marginBottom: theme.spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.backgroundTertiary,
      borderWidth: 2,
      borderColor: theme.colors.primary,
    },
    emptyAssistantLogoText: {
      color: theme.colors.primary,
      fontSize: theme.fontSize.xl,
      fontWeight: '700',
      letterSpacing: 2,
    },
    emptyTitle: {
      fontSize: theme.fontSize.xl,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    emptySubtitle: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    topLoaderWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 28,
      marginBottom: theme.spacing.xs,
    },
    topLoaderSpacer: {
      height: 20,
    },
  });
