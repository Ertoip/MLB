import React, { useState, useEffect } from 'react';
import { View, StyleSheet, StatusBar, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider, useTheme } from './styles/ThemeContext';
import { useChat } from './hooks/useChat';
import {
  accountExists,
  getStoredUserName,
  setStoredUserName,
  updateCredentials,
} from './services/storage';
import {
  initializeLLM,
  isLLMReady,
  isModelDownloaded,
  checkForUnusedModels,
  cleanupUnusedModels,
  DownloadProgressInfo,
  deleteCurrentModel,
  forceRedownloadModel,
  prewarmModel,
} from './services/llm';
import {
  initializeRAG,
  isEmbeddingModelDownloaded,
  prewarmEmbeddingModel,
  DownloadProgressInfo as RAGDownloadProgressInfo,
} from './services/rag';
import { PasswordModal } from './components/PasswordModal';
import { ChatView } from './components/ChatView';
import { Sidebar } from './components/Sidebar';
import { LoadingScreen } from './components/LoadingScreen';
import { DissolveTransition } from './components/DissolveTransition';

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore if splash screen is already controlled or unavailable.
});

function MainApp() {
  const { theme, persona, transition, onTransitionComplete } = useTheme();
  const [userName, setUserName] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [isNewAccount, setIsNewAccount] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // LLM loading state
  const [isLLMLoading, setIsLLMLoading] = useState(true);
  const [llmLoadingMessage, setLlmLoadingMessage] = useState('Checking model...');
  const [downloadProgress, setDownloadProgress] = useState<number | undefined>(undefined);
  const [downloadedSize, setDownloadedSize] = useState<string | undefined>(undefined);
  const [totalSize, setTotalSize] = useState<string | undefined>(undefined);
  const [hasRenderedFirstFrame, setHasRenderedFirstFrame] = useState(false);

  const {
    chats,
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
    loadChats,
  } = useChat(password, persona, userName);

  // Check account and initialize LLM on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setHasRenderedFirstFrame(true);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hasRenderedFirstFrame) {
      return;
    }

    SplashScreen.hideAsync().catch((error) => {
      console.error('Failed to hide splash screen:', error);
    });
  }, [hasRenderedFirstFrame]);

  useEffect(() => {
    const initialize = async () => {
      // Check account
      try {
        const exists = await accountExists();
        setIsNewAccount(!exists);
        const storedName = await getStoredUserName();
        if (storedName) {
          setUserName(storedName);
        }
      } catch (error) {
        console.error('Failed to check account:', error);
        setIsNewAccount(true);
      }
      setIsAuthLoading(false);

      // Initialize LLM
      try {
        const modelExists = await isModelDownloaded();
        if (!modelExists) {
          setLlmLoadingMessage('Downloading AI model (~2.7GB)...');
        } else {
          setLlmLoadingMessage('Loading AI model...');
        }

        await initializeLLM((progressInfo: DownloadProgressInfo) => {
          setDownloadProgress(progressInfo.progress);
          setDownloadedSize(progressInfo.downloadedFormatted);
          setTotalSize(progressInfo.totalFormatted);
        });

        // Pre-warm the LLM model for faster first response
        setLlmLoadingMessage('Warming up...');
        await prewarmModel();

        // Initialize RAG (embedding model)
        const embeddingModelExists = await isEmbeddingModelDownloaded();
        if (!embeddingModelExists) {
          setLlmLoadingMessage('Downloading knowledge model (~25MB)...');
          setDownloadProgress(0);
        } else {
          setLlmLoadingMessage('Loading knowledge model...');
        }

        await initializeRAG((progressInfo: RAGDownloadProgressInfo) => {
          setDownloadProgress(progressInfo.progress);
          setDownloadedSize(progressInfo.downloadedFormatted);
          setTotalSize(progressInfo.totalFormatted);
        });

        // Pre-warm the embedding model
        setLlmLoadingMessage('Warming up knowledge...');
        await prewarmEmbeddingModel();

        setIsLLMLoading(false);

        // Check for unused models after models are loaded
        checkForUnusedModelsOnStartup();
      } catch (error) {
        console.error('Failed to initialize LLM:', error);
        
        // Offer to redownload if model failed to load
        Alert.alert(
          'Model Load Failed',
          'The AI model failed to load. This might be due to a corrupted download. Would you like to delete and redownload the model?',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => setLlmLoadingMessage('Failed to load AI model. Please restart the app.'),
            },
            {
              text: 'Redownload',
              onPress: async () => {
                try {
                  setLlmLoadingMessage('Deleting old model...');
                  await deleteCurrentModel();
                  
                  setLlmLoadingMessage('Downloading AI model (~2.7GB)...');
                  setDownloadProgress(0);
                  
                  await initializeLLM((progressInfo: DownloadProgressInfo) => {
                    setDownloadProgress(progressInfo.progress);
                    setDownloadedSize(progressInfo.downloadedFormatted);
                    setTotalSize(progressInfo.totalFormatted);
                  });

                  // Pre-warm the LLM model
                  setLlmLoadingMessage('Warming up...');
                  await prewarmModel();

                  // Initialize RAG
                  const embeddingModelExists = await isEmbeddingModelDownloaded();
                  if (!embeddingModelExists) {
                    setLlmLoadingMessage('Downloading knowledge model (~25MB)...');
                    setDownloadProgress(0);
                  } else {
                    setLlmLoadingMessage('Loading knowledge model...');
                  }

                  await initializeRAG((progressInfo: RAGDownloadProgressInfo) => {
                    setDownloadProgress(progressInfo.progress);
                    setDownloadedSize(progressInfo.downloadedFormatted);
                    setTotalSize(progressInfo.totalFormatted);
                  });

                  setLlmLoadingMessage('Warming up knowledge...');
                  await prewarmEmbeddingModel();
                  
                  setIsLLMLoading(false);
                  checkForUnusedModelsOnStartup();
                } catch (retryError) {
                  console.error('Retry failed:', retryError);
                  setLlmLoadingMessage('Failed to load AI model. Please restart the app.');
                }
              },
            },
          ]
        );
      }
    };

    initialize();
  }, []);

  // Check for unused models and prompt user to clean up
  const checkForUnusedModelsOnStartup = async () => {
    try {
      const { hasUnusedModels, unusedSpaceFormatted } = await checkForUnusedModels();
      
      if (hasUnusedModels) {
        // Small delay to let the UI settle
        setTimeout(() => {
          Alert.alert(
            'Old Models Found',
            `You have unused AI models taking up ${unusedSpaceFormatted} of storage. Would you like to delete them?`,
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Clean Up',
                onPress: async () => {
                  try {
                    const result = await cleanupUnusedModels();
                    Alert.alert(
                      'Cleanup Complete',
                      `Freed ${result.freedSpaceFormatted} of storage.`
                    );
                  } catch (error) {
                    console.error('Failed to cleanup models:', error);
                  }
                },
              },
            ]
          );
        }, 500);
      }
    } catch (error) {
      console.error('Failed to check for unused models:', error);
    }
  };

  // Load chats when password is set
  useEffect(() => {
    if (password) {
      const doLoad = async () => {
        setIsAuthLoading(true);
        const success = await loadChats();
        setIsAuthLoading(false);
        if (success && userName) {
          setStoredUserName(userName).catch((error) => {
            console.error('Failed to store user name:', error);
          });
        } else if (!success && !isNewAccount) {
          setAuthError('Invalid password');
          setPassword(null);
        }
      };
      doLoad();
    }
  }, [password, loadChats, isNewAccount, userName]);

  const handlePasswordSubmit = ({
    name,
    password: submittedPassword,
  }: {
    name: string;
    password: string;
  }) => {
    setAuthError(null);
    setUserName(name);
    setPassword(submittedPassword);
  };

  const handleUpdateCredentials = async ({
    currentPassword,
    newPassword,
    newName,
  }: {
    currentPassword: string;
    newPassword: string;
    newName: string;
  }) => {
    const result = await updateCredentials(
      currentPassword || null,
      newPassword || null,
      newName
    );
    if (!result.success) {
      throw new Error(result.error || 'Failed to update credentials');
    }

    if (newPassword) {
      setPassword(newPassword);
    }
    setUserName(newName.trim());
  };

  const styles = createStyles(theme);

  // Show loading screen while LLM initializes
  if (isLLMLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={theme.colors.background}
        />
        <LoadingScreen 
          message={llmLoadingMessage} 
          progress={downloadProgress}
          downloadedSize={downloadedSize}
          totalSize={totalSize}
        />
      </SafeAreaView>
    );
  }

  // Show loading while checking account
  if (isAuthLoading && isNewAccount === null) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={theme.colors.background}
        />
        <LoadingScreen message="Loading..." />
      </SafeAreaView>
    );
  }

  // Show password modal if not authenticated
  if (!password) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={theme.colors.background}
        />
        <PasswordModal
          isNewAccount={isNewAccount ?? true}
          onSubmit={handlePasswordSubmit}
          initialName={userName ?? undefined}
          error={authError}
          isLoading={isAuthLoading}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.colors.background}
      />
      
      {isSaving && (
        <View style={styles.saveIndicator}>
          <View style={styles.saveIndicatorInner} />
        </View>
      )}

      <Sidebar
        isOpen={sidebarOpen}
        chats={chats}
        currentChatId={currentChatId}
        settings={settings}
        onClose={() => setSidebarOpen(false)}
        onSelectChat={selectChat}
        onNewChat={() => {
          createNewChat();
          setSidebarOpen(false);
        }}
        onDeleteChat={deleteChat}
        onUpdateSettings={updateSettings}
        userName={userName ?? ''}
        onUpdateCredentials={handleUpdateCredentials}
      />

      <ChatView
        chat={currentChat}
        isLoading={isLoading}
        onSendMessage={sendMessage}
        onStopGeneration={stopMessageGeneration}
        onMenuClick={() => setSidebarOpen(true)}
      />

      {/* Dissolve transition overlay */}
      <DissolveTransition
        isActive={transition.isActive}
        color={transition.color}
        direction={transition.direction}
        persona={persona}
        onComplete={onTransitionComplete}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <MainApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    saveIndicator: {
      position: 'absolute',
      top: 10,
      right: 10,
      zIndex: 1000,
    },
    saveIndicatorInner: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.primary,
    },
  });
