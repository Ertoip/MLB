import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Chat, Message, Settings, Persona } from '../types';
import {
  generateResponse,
  LLMMessage,
  isLLMReady,
  stopGeneration as stopLLMGeneration,
} from '../services/llm';
import { saveChats, loadChats } from '../services/storage';

const generateId = () => Math.random().toString(36).substring(2, 15);

const defaultSettings: Settings = {
  temperature: 0.8,
  maxTokens: 512,
};

// Throttle interval for UI updates during streaming (ms)
const TOKEN_UPDATE_INTERVAL = 50;

// Max messages to include in context (to limit prompt size)
const MAX_CONTEXT_MESSAGES = 10;

export function useChat(
  password: string | null,
  persona: Persona,
  userName: string | null
) {
  const [allChats, setAllChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isStreamingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const wasStoppedRef = useRef(false);

  // Filter chats by current persona
  const chats = useMemo(() => {
    return allChats.filter((chat) => chat.persona === persona);
  }, [allChats, persona]);

  const currentChat = chats.find((chat) => chat.id === currentChatId) || null;

  // Clear current chat when switching personas if it doesn't belong to current persona
  useEffect(() => {
    if (currentChatId) {
      const chat = allChats.find((c) => c.id === currentChatId);
      if (chat && chat.persona !== persona) {
        setCurrentChatId(null);
      }
    }
  }, [persona, currentChatId, allChats]);

  const createNewChat = useCallback(() => {
    const newChat: Chat = {
      id: generateId(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      persona: persona,
    };
    setAllChats((prev) => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    return newChat;
  }, [persona]);

  const selectChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
  }, []);

  const deleteChat = useCallback(
    (chatId: string) => {
      setAllChats((prev) => prev.filter((chat) => chat.id !== chatId));
      if (currentChatId === chatId) {
        setCurrentChatId(null);
      }
    },
    [currentChatId]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      if (!isLLMReady()) {
        console.error('LLM not ready');
        return;
      }

      let chatId = currentChatId;

      if (!chatId) {
        const newChat = createNewChat();
        chatId = newChat.id;
      }

      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };

      setAllChats((prev) =>
        prev.map((chat) => {
          if (chat.id === chatId) {
            const isFirstMessage = chat.messages.length === 0;
            return {
              ...chat,
              title: isFirstMessage
                ? content.slice(0, 30) + (content.length > 30 ? '...' : '')
                : chat.title,
              messages: [...chat.messages, userMessage],
              updatedAt: new Date(),
            };
          }
          return chat;
        })
      );

      setIsLoading(true);
      isStreamingRef.current = true;

      // Create placeholder message for streaming
      const assistantMessageId = generateId();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      // Add empty assistant message that will be filled by streaming
      activeAssistantMessageIdRef.current = assistantMessageId;
      activeChatIdRef.current = chatId;
      wasStoppedRef.current = false;
      setAllChats((prev) =>
        prev.map((chat) => {
          if (chat.id === chatId) {
            return {
              ...chat,
              messages: [...chat.messages, assistantMessage],
            };
          }
          return chat;
        })
      );

      try {
        // Get current chat messages for context (limited to last N messages)
        const currentMessages =
          allChats.find((c) => c.id === chatId)?.messages || [];
        const recentMessages = currentMessages.slice(-MAX_CONTEXT_MESSAGES);
        const apiMessages: LLMMessage[] = [
          ...recentMessages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user' as const, content: content.trim() },
        ];

        let fullContent = '';
        let lastUpdateTime = 0;

        await generateResponse(
          apiMessages,
          persona,
          {
            onToken: (token) => {
              fullContent += token;
              
              // Throttle UI updates to reduce overhead
              const now = Date.now();
              if (now - lastUpdateTime >= TOKEN_UPDATE_INTERVAL) {
                lastUpdateTime = now;
                const contentSnapshot = fullContent;
                setAllChats((prev) =>
                  prev.map((chat) => {
                    if (chat.id === chatId) {
                      return {
                        ...chat,
                        messages: chat.messages.map((msg) =>
                          msg.id === assistantMessageId
                            ? { ...msg, content: contentSnapshot }
                            : msg
                        ),
                      };
                    }
                    return chat;
                  })
                );
              }
            },
            onComplete: () => {
              // Final update with complete content and timestamp
              const finalContent = fullContent;
              setAllChats((prev) =>
                prev.map((chat) => {
                  if (chat.id === chatId) {
                    return {
                      ...chat,
                      messages: chat.messages.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, content: finalContent }
                          : msg
                      ),
                      updatedAt: new Date(),
                    };
                  }
                  return chat;
                })
              );
              isStreamingRef.current = false;
              setIsLoading(false);
              activeAssistantMessageIdRef.current = null;
              activeChatIdRef.current = null;
               
              // Trigger save now that streaming is done
              if (pendingSaveRef.current) {
                pendingSaveRef.current = false;
              }
            },
            onError: (error) => {
              console.error('Chat error:', error);
              if (wasStoppedRef.current) {
                const partialContent = fullContent.trim();
                setAllChats((prev) =>
                  prev.map((chat) => {
                    if (chat.id === chatId) {
                      return {
                        ...chat,
                        messages: chat.messages.map((msg) =>
                          msg.id === assistantMessageId
                            ? {
                                ...msg,
                                content: partialContent || 'Stopped.',
                              }
                            : msg
                        ),
                        updatedAt: new Date(),
                      };
                    }
                    return chat;
                  })
                );
                isStreamingRef.current = false;
                setIsLoading(false);
                activeAssistantMessageIdRef.current = null;
                activeChatIdRef.current = null;
                return;
              }
              const errorName =
                persona === 'ladybug'
                  ? 'Ladybug'
                  : persona === 'chatnoir'
                    ? 'Chat Noir'
                    : 'Assistant';
              setAllChats((prev) =>
                prev.map((chat) => {
                  if (chat.id === chatId) {
                    return {
                      ...chat,
                      messages: chat.messages.map((msg) =>
                        msg.id === assistantMessageId
                          ? {
                              ...msg,
                              content: `Error: ${errorName} encountered an issue. ${error.message}`,
                            }
                          : msg
                      ),
                      updatedAt: new Date(),
                    };
                  }
                  return chat;
                })
              );
              isStreamingRef.current = false;
              setIsLoading(false);
              activeAssistantMessageIdRef.current = null;
              activeChatIdRef.current = null;
            },
          },
          {
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            userName: userName || undefined,
          }
        );
      } catch (error) {
        console.error('Chat error:', error);
        isStreamingRef.current = false;
        setIsLoading(false);
      }
    },
    [currentChatId, createNewChat, allChats, settings, persona, userName]
  );

  const stopMessageGeneration = useCallback(async () => {
    if (!isStreamingRef.current) {
      return;
    }

    wasStoppedRef.current = true;
    try {
      await stopLLMGeneration();
    } catch (error) {
      console.error('Failed to stop generation:', error);
      isStreamingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  // Save chats to storage (debounced)
  const saveChatsToStorage = useCallback(
    async (chatsToSave: Chat[]) => {
      if (!password) return;

      // Clear any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce saves to avoid too many writes
      saveTimeoutRef.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          await saveChats(chatsToSave, password);
        } catch (error) {
          console.error('Failed to save chats:', error);
        } finally {
          setIsSaving(false);
        }
      }, 500);
    },
    [password]
  );

  // Load chats from storage
  const loadChatsFromStorage = useCallback(async (): Promise<boolean> => {
    if (!password) return false;

    try {
      const { chats: loadedChats, error } = await loadChats(password);

      if (error === 'invalid_password') {
        return false;
      }

      if (error) {
        console.error('Failed to load chats:', error);
        return false;
      }

      setAllChats(loadedChats || []);
      return true;
    } catch (error) {
      console.error('Failed to load chats:', error);
      return false;
    }
  }, [password]);

  // Auto-save when chats change (but not during streaming)
  useEffect(() => {
    if (allChats.length > 0 && password) {
      if (isStreamingRef.current) {
        // Mark that we need to save when streaming completes
        pendingSaveRef.current = true;
        return;
      }
      saveChatsToStorage(allChats);
    }
  }, [allChats, password, saveChatsToStorage]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    chats,
    allChats,
    currentChat,
    currentChatId,
    settings,
    isLoading,
    isSaving,
    createNewChat,
    selectChat,
    deleteChat,
    sendMessage,
    stopMessageGeneration,
    updateSettings,
    loadChats: loadChatsFromStorage,
    setAllChats,
  };
}
