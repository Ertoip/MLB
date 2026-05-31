import { initLlama, LlamaContext } from 'llama.rn';
import { Paths, File, Directory } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { Persona } from '../types';

// Import pre-computed embeddings
import ladybugEmbeddings from '../data/ladybug_embeddings.json';
import catNoirEmbeddings from '../data/cat_noir_embeddings.json';

// Embedding model configuration
const EMBEDDING_MODEL_URL =
  'https://huggingface.co/leliuga/all-MiniLM-L6-v2-GGUF/resolve/main/all-MiniLM-L6-v2.Q8_0.gguf';
const EMBEDDING_MODEL_FILENAME = 'all-MiniLM-L6-v2.Q8_0.gguf';
const EMBEDDING_DIMENSION = 384;

// RAG configuration
const DEFAULT_TOP_K = 2;

// Types
interface EmbeddingChunk {
  content: string;
  vector: number[];
}

interface EmbeddingsData {
  model: string;
  dimension: number;
  total_chunks: number;
  chunks: EmbeddingChunk[];
}

export interface RAGResult {
  content: string;
  score: number;
}

export interface DownloadProgressInfo {
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  downloadedFormatted: string;
  totalFormatted: string;
}

// Singleton state
let embeddingContext: LlamaContext | null = null;
let isInitializing = false;

// Pre-loaded embeddings by persona
const embeddingsCache: Record<Persona, EmbeddingChunk[]> = {
  ladybug: (ladybugEmbeddings as EmbeddingsData).chunks,
  chatnoir: (catNoirEmbeddings as EmbeddingsData).chunks,
  assistant: [],
};

// =============================================================================
// FILE SYSTEM HELPERS
// =============================================================================

function getModelsDir(): Directory {
  return new Directory(Paths.document, 'models');
}

function getEmbeddingModelFile(): File {
  return new File(getModelsDir(), EMBEDDING_MODEL_FILENAME);
}

export async function isEmbeddingModelDownloaded(): Promise<boolean> {
  const file = getEmbeddingModelFile();
  return file.exists;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

// =============================================================================
// DOWNLOAD & INITIALIZATION
// =============================================================================

export async function downloadEmbeddingModel(
  onProgress?: (progressInfo: DownloadProgressInfo) => void
): Promise<string> {
  const modelFile = getEmbeddingModelFile();
  const modelsDir = getModelsDir();

  // Create directory if needed
  if (!modelsDir.exists) {
    await modelsDir.create();
  }

  // Check if already downloaded
  if (modelFile.exists) {
    console.log('Embedding model already downloaded');
    return modelFile.uri;
  }

  console.log('Downloading embedding model from:', EMBEDDING_MODEL_URL);
  console.log('Destination:', modelFile.uri);

  // Use legacy API for progress tracking
  const downloadResumable = FileSystemLegacy.createDownloadResumable(
    EMBEDDING_MODEL_URL,
    modelFile.uri,
    {},
    (downloadProgress) => {
      const progress =
        downloadProgress.totalBytesWritten /
        downloadProgress.totalBytesExpectedToWrite;

      const downloadedBytes = downloadProgress.totalBytesWritten;
      const totalBytes = downloadProgress.totalBytesExpectedToWrite;

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
      console.log('Embedding model downloaded to:', result.uri);
      return result.uri;
    }
    throw new Error('Download failed - no URI returned');
  } catch (error) {
    console.error('Embedding model download error:', error);
    throw error;
  }
}

export async function initializeRAG(
  onProgress?: (progressInfo: DownloadProgressInfo) => void
): Promise<void> {
  if (embeddingContext) {
    console.log('RAG already initialized');
    return;
  }

  if (isInitializing) {
    console.log('RAG initialization in progress');
    return;
  }

  isInitializing = true;

  try {
    // Download embedding model if needed
    const modelPath = await downloadEmbeddingModel(onProgress);

    console.log('Initializing embedding context...');

    // Initialize llama context with embedding mode
    embeddingContext = await initLlama({
      model: modelPath,
      embedding: true,  // Enable embedding mode
      n_ctx: 512,       // Small context for embeddings
      n_batch: 512,
      n_threads: 4,
      use_mlock: false,
      n_gpu_layers: 0,
    });

    console.log('RAG embedding context initialized successfully');
  } catch (error: any) {
    console.error('Failed to initialize RAG:', error);
    throw error;
  } finally {
    isInitializing = false;
  }
}

/**
 * Pre-warm the embedding model by running a tiny embedding
 */
export async function prewarmEmbeddingModel(): Promise<void> {
  if (!embeddingContext) {
    console.log('Cannot prewarm - embedding model not initialized');
    return;
  }

  console.log('Pre-warming embedding model...');
  const startTime = Date.now();

  try {
    await embeddingContext.embedding('warmup');
    const elapsed = Date.now() - startTime;
    console.log(`Embedding model pre-warmed in ${elapsed}ms`);
  } catch (error) {
    console.error('Embedding prewarm failed:', error);
  }
}

export async function releaseRAG(): Promise<void> {
  if (embeddingContext) {
    await embeddingContext.release();
    embeddingContext = null;
  }
}

export function isRAGReady(): boolean {
  return embeddingContext !== null;
}

// =============================================================================
// EMBEDDING & SIMILARITY
// =============================================================================

/**
 * Generate embedding for a query text
 */
async function embedQuery(query: string): Promise<number[]> {
  if (!embeddingContext) {
    throw new Error('Embedding context not initialized');
  }

  const result = await embeddingContext.embedding(query);
  return result.embedding;
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

// =============================================================================
// RAG RETRIEVAL
// =============================================================================

/**
 * Find the top-k most relevant facts for a given query
 * 
 * @param query - The user's query to embed and search
 * @param persona - Which character's knowledge base to search
 * @param topK - Number of results to return (default: 2)
 * @returns Array of relevant content with similarity scores
 */
export async function findRelevantFacts(
  query: string,
  persona: Persona,
  topK: number = DEFAULT_TOP_K
): Promise<RAGResult[]> {
  if (persona === 'assistant') {
    return [];
  }

  if (!embeddingContext) {
    console.warn('RAG not initialized, skipping retrieval');
    return [];
  }

  const startTime = Date.now();

  try {
    // 1. Embed the query
    const queryVector = await embedQuery(query);

    // 2. Get embeddings for the persona
    const chunks = embeddingsCache[persona];
    if (!chunks || chunks.length === 0) {
      console.warn(`No embeddings found for persona: ${persona}`);
      return [];
    }

    // 3. Calculate similarity scores
    const scored = chunks.map((chunk) => ({
      content: chunk.content,
      score: cosineSimilarity(queryVector, chunk.vector),
    }));

    // 4. Sort by score and take top-k
    scored.sort((a, b) => b.score - a.score);
    const topResults = scored.slice(0, topK);

    const elapsed = Date.now() - startTime;
    console.log(
      `RAG retrieval: found ${topResults.length} facts in ${elapsed}ms ` +
      `(scores: ${topResults.map((r) => r.score.toFixed(3)).join(', ')})`
    );

    return topResults;
  } catch (error) {
    console.error('RAG retrieval error:', error);
    return [];
  }
}

/**
 * Build context string from RAG results for injection into prompt
 */
export function buildRAGContext(results: RAGResult[]): string {
  if (results.length === 0) return '';

  const facts = results.map((r) => `- ${r.content}`).join('\n');
  return `Relevant facts about you:\n${facts}`;
}

// =============================================================================
// STORAGE MANAGEMENT
// =============================================================================

export async function getEmbeddingModelInfo(): Promise<{
  exists: boolean;
  size: number;
  sizeFormatted: string;
  filename: string;
} | null> {
  const modelFile = getEmbeddingModelFile();

  if (!modelFile.exists) {
    return null;
  }

  const size = modelFile.size || 0;
  return {
    exists: true,
    size,
    sizeFormatted: formatFileSize(size),
    filename: EMBEDDING_MODEL_FILENAME,
  };
}

export async function deleteEmbeddingModel(): Promise<boolean> {
  const modelFile = getEmbeddingModelFile();

  try {
    if (modelFile.exists) {
      // Release context first
      await releaseRAG();
      await modelFile.delete();
      console.log('Embedding model deleted');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting embedding model:', error);
    return false;
  }
}

export function getEmbeddingModelFilename(): string {
  return EMBEDDING_MODEL_FILENAME;
}
