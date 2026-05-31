import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Animated,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chat, Settings } from '../types';
import { useTheme } from '../styles/ThemeContext';
import {
  getModelsStorageUsage,
  checkForUnusedModels,
  cleanupUnusedModels,
  getCurrentModelFilename,
} from '../services/llm';

interface SidebarProps {
  isOpen: boolean;
  chats: Chat[];
  currentChatId: string | null;
  settings: Settings;
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onUpdateSettings: (settings: Partial<Settings>) => void;
  userName: string;
  onUpdateCredentials: (credentials: {
    currentPassword: string;
    newPassword: string;
    newName: string;
  }) => Promise<void>;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SIDEBAR_WIDTH = Math.min(SCREEN_WIDTH * 0.8, 320);

export function Sidebar({
  isOpen,
  chats,
  currentChatId,
  settings,
  onClose,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onUpdateSettings,
  userName,
  onUpdateCredentials,
}: SidebarProps) {
  const { theme, persona } = useTheme();
  const [activeTab, setActiveTab] = useState<'chats' | 'settings'>('chats');
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  // Model storage state
  const [storageInfo, setStorageInfo] = useState<{
    total: string;
    unused: string;
    unusedBytes: number;
  } | null>(null);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [hasUnusedModels, setHasUnusedModels] = useState(false);
  const [nameInput, setNameInput] = useState(userName);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);

  useEffect(() => {
    setNameInput(userName);
  }, [userName]);

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Load storage info when sidebar opens
      loadStorageInfo();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -SIDEBAR_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen]);

  const loadStorageInfo = async () => {
    try {
      const usage = await getModelsStorageUsage();
      const unusedCheck = await checkForUnusedModels();
      
      setStorageInfo({
        total: usage.totalFormatted,
        unused: usage.unusedFormatted,
        unusedBytes: usage.unused,
      });
      setHasUnusedModels(unusedCheck.hasUnusedModels);
    } catch (error) {
      console.error('Error loading storage info:', error);
    }
  };

  const handleCleanupModels = async () => {
    Alert.alert(
      'Clean Up Old Models',
      `This will delete unused model files and free up ${storageInfo?.unused || 'some'} of storage. The current model will not be affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsCleaningUp(true);
            try {
              const result = await cleanupUnusedModels();
              Alert.alert(
                'Cleanup Complete',
                `Deleted ${result.deleted.length} old model(s) and freed ${result.freedSpaceFormatted} of storage.`
              );
              await loadStorageInfo();
            } catch (error) {
              Alert.alert('Error', 'Failed to clean up models');
            } finally {
              setIsCleaningUp(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const chatDate = new Date(date);
    const diffDays = Math.floor(
      (now.getTime() - chatDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return chatDate.toLocaleDateString();
  };

  const handleUpdateCredentialsPress = async () => {
    if (!nameInput.trim()) {
      Alert.alert('Missing Name', 'Please enter your name.');
      return;
    }

    if (!newPasswordInput && nameInput.trim() === userName.trim()) {
      Alert.alert('No Changes', 'Update the name or enter a new password first.');
      return;
    }

    if (newPasswordInput && !currentPasswordInput) {
      Alert.alert('Missing Password', 'Enter your current password to confirm changes.');
      return;
    }

    setIsUpdatingCredentials(true);
    try {
      await onUpdateCredentials({
        currentPassword: currentPasswordInput,
        newPassword: newPasswordInput,
        newName: nameInput,
      });
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      Alert.alert(
        'Updated',
        newPasswordInput
          ? 'Your name and password were updated.'
          : 'Your name was updated.'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update credentials';
      Alert.alert('Update Failed', message === 'invalid_password' ? 'Your current password is incorrect.' : message);
    } finally {
      setIsUpdatingCredentials(false);
    }
  };

  const styles = createStyles(theme);
  const name =
    persona === 'ladybug'
      ? 'Ladybug'
      : persona === 'chatnoir'
        ? 'Chat Noir'
        : 'Assistant';

  return (
    <View style={[styles.overlay, !isOpen && styles.hidden]} pointerEvents={isOpen ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.backdropTouch} onPress={onClose} />
      </Animated.View>
      <Animated.View 
        style={[
          styles.sidebar, 
          { transform: [{ translateX: slideAnim }] }
        ]}
      >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{name}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'chats' && styles.tabActive]}
              onPress={() => setActiveTab('chats')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'chats' && styles.tabTextActive,
                ]}
              >
                Chats
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'settings' && styles.tabActive]}
              onPress={() => setActiveTab('settings')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'settings' && styles.tabTextActive,
                ]}
              >
                Settings
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content}>
            {activeTab === 'chats' ? (
              <>
                {/* New Chat Button */}
                <TouchableOpacity
                  style={styles.newChatButton}
                  onPress={() => {
                    onNewChat();
                    onClose();
                  }}
                >
                  <Ionicons name="add" size={20} color={theme.colors.text} />
                  <Text style={styles.newChatText}>New Chat</Text>
                </TouchableOpacity>

                {/* Chat List */}
                {chats.length === 0 ? (
                  <View style={styles.emptyChats}>
                    <Text style={styles.emptyChatsText}>
                      No conversations yet
                    </Text>
                  </View>
                ) : (
                  chats.map((chat) => (
                    <TouchableOpacity
                      key={chat.id}
                      style={[
                        styles.chatItem,
                        chat.id === currentChatId && styles.chatItemActive,
                      ]}
                      onPress={() => {
                        onSelectChat(chat.id);
                        onClose();
                      }}
                    >
                      <View style={styles.chatItemContent}>
                        <Text style={styles.chatItemTitle} numberOfLines={1}>
                          {chat.title}
                        </Text>
                        <Text style={styles.chatItemDate}>
                          {formatDate(chat.updatedAt)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => onDeleteChat(chat.id)}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color={theme.colors.textMuted}
                        />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))
                )}
              </>
            ) : (
              <View style={styles.settingsPanel}>
                {/* Temperature Setting */}
                <View style={styles.settingGroup}>
                  <Text style={styles.settingLabel}>
                    Temperature: {settings.temperature.toFixed(1)}
                  </Text>
                  <View style={styles.settingRow}>
                    <TouchableOpacity
                      style={styles.settingButton}
                      onPress={() =>
                        onUpdateSettings({
                          temperature: Math.max(0, settings.temperature - 0.1),
                        })
                      }
                    >
                      <Ionicons
                        name="remove"
                        size={20}
                        color={theme.colors.text}
                      />
                    </TouchableOpacity>
                    <View style={styles.settingValue}>
                      <Text style={styles.settingValueText}>
                        {settings.temperature.toFixed(1)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.settingButton}
                      onPress={() =>
                        onUpdateSettings({
                          temperature: Math.min(2, settings.temperature + 0.1),
                        })
                      }
                    >
                      <Ionicons
                        name="add"
                        size={20}
                        color={theme.colors.text}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Max Tokens Setting */}
                <View style={styles.settingGroup}>
                  <Text style={styles.settingLabel}>
                    Max Tokens: {settings.maxTokens}
                  </Text>
                  <View style={styles.settingRow}>
                    <TouchableOpacity
                      style={styles.settingButton}
                      onPress={() =>
                        onUpdateSettings({
                          maxTokens: Math.max(256, settings.maxTokens - 256),
                        })
                      }
                    >
                      <Ionicons
                        name="remove"
                        size={20}
                        color={theme.colors.text}
                      />
                    </TouchableOpacity>
                    <View style={styles.settingValue}>
                      <Text style={styles.settingValueText}>
                        {settings.maxTokens}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.settingButton}
                      onPress={() =>
                        onUpdateSettings({
                          maxTokens: Math.min(4096, settings.maxTokens + 256),
                        })
                      }
                    >
                      <Ionicons
                        name="add"
                        size={20}
                        color={theme.colors.text}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Divider */}
                <View style={styles.divider} />

                <View style={styles.settingGroup}>
                  <Text style={styles.sectionTitle}>Profile & Security</Text>

                  <Text style={styles.settingLabel}>Name</Text>
                  <TextInput
                    style={styles.textInput}
                    value={nameInput}
                    onChangeText={setNameInput}
                    placeholder="Your name"
                    placeholderTextColor={theme.colors.textMuted}
                    editable={!isUpdatingCredentials}
                  />

                  <Text style={styles.settingLabel}>Current Password</Text>
                  <TextInput
                    style={styles.textInput}
                    value={currentPasswordInput}
                    onChangeText={setCurrentPasswordInput}
                    placeholder="Enter current password"
                    placeholderTextColor={theme.colors.textMuted}
                    secureTextEntry
                    editable={!isUpdatingCredentials}
                  />

                  <Text style={styles.settingLabel}>New Password</Text>
                  <TextInput
                    style={styles.textInput}
                    value={newPasswordInput}
                    onChangeText={setNewPasswordInput}
                    placeholder="Enter new password"
                    placeholderTextColor={theme.colors.textMuted}
                    secureTextEntry
                    editable={!isUpdatingCredentials}
                  />

                  <TouchableOpacity
                    style={[styles.primaryActionButton, isUpdatingCredentials && styles.cleanupButtonDisabled]}
                    onPress={handleUpdateCredentialsPress}
                    disabled={isUpdatingCredentials}
                  >
                    {isUpdatingCredentials ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.primaryActionButtonText}>Save Profile Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.divider} />

                {/* Model Storage Section */}
                <View style={styles.settingGroup}>
                  <Text style={styles.sectionTitle}>Model Storage</Text>
                  
                  <View style={styles.storageInfo}>
                    <View style={styles.storageRow}>
                      <Text style={styles.storageLabel}>Current Model:</Text>
                      <Text style={styles.storageValue} numberOfLines={1}>
                        {getCurrentModelFilename()}
                      </Text>
                    </View>
                    
                    {storageInfo && (
                      <>
                        <View style={styles.storageRow}>
                          <Text style={styles.storageLabel}>Total Storage:</Text>
                          <Text style={styles.storageValue}>{storageInfo.total}</Text>
                        </View>
                        
                        {hasUnusedModels && (
                          <View style={styles.storageRow}>
                            <Text style={styles.storageLabel}>Unused Models:</Text>
                            <Text style={[styles.storageValue, styles.unusedText]}>
                              {storageInfo.unused}
                            </Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>

                  {hasUnusedModels && (
                    <TouchableOpacity
                      style={[
                        styles.cleanupButton,
                        isCleaningUp && styles.cleanupButtonDisabled,
                      ]}
                      onPress={handleCleanupModels}
                      disabled={isCleaningUp}
                    >
                      {isCleaningUp ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="trash-outline" size={18} color="#fff" />
                          <Text style={styles.cleanupButtonText}>
                            Clean Up Old Models
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {!hasUnusedModels && storageInfo && (
                    <View style={styles.noUnusedModels}>
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={theme.colors.success}
                      />
                      <Text style={styles.noUnusedModelsText}>
                        No unused models
                      </Text>
                    </View>
                  )}
                </View>
          </View>
        )}
          </ScrollView>
        </Animated.View>
      </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
    },
    hidden: {
      pointerEvents: 'none',
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    backdropTouch: {
      flex: 1,
    },
    sidebar: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: SIDEBAR_WIDTH,
      backgroundColor: theme.colors.backgroundSecondary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    closeButton: {
      padding: theme.spacing.xs,
    },
    tabs: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    tab: {
      flex: 1,
      paddingVertical: theme.spacing.sm,
      alignItems: 'center',
    },
    tabActive: {
      borderBottomWidth: 2,
      borderBottomColor: theme.colors.primary,
    },
    tabText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    tabTextActive: {
      color: theme.colors.primary,
      fontWeight: '600',
    },
    content: {
      flex: 1,
    },
    newChatButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.spacing.md,
      backgroundColor: theme.colors.primary,
      margin: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      gap: theme.spacing.sm,
    },
    newChatText: {
      color: '#fff',
      fontSize: theme.fontSize.base,
      fontWeight: '500',
    },
    emptyChats: {
      padding: theme.spacing.xl,
      alignItems: 'center',
    },
    emptyChatsText: {
      color: theme.colors.textMuted,
      fontSize: theme.fontSize.sm,
    },
    chatItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    chatItemActive: {
      backgroundColor: theme.colors.backgroundTertiary,
    },
    chatItemContent: {
      flex: 1,
    },
    chatItemTitle: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
      marginBottom: 2,
    },
    chatItemDate: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textMuted,
    },
    deleteButton: {
      padding: theme.spacing.xs,
    },
    settingsPanel: {
      padding: theme.spacing.md,
    },
    settingGroup: {
      marginBottom: theme.spacing.lg,
    },
    settingLabel: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    textInput: {
      backgroundColor: theme.colors.backgroundTertiary,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.sm,
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    settingButton: {
      backgroundColor: theme.colors.backgroundTertiary,
      padding: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
    },
    settingValue: {
      flex: 1,
      alignItems: 'center',
    },
    settingValueText: {
      fontSize: theme.fontSize.base,
      color: theme.colors.text,
    },
    divider: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginVertical: theme.spacing.md,
    },
    sectionTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: theme.spacing.md,
    },
    storageInfo: {
      backgroundColor: theme.colors.backgroundTertiary,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    storageRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing.xs,
    },
    storageLabel: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    storageValue: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
      fontWeight: '500',
      flexShrink: 1,
      marginLeft: theme.spacing.sm,
    },
    unusedText: {
      color: theme.colors.warning,
    },
    cleanupButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.error,
      padding: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
      gap: theme.spacing.xs,
    },
    cleanupButtonDisabled: {
      opacity: 0.6,
    },
    cleanupButtonText: {
      color: '#fff',
      fontSize: theme.fontSize.sm,
      fontWeight: '500',
    },
    primaryActionButton: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
      padding: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
      marginTop: theme.spacing.xs,
    },
    primaryActionButtonText: {
      color: '#fff',
      fontSize: theme.fontSize.sm,
      fontWeight: '500',
    },
    noUnusedModels: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.xs,
      padding: theme.spacing.sm,
    },
    noUnusedModelsText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.success,
    },
  });
