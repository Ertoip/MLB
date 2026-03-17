import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Chat, Message, Settings, Persona } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 15);

const defaultSettings: Settings = {
  apiKey: '',
  model: 'ladybug',
  temperature: 0.8,
  maxTokens: 1024,
};

const API_BASE_URL = 'http://localhost:8000';

// Convert Chat to JSON-serializable format
const serializeChats = (chats: Chat[]) => {
  return chats.map((chat) => ({
    ...chat,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
    messages: chat.messages.map((msg) => ({
      ...msg,
      timestamp: msg.timestamp.toISOString(),
    })),
  }));
};

// Convert JSON back to Chat with Date objects
const deserializeChats = (data: any[]): Chat[] => {
  return data.map((chat) => ({
    ...chat,
    createdAt: new Date(chat.createdAt),
    updatedAt: new Date(chat.updatedAt),
    persona: chat.persona || 'ladybug', // Default to ladybug for old chats
    messages: chat.messages.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    })),
  }));
};

export function useChat(password: string | null, persona: Persona) {
  const [allChats, setAllChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const deleteChat = useCallback((chatId: string) => {
    setAllChats((prev) => prev.filter((chat) => chat.id !== chatId));
    if (currentChatId === chatId) {
      setCurrentChatId(null);
    }
  }, [currentChatId]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

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
            title: isFirstMessage ? content.slice(0, 30) + (content.length > 30 ? '...' : '') : chat.title,
            messages: [...chat.messages, userMessage],
            updatedAt: new Date(),
          };
        }
        return chat;
      })
    );

    setIsLoading(true);

    // Create placeholder message for streaming
    const assistantMessageId = generateId();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    // Add empty assistant message that will be filled by streaming
    setAllChats((prev) =>
      prev.map((chat) => {
        if (chat.id === chatId) {
          return {
            ...chat,
            messages: [...chat.messages, assistantMessage],
            updatedAt: new Date(),
          };
        }
        return chat;
      })
    );

    try {
      // Get current chat messages for context
      const currentMessages = allChats.find((c) => c.id === chatId)?.messages || [];
      const apiMessages = [
        ...currentMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: content.trim() },
      ];

      const response = await fetch(`${API_BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: apiMessages,
          persona: persona,
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Append new chunk to buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete SSE messages (ending with \n\n)
          const messages = buffer.split('\n\n');
          // Keep the last incomplete message in buffer
          buffer = messages.pop() || '';

          for (const message of messages) {
            const lines = message.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.content) {
                    fullContent += data.content;
                    // Update the assistant message with streamed content
                    setAllChats((prev) =>
                      prev.map((chat) => {
                        if (chat.id === chatId) {
                          return {
                            ...chat,
                            messages: chat.messages.map((msg) =>
                              msg.id === assistantMessageId
                                ? { ...msg, content: fullContent }
                                : msg
                            ),
                            updatedAt: new Date(),
                          };
                        }
                        return chat;
                      })
                    );
                  }
                } catch {
                  // Ignore JSON parse errors for incomplete chunks
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      // Update message to show error
      const errorName = persona === 'ladybug' ? 'Ladybug' : 'Chat Noir';
      setAllChats((prev) =>
        prev.map((chat) => {
          if (chat.id === chatId) {
            return {
              ...chat,
              messages: chat.messages.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: `Error: Could not connect to ${errorName}. Make sure the backend server is running on http://localhost:8000` }
                  : msg
              ),
              updatedAt: new Date(),
            };
          }
          return chat;
        })
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentChatId, createNewChat, allChats, settings, persona]);

  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  // Save chats to backend (debounced)
  const saveChats = useCallback(
    async (chatsToSave: Chat[]) => {
      if (!password) return;

      // Clear any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce saves to avoid too many requests
      saveTimeoutRef.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          await fetch(`${API_BASE_URL}/chats/save`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Password': password,
            },
            body: JSON.stringify({ chats: serializeChats(chatsToSave) }),
          });
        } catch (error) {
          console.error('Failed to save chats:', error);
        } finally {
          setIsSaving(false);
        }
      }, 500);
    },
    [password]
  );

  // Load chats from backend
  const loadChats = useCallback(async (): Promise<boolean> => {
    if (!password) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/chats/load`, {
        method: 'POST',
        headers: {
          'X-Password': password,
        },
      });

      if (response.status === 401) {
        return false; // Invalid password
      }

      if (!response.ok) {
        throw new Error('Failed to load chats');
      }

      const data = await response.json();
      const loadedChats = deserializeChats(data.chats || []);
      setAllChats(loadedChats);
      return true;
    } catch (error) {
      console.error('Failed to load chats:', error);
      return false;
    }
  }, [password]);

  // Auto-save when chats change
  useEffect(() => {
    if (allChats.length > 0 && password) {
      saveChats(allChats);
    }
  }, [allChats, password, saveChats]);

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
    updateSettings,
    loadChats,
    setAllChats,
  };
}
