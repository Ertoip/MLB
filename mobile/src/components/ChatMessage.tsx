import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView } from 'react-native';
import Markdown, { MarkdownIt, RenderRules } from 'react-native-markdown-display';
import { Message, Persona } from '../types';
import { useTheme } from '../styles/ThemeContext';

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
}

const markdownIt = MarkdownIt({
  typographer: true,
  linkify: true,
  breaks: true,
});

const THINKING_MESSAGES = {
  ladybug: [
    '✨ Thinking...',
    '🐞 Using Lucky Charm...',
    '💭 Hmm, let me think...',
    '🎀 Working on it, kitty...',
    '⚡ Spots on!',
  ],
  chatnoir: [
    "🐱 Thinking, m'lady...",
    '💚 Purrfecting my response...',
    '✨ One moment, beautiful...',
    '🌙 Let me think, mon chérie...',
    '😼 Claws out!',
  ],
  assistant: [
    'Thinking...',
    'Reviewing your request...',
    'Working through it...',
    'Preparing a clear answer...',
    'One moment...',
  ],
};

function TypingIndicator({ persona }: { persona: Persona }) {
  const { theme } = useTheme();
  const [messageIndex, setMessageIndex] = useState(0);
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createBounce = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: -8,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      );

    const anim1 = createBounce(dot1Anim, 0);
    const anim2 = createBounce(dot2Anim, 150);
    const anim3 = createBounce(dot3Anim, 300);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1Anim, dot2Anim, dot3Anim]);

  useEffect(() => {
    const messages = THINKING_MESSAGES[persona];
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [persona]);

  const messages = THINKING_MESSAGES[persona];
  const currentMessage = messages[messageIndex];

  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
      paddingVertical: 4,
    },
    messageText: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      marginBottom: 8,
      fontStyle: 'italic',
    },
    dotsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.colors.primary,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.messageText}>{currentMessage}</Text>
      <View style={styles.dotsContainer}>
        <Animated.View style={[styles.dot, { transform: [{ translateY: dot1Anim }] }]} />
        <Animated.View style={[styles.dot, { transform: [{ translateY: dot2Anim }], opacity: 0.7 }]} />
        <Animated.View style={[styles.dot, { transform: [{ translateY: dot3Anim }], opacity: 0.5 }]} />
      </View>
    </View>
  );
}

export const ChatMessage = memo(function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const { theme, persona } = useTheme();
  const isUser = message.role === 'user';
  const showTypingIndicator = !isUser && isStreaming && !message.content;

  const styles = createStyles(theme, isUser);
  const markdownStyles = createMarkdownStyles(theme, isUser);

  const markdownRules: RenderRules = useMemo(
    () => ({
      table: (node, children) => (
        <ScrollView
          key={node.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={markdownStyles.tableScroll}
        >
          <View style={markdownStyles.table}>{children}</View>
        </ScrollView>
      ),
    }),
    [markdownStyles]
  );

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        {showTypingIndicator ? (
          <TypingIndicator persona={persona} />
        ) : isStreaming ? (
          <Text style={styles.streamingText}>{message.content}</Text>
        ) : (
          <Markdown markdownit={markdownIt} style={markdownStyles} rules={markdownRules}>
            {message.content}
          </Markdown>
        )}
      </View>
    </View>
  );
});

const createStyles = (theme: any, isUser: boolean) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    bubble: {
      maxWidth: '85%',
      backgroundColor: isUser ? theme.colors.primary : theme.colors.backgroundTertiary,
      borderRadius: theme.borderRadius.lg,
      borderBottomRightRadius: isUser ? theme.borderRadius.sm : theme.borderRadius.lg,
      borderBottomLeftRadius: isUser ? theme.borderRadius.lg : theme.borderRadius.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    streamingText: {
      color: theme.colors.text,
      fontSize: theme.fontSize.sm,
      lineHeight: 22,
    },
  });

const createMarkdownStyles = (theme: any, isUser: boolean): any => ({
  body: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    lineHeight: 22,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: theme.spacing.xs,
    color: theme.colors.text,
  },
  text: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    lineHeight: 22,
  },
  strong: {
    color: theme.colors.text,
    fontWeight: '700' as const,
  },
  em: {
    color: theme.colors.text,
    fontStyle: 'italic',
  },
  bullet_list: {
    marginTop: 0,
    marginBottom: theme.spacing.xs,
  },
  ordered_list: {
    marginTop: 0,
    marginBottom: theme.spacing.xs,
  },
  list_item: {
    marginTop: 0,
    marginBottom: theme.spacing.xs / 2,
  },
  bullet_list_icon: {
    color: theme.colors.text,
    marginRight: theme.spacing.xs,
  },
  bullet_list_content: {
    color: theme.colors.text,
  },
  ordered_list_icon: {
    color: theme.colors.text,
    marginRight: theme.spacing.xs,
  },
  ordered_list_content: {
    color: theme.colors.text,
  },
  code_inline: {
    color: theme.colors.text,
    backgroundColor: isUser ? 'rgba(255,255,255,0.16)' : theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  fence: {
    color: theme.colors.text,
    backgroundColor: isUser ? 'rgba(255,255,255,0.12)' : theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  tableScroll: {
    marginBottom: theme.spacing.xs,
  },
  table: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden' as const,
  },
  thead: {
    backgroundColor: isUser ? 'rgba(255,255,255,0.12)' : theme.colors.backgroundSecondary,
  },
  tbody: {
    backgroundColor: 'transparent',
  },
  tr: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  th: {
    minWidth: 88,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    color: theme.colors.text,
    fontWeight: '700' as const,
  },
  td: {
    minWidth: 88,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    color: theme.colors.text,
  },
  link: {
    color: theme.colors.primaryLight,
    textDecorationLine: 'underline',
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
    paddingLeft: theme.spacing.sm,
    opacity: 0.9,
  },
});
