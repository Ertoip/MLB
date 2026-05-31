#!/usr/bin/env python3
"""
Generate embeddings for RAG chunks using sentence-transformers.

This script:
1. Loads raw RAG chunks from raw_rag/
2. Generates embeddings using all-MiniLM-L6-v2 (384 dimensions)
3. Outputs simplified JSON with just 'content' and 'vector' fields
4. Saves to rag_embeddings/ directory

Usage:
    pip install sentence-transformers
    python generate_embeddings.py
"""

import json
from pathlib import Path
from sentence_transformers import SentenceTransformer
import numpy as np

# Configuration
MODEL_NAME = "all-MiniLM-L6-v2"  # 384 dimensions, fast and good quality
INPUT_DIR = Path("raw_rag")
OUTPUT_DIR = Path("rag_embeddings")

def load_chunks(filepath: Path) -> list[dict]:
    """Load chunks from a RAG JSON file."""
    with open(filepath, 'r') as f:
        data = json.load(f)
    return data['chunks']

def generate_embeddings(chunks: list[dict], model: SentenceTransformer) -> list[dict]:
    """Generate embeddings for each chunk and return simplified format.
    
    The embedding is generated from a rich text combining:
    - category
    - topic
    - keywords
    - content
    
    But the output only stores the original content (for display) and the vector.
    """
    # Build rich text for embedding (includes all metadata for better semantic matching)
    texts_for_embedding = []
    for chunk in chunks:
        # Combine all relevant fields for a richer embedding
        parts = []
        
        if 'category' in chunk:
            parts.append(f"Category: {chunk['category']}")
        
        if 'topic' in chunk:
            parts.append(f"Topic: {chunk['topic']}")
        
        if 'keywords' in chunk and chunk['keywords']:
            keywords_str = ", ".join(chunk['keywords'])
            parts.append(f"Keywords: {keywords_str}")
        
        parts.append(chunk['content'])
        
        # Join all parts with newlines for the embedding
        rich_text = "\n".join(parts)
        texts_for_embedding.append(rich_text)
    
    print(f"  Generating embeddings for {len(texts_for_embedding)} chunks...")
    print(f"  (Using enriched text with category, topic, keywords + content)")
    
    # Generate embeddings in batch (much faster)
    embeddings = model.encode(texts_for_embedding, show_progress_bar=True, convert_to_numpy=True)
    
    # Create simplified output: just content + vector
    # (content is the original content only, but vector captures all metadata)
    output = []
    for chunk, embedding in zip(chunks, embeddings):
        output.append({
            "content": chunk['content'],  # Only store original content
            "vector": embedding.tolist()   # Vector is from enriched text
        })
    
    return output

def main():
    # Create output directory
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    # Load model
    print(f"Loading model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)
    print(f"Model loaded. Embedding dimension: {model.get_sentence_embedding_dimension()}")
    
    # Process each RAG file
    input_files = list(INPUT_DIR.glob("*_rag_chunks.json"))
    
    if not input_files:
        print(f"No RAG files found in {INPUT_DIR}/")
        return
    
    for input_file in input_files:
        print(f"\nProcessing: {input_file.name}")
        
        # Load chunks
        chunks = load_chunks(input_file)
        print(f"  Loaded {len(chunks)} chunks")
        
        # Generate embeddings
        embedded_chunks = generate_embeddings(chunks, model)
        
        # Create output filename (e.g., ladybug_rag_chunks.json -> ladybug_embeddings.json)
        character = input_file.stem.replace("_rag_chunks", "")
        output_file = OUTPUT_DIR / f"{character}_embeddings.json"
        
        # Save output
        output_data = {
            "model": MODEL_NAME,
            "dimension": model.get_sentence_embedding_dimension(),
            "total_chunks": len(embedded_chunks),
            "chunks": embedded_chunks
        }
        
        with open(output_file, 'w') as f:
            json.dump(output_data, f)
        
        # Calculate file size
        file_size = output_file.stat().st_size / 1024  # KB
        print(f"  Saved to: {output_file} ({file_size:.1f} KB)")
    
    print("\nDone!")
    print(f"Output files are in: {OUTPUT_DIR}/")

if __name__ == "__main__":
    main()
