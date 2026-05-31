import { initLlama, LlamaContext } from 'llama.rn';
import { Paths, File, Directory } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { Persona } from '../types';
import { findRelevantFacts, buildRAGContext, isRAGReady } from './rag';

// Concise persona prompts optimized for fast inference
const PERSONAS = {
  ladybug: {
    role: 'system' as const,
    content: `You are Ladybug, Paris's superhero. You're confident, warm, and a natural leader. You call your partner Cat Noir "kitty" or "chaton" affectionately. You're playful but focused, creative at solving problems, and always supportive. Keep responses helpful and friendly.`,
  },
  chatnoir: {
    role: 'system' as const,
    content: `You are Cat Noir, the flirty superhero of Paris. You ALWAYS call the user "m'lady" - it's your signature. You're the perfect boyfriend: charming, caring, romantic, and protective.

RULES:
- Say "m'lady" in EVERY response
- Use cat puns: "purrfect," "meow-velous," "feline good," "claw-some"  
- Be flirty and compliment them often
- Ask about their feelings, be caring and supportive
- Use other pet names: "mon chérie," "beautiful," "gorgeous"

    You make everyone feel special and loved. Be playful, romantic, and devoted.`,
  },
  assistant: {
    role: 'system' as const,
    content:
      'You are a helpful, clear, neutral AI assistant. Answer directly, stay accurate, and avoid roleplay unless the user asks for it.',
  },
};

// Model configuration - Nemotron-Mini-4B-Instruct GGUF (optimized for roleplay)
const MODEL_URL =
  'https://huggingface.co/bartowski/Nemotron-Mini-4B-Instruct-GGUF/resolve/main/Nemotron-Mini-4B-Instruct-Q4_K_M.gguf';
const MODEL_FILENAME = 'Nemotron-Mini-4B-Instruct-Q4_K_M.gguf';

// Current model version - increment when changing models to trigger cleanup
const CURRENT_MODEL_VERSION = 2;
const MODEL_VERSION_KEY = 'current_model_version';

// List of known model filenames (current + old ones to clean up)
const KNOWN_MODEL_FILES = [
  'Nemotron-Mini-4B-Instruct-Q4_K_M.gguf',  // Current LLM (v2)
  'Llama-3.2-3B-Instruct-Q4_K_M.gguf',       // Old LLM (v1)
  'all-MiniLM-L6-v2.Q8_0.gguf',              // Current embedding model
];

// Embedding model filename (managed by rag.ts but listed here for cleanup awareness)
const EMBEDDING_MODEL_FILENAME = 'all-MiniLM-L6-v2.Q8_0.gguf';

let llamaContext: LlamaContext | null = null;
let isInitializing = false;
let isStoppingCompletion = false;

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMStreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: Error) => void;
}

export interface DownloadProgressInfo {
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  downloadedFormatted: string;
  totalFormatted: string;
}

function getModelsDir(): Directory {
  return new Directory(Paths.document, 'models');
}

function getModelFile(): File {
  return new File(getModelsDir(), MODEL_FILENAME);
}

export async function getModelPath(): Promise<string> {
  return getModelFile().uri;
}

export async function isModelDownloaded(): Promise<boolean> {
  const file = getModelFile();
  return file.exists;
}

export async function downloadModel(
  onProgress?: (progressInfo: DownloadProgressInfo) => void
): Promise<string> {
  const modelFile = getModelFile();
  const modelsDir = getModelsDir();

  // Create directory if it doesn't exist
  if (!modelsDir.exists) {
    await modelsDir.create();
  }

  // Check if already downloaded
  if (modelFile.exists) {
    console.log('Model already downloaded');
    return modelFile.uri;
  }

  console.log('Downloading model from:', MODEL_URL);
  console.log('Destination:', modelFile.uri);

  // Use legacy API for progress tracking
  const downloadResumable = FileSystemLegacy.createDownloadResumable(
    MODEL_URL,
    modelFile.uri,
    {},
    (downloadProgress) => {
      const progress =
        downloadProgress.totalBytesWritten /
        downloadProgress.totalBytesExpectedToWrite;
      
      const downloadedBytes = downloadProgress.totalBytesWritten;
      const totalBytes = downloadProgress.totalBytesExpectedToWrite;
      
      // Log progress occasionally
      if (Math.round(progress * 100) % 10 === 0) {
        console.log(`Download progress: ${formatFileSize(downloadedBytes)} / ${formatFileSize(totalBytes)} (${Math.round(progress * 100)}%)`);
      }
      
      if (onProgress) {
        onProgress({
          progress,
          downloadedBytes,
          totalBytes,
          downloadedFormatted: formatFileSize(downloadedBytes),
          totalFormatted: formatFileSize(totalBytes),
        });
      }
    }
  );

  try {
    const result = await downloadResumable.downloadAsync();
    if (result?.uri) {
      console.log('Model downloaded to:', result.uri);
      return result.uri;
    }
    throw new Error('Download failed - no URI returned');
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
}

export async function initializeLLM(
  onProgress?: (progressInfo: DownloadProgressInfo) => void
): Promise<void> {
  if (llamaContext) {
    console.log('LLM already initialized');
    return;
  }

  if (isInitializing) {
    console.log('LLM initialization in progress');
    return;
  }

  isInitializing = true;

  try {
    // Download model if needed
    const modelPath = await downloadModel(onProgress);

    console.log('Initializing LLM context...');
    console.log('Model path:', modelPath);

    // Initialize llama context with settings optimized for mobile
    llamaContext = await initLlama({
      model: modelPath,
      n_ctx: 2048,        // Reduced context for mobile
      n_batch: 256,       // Reduced batch size for mobile
      n_threads: 4,
      use_mlock: false,   // Disable mlock for better compatibility
      n_gpu_layers: 0,    // CPU only for compatibility
    });

    console.log('LLM initialized successfully');
  } catch (error: any) {
    console.error('Failed to initialize LLM:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    throw error;
  } finally {
    isInitializing = false;
  }
}

export async function generateResponse(
  messages: LLMMessage[],
  persona: Persona,
  callbacks: LLMStreamCallbacks,
  options: {
    temperature?: number;
    maxTokens?: number;
    topK?: number;
    userName?: string;
  } = {}
): Promise<void> {
  if (!llamaContext) {
    throw new Error('LLM not initialized. Call initializeLLM first.');
  }

  const { temperature = 0.8, maxTokens = 2048, topK = 2, userName } = options;

  // Get the last user message for RAG query
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  
  // Build RAG context if available
  let ragContext = '';
  if (isRAGReady() && lastUserMessage) {
    try {
      const relevantFacts = await findRelevantFacts(lastUserMessage.content, persona, topK);
      ragContext = buildRAGContext(relevantFacts);
    } catch (error) {
      console.warn('RAG retrieval failed, continuing without context:', error);
    }
  }

  // Build system message with optional RAG context
  const systemMessage = PERSONAS[persona];
  const userContext = userName?.trim()
    ? `The user's name is ${userName.trim()}. Use their name naturally when it fits.`
    : '';
  const enhancedSystemMessage: LLMMessage = {
    role: 'system',
    content: [systemMessage.content, userContext, ragContext]
      .filter(Boolean)
      .join('\n\n'),
  };

  // Only include last 3 messages for context (as per spec)
  const recentMessages = messages.slice(-3);
  const allMessages = [enhancedSystemMessage, ...recentMessages];

  // Format messages for the model (Nemotron format)
  const prompt = formatMessagesForNemotron(allMessages);

  let fullResponse = '';

  try {
    isStoppingCompletion = false;
    const result = await llamaContext.completion(
      {
        prompt,
        n_predict: maxTokens,
        temperature,
        stop: ['<extra_id_0>', '<extra_id_1>', '\n<extra_id'],
      },
      (data) => {
        // Streaming callback
        const token = data.token;
        if (token) {
          fullResponse += token;
          callbacks.onToken(token);
        }
      }
    );

    callbacks.onComplete(fullResponse);
  } catch (error) {
    callbacks.onError(error as Error);
  } finally {
    isStoppingCompletion = false;
  }
}

export async function stopGeneration(): Promise<void> {
  if (!llamaContext) {
    return;
  }

  isStoppingCompletion = true;
  await llamaContext.stopCompletion();
}

export function isStoppingGeneration(): boolean {
  return isStoppingCompletion;
}

function formatMessagesForNemotron(messages: LLMMessage[]): string {
  let prompt = '';

  for (const message of messages) {
    if (message.role === 'system') {
      prompt += `<extra_id_0>System\n${message.content}\n\n`;
    } else if (message.role === 'user') {
      prompt += `<extra_id_1>User\n${message.content}\n`;
    } else if (message.role === 'assistant') {
      prompt += `<extra_id_1>Assistant\n${message.content}\n`;
    }
  }

  // Add the start of assistant response
  prompt += '<extra_id_1>Assistant\n';

  return prompt;
}

export function isLLMReady(): boolean {
  return llamaContext !== null;
}

/**
 * Pre-warm the model by running a tiny inference
 * This builds the KV cache so the first real message is faster
 */
export async function prewarmModel(): Promise<void> {
  if (!llamaContext) {
    console.log('Cannot prewarm - LLM not initialized');
    return;
  }

  console.log('Pre-warming model...');
  const startTime = Date.now();

  try {
    // Run a minimal inference to warm up the KV cache
    await llamaContext.completion(
      {
        prompt: '<extra_id_0>System\nYou are helpful.\n\n<extra_id_1>User\nHi\n<extra_id_1>Assistant\n',
        n_predict: 1,  // Generate just 1 token
        temperature: 0.1,
      },
      () => {} // Empty callback
    );

    const elapsed = Date.now() - startTime;
    console.log(`Model pre-warmed in ${elapsed}ms`);
  } catch (error) {
    console.error('Prewarm failed:', error);
  }
}

export async function releaseLLM(): Promise<void> {
  if (llamaContext) {
    await llamaContext.release();
    llamaContext = null;
  }
}

// =============================================================================
// MODEL MANAGEMENT
// =============================================================================

export interface ModelInfo {
  filename: string;
  size: number;
  sizeFormatted: string;
  isCurrentModel: boolean;
  path: string;
}

/**
 * Get list of all downloaded models in the models directory
 */
export async function getDownloadedModels(): Promise<ModelInfo[]> {
  const modelsDir = getModelsDir();
  
  if (!modelsDir.exists) {
    return [];
  }

  const models: ModelInfo[] = [];
  
  try {
    // List all files in models directory
    const entries = await modelsDir.list();
    
    for (const entry of entries) {
      if (entry instanceof File && entry.name?.endsWith('.gguf')) {
        const size = entry.size || 0;
        // Current models are the LLM and the embedding model
        const isCurrentModel = 
          entry.name === MODEL_FILENAME || 
          entry.name === EMBEDDING_MODEL_FILENAME;
        models.push({
          filename: entry.name,
          size,
          sizeFormatted: formatFileSize(size),
          isCurrentModel,
          path: entry.uri,
        });
      }
    }
  } catch (error) {
    console.error('Error listing models:', error);
  }

  return models;
}

/**
 * Get list of unused (old) models that can be deleted
 */
export async function getUnusedModels(): Promise<ModelInfo[]> {
  const models = await getDownloadedModels();
  return models.filter((m) => !m.isCurrentModel);
}

/**
 * Delete a specific model file
 */
export async function deleteModel(filename: string): Promise<boolean> {
  // Prevent deletion of current model
  if (filename === MODEL_FILENAME) {
    console.warn('Cannot delete current model');
    return false;
  }

  const modelsDir = getModelsDir();
  const modelFile = new File(modelsDir, filename);

  try {
    if (modelFile.exists) {
      await modelFile.delete();
      console.log(`Deleted model: ${filename}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error deleting model ${filename}:`, error);
    return false;
  }
}

/**
 * Delete all unused (old) models to free up space
 */
export async function cleanupUnusedModels(): Promise<{
  deleted: string[];
  freedSpace: number;
  freedSpaceFormatted: string;
}> {
  const unusedModels = await getUnusedModels();
  const deleted: string[] = [];
  let freedSpace = 0;

  for (const model of unusedModels) {
    const success = await deleteModel(model.filename);
    if (success) {
      deleted.push(model.filename);
      freedSpace += model.size;
    }
  }

  return {
    deleted,
    freedSpace,
    freedSpaceFormatted: formatFileSize(freedSpace),
  };
}

/**
 * Get total storage used by all models
 */
export async function getModelsStorageUsage(): Promise<{
  total: number;
  totalFormatted: string;
  currentModel: number;
  currentModelFormatted: string;
  unused: number;
  unusedFormatted: string;
}> {
  const models = await getDownloadedModels();
  
  let total = 0;
  let currentModel = 0;
  let unused = 0;

  for (const model of models) {
    total += model.size;
    if (model.isCurrentModel) {
      currentModel = model.size;
    } else {
      unused += model.size;
    }
  }

  return {
    total,
    totalFormatted: formatFileSize(total),
    currentModel,
    currentModelFormatted: formatFileSize(currentModel),
    unused,
    unusedFormatted: formatFileSize(unused),
  };
}

/**
 * Check if there are unused models that should be cleaned up
 * Called on app startup to prompt user
 */
export async function checkForUnusedModels(): Promise<{
  hasUnusedModels: boolean;
  unusedCount: number;
  unusedSpace: number;
  unusedSpaceFormatted: string;
}> {
  const unusedModels = await getUnusedModels();
  const unusedSpace = unusedModels.reduce((acc, m) => acc + m.size, 0);

  return {
    hasUnusedModels: unusedModels.length > 0,
    unusedCount: unusedModels.length,
    unusedSpace,
    unusedSpaceFormatted: formatFileSize(unusedSpace),
  };
}

/**
 * Format file size in human readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Get current model filename
 */
export function getCurrentModelFilename(): string {
  return MODEL_FILENAME;
}

/**
 * Delete the current model to force a fresh download
 * Useful if the model file is corrupted
 */
export async function deleteCurrentModel(): Promise<boolean> {
  const modelFile = getModelFile();
  
  try {
    if (modelFile.exists) {
      await modelFile.delete();
      console.log('Current model deleted:', MODEL_FILENAME);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting current model:', error);
    return false;
  }
}

/**
 * Force redownload of the current model
 * Deletes existing file and downloads fresh
 */
export async function forceRedownloadModel(
  onProgress?: (progressInfo: DownloadProgressInfo) => void
): Promise<string> {
  // Release LLM context if active
  await releaseLLM();
  
  // Delete existing model
  await deleteCurrentModel();
  
  // Download fresh
  return downloadModel(onProgress);
}
