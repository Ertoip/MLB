import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Paths, File, Directory } from 'expo-file-system';
import { Chat } from '../types';

const SALT_KEY = 'miraculous_salt';
const CHATS_FILE = 'chats.enc';
const USER_NAME_KEY = 'user_name';

// Generate a random salt
async function generateSalt(): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Get or create salt
async function getOrCreateSalt(): Promise<string> {
  let salt = await SecureStore.getItemAsync(SALT_KEY);
  if (!salt) {
    salt = await generateSalt();
    await SecureStore.setItemAsync(SALT_KEY, salt);
  }
  return salt;
}

// Derive a key from password using PBKDF2-like approach
async function deriveKey(password: string): Promise<string> {
  const salt = await getOrCreateSalt();
  // Use SHA-256 hash of password + salt as the key
  const combined = password + salt;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    combined
  );
  return hash;
}

// Simple XOR encryption (for demo - in production use proper encryption library)
function xorEncrypt(data: string, key: string): string {
  let result = '';
  for (let i = 0; i < data.length; i++) {
    const charCode = data.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  // Convert to base64 for safe storage
  return btoa(result);
}

function xorDecrypt(encryptedData: string, key: string): string {
  // Decode from base64
  const data = atob(encryptedData);
  let result = '';
  for (let i = 0; i < data.length; i++) {
    const charCode = data.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return result;
}

// Get chats file
function getChatsFile(): File {
  return new File(Paths.document, CHATS_FILE);
}

// Check if account exists
export async function accountExists(): Promise<boolean> {
  const file = getChatsFile();
  return file.exists;
}

// Serialize chats for storage
function serializeChats(chats: Chat[]): string {
  return JSON.stringify(
    chats.map((chat) => ({
      ...chat,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
      messages: chat.messages.map((msg) => ({
        ...msg,
        timestamp: msg.timestamp.toISOString(),
      })),
    }))
  );
}

// Deserialize chats from storage
function deserializeChats(data: string): Chat[] {
  const parsed = JSON.parse(data);
  return parsed.map((chat: any) => ({
    ...chat,
    createdAt: new Date(chat.createdAt),
    updatedAt: new Date(chat.updatedAt),
    persona: chat.persona || 'ladybug',
    messages: chat.messages.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    })),
  }));
}

// Save chats to encrypted file
export async function saveChats(chats: Chat[], password: string): Promise<boolean> {
  try {
    const key = await deriveKey(password);
    const serialized = serializeChats(chats);
    const encrypted = xorEncrypt(serialized, key);
    
    const file = getChatsFile();
    await file.write(encrypted);
    
    return true;
  } catch (error) {
    console.error('Error saving chats:', error);
    return false;
  }
}

// Load chats from encrypted file
export async function loadChats(
  password: string
): Promise<{ chats: Chat[] | null; error: string | null }> {
  try {
    const file = getChatsFile();
    
    if (!file.exists) {
      // No existing chats - new account
      return { chats: [], error: null };
    }

    const encrypted = await file.text();
    const key = await deriveKey(password);
    
    try {
      const decrypted = xorDecrypt(encrypted, key);
      const chats = deserializeChats(decrypted);
      return { chats, error: null };
    } catch {
      return { chats: null, error: 'invalid_password' };
    }
  } catch (error) {
    console.error('Error loading chats:', error);
    return { chats: null, error: String(error) };
  }
}

// Delete a specific chat
export async function deleteChat(
  chatId: string,
  password: string
): Promise<{ success: boolean; error: string | null }> {
  const { chats, error } = await loadChats(password);
  
  if (error) {
    return { success: false, error };
  }
  
  if (!chats) {
    return { success: false, error: 'No chats found' };
  }
  
  const filteredChats = chats.filter((c) => c.id !== chatId);
  const success = await saveChats(filteredChats, password);
  
  return { success, error: success ? null : 'Failed to save' };
}

// Store password in secure store for session (optional)
export async function storeSessionPassword(password: string): Promise<void> {
  await SecureStore.setItemAsync('session_password', password);
}

export async function getSessionPassword(): Promise<string | null> {
  return await SecureStore.getItemAsync('session_password');
}

export async function clearSessionPassword(): Promise<void> {
  await SecureStore.deleteItemAsync('session_password');
}

export async function getStoredUserName(): Promise<string | null> {
  return SecureStore.getItemAsync(USER_NAME_KEY);
}

export async function setStoredUserName(name: string): Promise<void> {
  await SecureStore.setItemAsync(USER_NAME_KEY, name.trim());
}

export async function updateCredentials(
  currentPassword: string | null,
  nextPassword: string | null,
  nextName: string
): Promise<{ success: boolean; error: string | null }> {
  const trimmedName = nextName.trim();

  if (!trimmedName) {
    return { success: false, error: 'Name is required' };
  }

  await setStoredUserName(trimmedName);

  if (nextPassword) {
    if (!currentPassword) {
      return { success: false, error: 'Current password is required' };
    }

    const { chats, error } = await loadChats(currentPassword);
    if (error || !chats) {
      return { success: false, error: error || 'Failed to load chats' };
    }

    const saveSuccess = await saveChats(chats, nextPassword);
    if (!saveSuccess) {
      return { success: false, error: 'Failed to re-encrypt chats' };
    }

    await storeSessionPassword(nextPassword);
  }

  return { success: true, error: null };
}
