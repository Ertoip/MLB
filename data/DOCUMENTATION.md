# Miraculous Ladybug Data Pipeline Documentation

## Complete Technical Documentation for Transcript Scraping and LLM Fine-Tuning Data Preparation

**Version**: 1.0.0  
**Last Updated**: March 2026  
**Author**: MLB Data Pipeline  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [File Structure](#3-file-structure)
4. [Script 1: scrape_miraculous.py](#4-script-1-scrape_miraculouspy)
5. [Script 2: preprocess.py](#5-script-2-preprocesspy)
6. [Script 3: train_qlora.py](#6-script-3-train_qlorapy)
7. [Data Flow](#7-data-flow)
8. [Configuration](#8-configuration)
9. [Usage Guide](#9-usage-guide)
10. [Output Formats](#10-output-formats)
11. [API Reference](#11-api-reference)
12. [Troubleshooting](#12-troubleshooting)
13. [Cost Estimation](#13-cost-estimation)

---

## 1. Overview

This pipeline collects and processes conversational data from Miraculous Ladybug episode transcripts for fine-tuning Large Language Models (LLMs). The goal is to create high-quality training data that captures the unique speaking styles of four characters:

| Character | Description | Training Goal |
|-----------|-------------|---------------|
| **Marinette** | Clumsy, creative teenage girl | Capture stuttering, nervousness around crush, loyalty |
| **Ladybug** | Confident superhero | Capture leadership, quick-thinking, catchphrases |
| **Adrien** | Kind, sheltered model | Capture politeness, naivety, genuine kindness |
| **Cat Noir** | Flirty, pun-loving hero | Capture cat puns, flirtation, "m'lady" usage |

### Pipeline Stages

```
Stage 1: SCRAPING          Stage 2: PREPROCESSING         Stage 3: TRAINING
┌─────────────────┐        ┌─────────────────────┐        ┌────────────────┐
│ Fandom Wiki     │───────▶│ Rule-based Cleaning │───────▶│ QLoRA Training │
│ Transcripts     │        │ Claude Enhancement  │        │ Llama-3.2-3B   │
│ (188 episodes)  │        │ Data Splitting      │        │ (4 LoRAs)      │
└─────────────────┘        └─────────────────────┘        └────────────────┘
```

---

## 2. Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        DATA COLLECTION LAYER                              │
├──────────────────────────────────────────────────────────────────────────┤
│  scrape_miraculous.py                                                     │
│  ├── MediaWiki API Client (fetches transcript list)                       │
│  ├── HTML Parser (BeautifulSoup + lxml)                                   │
│  ├── Dialogue Extractor (regex patterns)                                  │
│  └── Scene Detector (extracts scene descriptions)                         │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        RAW DATA STORAGE                                   │
├──────────────────────────────────────────────────────────────────────────┤
│  output/                                                                  │
│  ├── marinette_conversations.json                                         │
│  ├── ladybug_conversations.json                                           │
│  ├── adrien_conversations.json                                            │
│  └── cat_noir_conversations.json                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        PREPROCESSING LAYER                                │
├──────────────────────────────────────────────────────────────────────────┤
│  preprocess.py                                                            │
│  ├── Rule-based Cleaner (removes visual directions, keeps emotional)      │
│  ├── Claude API Client (naturalizes dialogue)                             │
│  ├── System Prompt Generator (character personality prompts)              │
│  ├── Progress Tracker (resumability)                                      │
│  └── Data Splitter (85/10/5 train/val/test)                              │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        TRAINING DATA STORAGE                              │
├──────────────────────────────────────────────────────────────────────────┤
│  training/                                                                │
│  ├── marinette_train.jsonl  │  ladybug_train.jsonl                        │
│  ├── marinette_val.jsonl    │  ladybug_val.jsonl                          │
│  ├── marinette_test.jsonl   │  ladybug_test.jsonl                         │
│  ├── adrien_train.jsonl     │  cat_noir_train.jsonl                       │
│  ├── adrien_val.jsonl       │  cat_noir_val.jsonl                         │
│  ├── adrien_test.jsonl      │  cat_noir_test.jsonl                        │
│  └── system_prompts.json                                                  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. File Structure

```
/home/brontolo/Desktop/MLB/data/
│
├── .env                          # API keys (create from .env.example)
├── .env.example                  # Template for environment variables
│
├── scrape_miraculous.py          # Stage 1: Web scraping script
├── preprocess.py                 # Stage 2: Preprocessing script
├── train_qlora.py                # Stage 3: QLoRA training script
├── explore_ladybug.ipynb         # Jupyter notebook for data exploration
├── DOCUMENTATION.md              # This documentation file
│
├── venv/                         # Python virtual environment
│   └── ...
│
├── output/                       # Raw scraped data (Stage 1 output)
│   ├── marinette_conversations.json
│   ├── ladybug_conversations.json
│   ├── adrien_conversations.json
│   ├── cat_noir_conversations.json
│   └── summary.json
│
├── training/                     # Processed training data (Stage 2 output)
│   ├── marinette_train.jsonl
│   ├── marinette_val.jsonl
│   ├── marinette_test.jsonl
│   ├── ladybug_train.jsonl
│   ├── ladybug_val.jsonl
│   ├── ladybug_test.jsonl
│   ├── adrien_train.jsonl
│   ├── adrien_val.jsonl
│   ├── adrien_test.jsonl
│   ├── cat_noir_train.jsonl
│   ├── cat_noir_val.jsonl
│   ├── cat_noir_test.jsonl
│   └── system_prompts.json
│
├── adapters/                     # Trained LoRA adapters (Stage 3 output)
│   ├── marinette/
│   ├── ladybug/
│   ├── adrien/
│   └── cat_noir/
│
└── .progress/                    # Progress tracking for resumability
    ├── marinette_progress.json
    ├── marinette_enhanced_cache.json
    ├── ladybug_progress.json
    ├── ladybug_enhanced_cache.json
    └── ...
```

---

## 4. Script 1: scrape_miraculous.py

### Purpose
Scrapes episode transcripts from the Miraculous Ladybug Fandom Wiki and extracts back-and-forth conversations for each of the four target characters.

### Dependencies
```python
requests          # HTTP requests
beautifulsoup4    # HTML parsing
lxml              # Fast HTML parser backend
```

### Key Components

#### 4.1 Character Classes

```python
CHARACTER_CLASSES = {
    "marinette": {
        "canonical": "Marinette",
        "aliases": ["marinette", "marinette dupain-cheng", "mari", "marinete"]
    },
    "ladybug": {
        "canonical": "Ladybug",
        "aliases": ["ladybug", "lady bug", "multimouse", "cosmobug", ...]
    },
    "adrien": {
        "canonical": "Adrien",
        "aliases": ["adrien", "adrien agreste"]
    },
    "cat_noir": {
        "canonical": "Cat Noir",
        "aliases": ["cat noir", "chat noir", "mister bug", "aspik", ...]
    }
}
```

**Purpose**: Maps various name spellings and alternate identities to a canonical character class.

#### 4.2 MiraculousScraper Class

**`get_transcript_pages() -> list[dict]`**
- Uses MediaWiki API to fetch all pages in "Category:Episode_transcripts"
- Returns list of `{pageid, title, episode}` dictionaries
- Handles pagination with `cmcontinue` token

**`fetch_transcript(page_title: str) -> str | None`**
- Fetches HTML content via MediaWiki Parse API
- More reliable than direct page access (avoids 403 errors)
- Returns raw HTML string

**`parse_transcript(html: str) -> list[DialogueLine]`**
- Parses HTML using BeautifulSoup
- Extracts dialogue from `<div class="poem">` containers
- Extracts scene descriptions from `<i>Scene: ...</i>` markers
- Returns list of `DialogueLine` objects with character, text, and metadata

**`extract_back_and_forth(all_lines, episode) -> list[Conversation]`**
- Finds true back-and-forth conversations (exactly 2 characters alternating)
- Only saves conversations where the target character speaks first
- Includes scene context and one previous line for context
- Minimum 2 turns required

#### 4.3 Data Classes

```python
@dataclass
class DialogueLine:
    character: str           # Speaker name
    text: str                # Dialogue text
    character_class: str     # marinette, ladybug, adrien, cat_noir, or None
    is_scene: bool           # True if this is a scene description
    line_index: int          # Position in transcript

@dataclass
class Conversation:
    id: str                  # Unique ID: episode_character_0001
    scene: str               # Scene description
    conversation: str        # Full conversation text with context
```

#### 4.4 Extraction Rules

**What Gets Extracted**:
- Back-and-forth between exactly 2 characters
- Target character must speak first
- Minimum 2 turns (one exchange)
- Includes one previous line for context
- Includes current scene description

**What Gets Filtered Out**:
- Multi-party conversations (3+ speakers)
- Conversations where target character doesn't speak first
- Scene markers, sequence markers, theme songs
- Single-line statements

### Usage

```bash
# Activate virtual environment
source venv/bin/activate

# Full scrape (all 188 episodes)
python scrape_miraculous.py

# Test with limited episodes
python scrape_miraculous.py --limit 5

# Custom output directory
python scrape_miraculous.py --output /path/to/output
```

### Output Format

**JSON** (`output/{character}_conversations.json`):
```json
[
  {
    "id": "stormy_weather_ladybug_0001",
    "scene": "Exterior, Le Grand Paris rooftop.",
    "conversation": "Cat Noir: Meow, m'lady!\nLadybug: Perfect timing, kitty cat.\nCat Noir: What's the situation?"
  }
]
```

---

## 5. Script 2: preprocess.py

### Purpose
Processes raw scraped data into training-ready format:
1. Cleans dialogue (removes visual directions, keeps emotional cues)
2. Uses Claude API to naturalize dialogue
3. Generates personality-focused system prompts
4. Splits data into train/val/test sets

### Dependencies
```python
anthropic         # Claude API client
python-dotenv     # Environment variable loading
tqdm              # Progress bars
```

### Key Components

#### 5.1 Cleaning Patterns

**EMOTIONAL_ROOTS** (word roots to identify emotional content):

The script uses a simple, maintainable approach: instead of complex regex patterns,
it checks if parenthetical content contains any emotional keyword **root**.

Using roots means "laugh" will match "laughs", "laughing", "laughed", etc.

```python
EMOTIONAL_ROOTS = [
    # Vocal expressions
    'laugh', 'chuckle', 'giggle', 'sigh', 'gasp', 'groan',
    'scream', 'yell', 'shout', 'whisper', 'mumble', 'stutter',
    'cry', 'sob', 'weep',
    
    # Emotional states  
    'nervous', 'anxious', 'excite', 'happy', 'sad', 'angry',
    'surpris', 'shock', 'confus', 'embarrass', 'proud',
    
    # Manner of speaking
    'sarcastic', 'playful', 'flirt', 'gentle', 'firm', 'hesitant',
    
    # Facial expressions
    'smil', 'grin', 'frown', 'blush', 'wink',
    
    # Physical gestures (emotional)
    'nod', 'shrug', 'hug', 'kiss', 'tremble',
    
    # Mental/emotional actions
    'realize', 'remember', 'hesitate', 'pause',
    
    # ... ~80 roots total covering all emotional expressions
]
```

**How it works:**

1. Find all parenthetical expressions `(...)`
2. Check if the content contains ANY emotional root
3. Keep if emotional, remove if not

```python
# Example:
"(camera pans to door)"  -> "camera pans to door" contains no roots -> REMOVE
"(laughs nervously)"     -> "laughs nervously" contains "laugh"     -> KEEP
"(walks away sighing)"   -> "walks away sighing" contains "sigh"    -> KEEP
```

#### 5.2 Cleaning Functions

**`clean_html_entities(text: str) -> str`**
- Replaces HTML entities: `&amp;` → `&`, `&lt;` → `<`, etc.

**`contains_emotional_root(text: str) -> bool`**
- Checks if text contains any word root from EMOTIONAL_ROOTS
- Simple substring matching (case-insensitive)

**`clean_stage_directions(text: str) -> str`**
- Main cleaning function
- Finds all `(...)` parentheticals
- Keeps only those containing emotional roots
- Removes all others (camera, movement, visual directions)

**`extract_character_response(conversation, character) -> tuple`**
- Parses multi-line conversation string
- Returns `(context_line, user_message, assistant_response)`
- Handles character name variations

**`clean_conversation(raw, character) -> CleanedConversation | None`**
- Full cleaning pipeline
- Returns None if conversation is invalid (too short, missing parts)

#### 5.3 Claude API Integration

**ClaudeClient Class**

```python
class ClaudeClient:
    def __init__(self, api_key, model, rpm):
        """Initialize with rate limiting."""
        
    def naturalize_dialogue(self, cleaned: CleanedConversation) -> str:
        """
        Use Claude to make dialogue more natural.
        
        Prompt structure:
        - System: Instructions to preserve character voice
        - User: Scene context + original dialogue
        - Output: Rewritten, more natural response
        """
        
    def generate_system_prompt(self, character, samples) -> str:
        """
        Generate personality-focused system prompt.
        
        Analyzes 10 sample conversations to understand:
        - Speech patterns and quirks
        - Emotional tendencies
        - Catchphrases and verbal habits
        """
```

**API Call Flow**:
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Rate Limiter    │───▶│ API Request     │───▶│ Retry Handler   │
│ (50 RPM default)│    │ (Claude Haiku)  │    │ (3 retries)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

#### 5.4 Progress Tracking (Resumability)

**ProgressTracker Class**

```python
class ProgressTracker:
    def load_progress(character) -> ProcessingProgress:
        """Load from .progress/{character}_progress.json"""
        
    def save_progress(progress):
        """Save progress to disk"""
        
    def mark_processed(progress, conversation_id):
        """Mark a conversation as processed"""
        
    def is_processed(progress, conversation_id) -> bool:
        """Check if already processed"""
```

**Progress File Format** (`.progress/{character}_progress.json`):
```json
{
  "character": "marinette",
  "processed_ids": ["ep1_marinette_0001", "ep1_marinette_0002", ...],
  "total_count": 500,
  "processed_count": 250
}
```

**Enhanced Cache** (`.progress/{character}_enhanced_cache.json`):
```json
[
  {
    "id": "ep1_marinette_0001",
    "messages": [
      {"role": "system", "content": "..."},
      {"role": "user", "content": "..."},
      {"role": "assistant", "content": "..."}
    ]
  }
]
```

#### 5.5 Data Splitting

**`split_data(conversations, train_ratio, val_ratio, test_ratio, seed)`**

- **Ratios**: 85% train, 10% validation, 5% test
- **Stratification**: By episode to ensure variety across splits
- **Shuffling**: Episodes shuffled first, then conversations within episodes
- **Deterministic**: Uses fixed seed (42) for reproducibility

```
Total Conversations
        │
        ▼
┌───────────────┐
│ Group by      │
│ Episode       │
└───────────────┘
        │
        ▼
┌───────────────┐
│ Shuffle       │
│ Episodes      │
└───────────────┘
        │
        ▼
┌───────────────┐
│ Flatten &     │
│ Split         │
└───────────────┘
        │
        ├──▶ Train (85%)
        ├──▶ Val (10%)
        └──▶ Test (5%)
```

#### 5.6 PreprocessingPipeline Class

**Main Orchestrator**

```python
class PreprocessingPipeline:
    def __init__(self, input_dir, output_dir, api_key):
        """Initialize pipeline with Claude client and progress tracker"""
        
    def load_raw_conversations(character) -> list[RawConversation]:
        """Load from output/{character}_conversations.json"""
        
    def process_character(character) -> list[EnhancedConversation]:
        """
        Full processing for one character:
        1. Load raw data
        2. Clean each conversation
        3. Generate system prompt (once)
        4. Enhance with Claude API (with resumability)
        5. Cache results
        """
        
    def run(characters=None):
        """
        Run full pipeline:
        1. Process each character
        2. Split into train/val/test
        3. Save JSONL files
        4. Save system prompts
        """
```

### Usage

```bash
# Activate virtual environment
source venv/bin/activate

# Full preprocessing (all characters)
python preprocess.py

# Process specific characters only
python preprocess.py --characters marinette ladybug

# Clear progress and start fresh
python preprocess.py --clear-progress

# Dry run (no API calls, just cleaning)
python preprocess.py --dry-run

# Custom directories
python preprocess.py --input ./output --output ./training
```

### Output Format

**JSONL** (`training/{character}_train.jsonl`):
```jsonl
{"messages":[{"role":"system","content":"You are a creative teenage girl who gets flustered around your crush..."},{"role":"user","content":"Hey Marinette! Adrien is coming over."},{"role":"assistant","content":"A-Adrien?! Here?! I mean— that's cool, totally cool. (takes a deep breath) When is he coming?"}]}
```

**System Prompts** (`training/system_prompts.json`):
```json
{
  "marinette": "You are a creative and kind-hearted teenage girl...",
  "ladybug": "You are a confident and quick-thinking superhero...",
  "adrien": "You are a kind and genuine teenage boy...",
  "cat_noir": "You are a playful and flirtatious superhero..."
}
```

---

## 6. Script 3: train_qlora.py

### Purpose
Fine-tunes Llama-3.2-3B-Instruct using QLoRA (Quantized Low-Rank Adaptation) on the processed character dialogue data.

### Dependencies
```bash
pip install torch transformers peft bitsandbytes trl accelerate datasets
```

### Requirements
- **GPU**: NVIDIA GPU with at least 8GB VRAM
- **HuggingFace Account**: Must accept Llama-3.2 license on HuggingFace
- **Login**: `huggingface-cli login` with your token

### Key Components

#### 6.1 Model Loading with 4-bit Quantization

```python
from transformers import BitsAndBytesConfig

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.2-3B-Instruct",
    quantization_config=bnb_config,
    device_map="auto",
)
```

#### 6.2 LoRA Configuration

```python
from peft import LoraConfig

lora_config = LoraConfig(
    r=16,                    # Rank
    lora_alpha=32,           # Alpha scaling
    lora_dropout=0.05,       # Dropout
    bias="none",
    task_type="CAUSAL_LM",
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",  # Attention layers
        "gate_proj", "up_proj", "down_proj",      # MLP layers
    ],
)
```

#### 6.3 Training with Completion-Only Loss

The trainer only computes loss on assistant responses, not on system prompts or user messages:

```python
from trl import DataCollatorForCompletionOnlyLM

response_template = "<|start_header_id|>assistant<|end_header_id|>\n\n"
collator = DataCollatorForCompletionOnlyLM(
    response_template=response_template,
    tokenizer=tokenizer,
)
```

### Usage

```bash
# Train Ladybug adapter
python train_qlora.py --character ladybug

# Train with custom settings
python train_qlora.py --character marinette --epochs 5 --learning-rate 1e-4 --lora-r 32

# Resume from checkpoint
python train_qlora.py --character ladybug --resume

# Test inference with trained adapter
python train_qlora.py --character ladybug --test ./adapters/ladybug
```

### Command Line Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--character`, `-c` | (required) | Character to train: marinette, ladybug, adrien, cat_noir |
| `--output-dir`, `-o` | `./adapters/{character}` | Output directory for adapter |
| `--epochs` | 3 | Number of training epochs |
| `--batch-size` | 4 | Training batch size |
| `--learning-rate`, `-lr` | 2e-4 | Learning rate |
| `--lora-r` | 16 | LoRA rank |
| `--resume` | False | Resume from last checkpoint |
| `--test` | None | Test inference with adapter path |

### Default Hyperparameters

```python
DEFAULT_CONFIG = {
    "epochs": 3,
    "batch_size": 4,
    "gradient_accumulation_steps": 4,
    "learning_rate": 2e-4,
    "max_seq_length": 2048,
    "lora_r": 16,
    "lora_alpha": 32,
    "lora_dropout": 0.05,
}
```

### Output Structure

After training, the adapter is saved to:

```
adapters/ladybug/
├── adapter_config.json       # LoRA configuration
├── adapter_model.safetensors # LoRA weights
├── tokenizer.json            # Tokenizer
├── tokenizer_config.json
├── special_tokens_map.json
└── checkpoint-*/             # Training checkpoints
```

### Loading a Trained Adapter for Inference

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

# Load base model
model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.2-3B-Instruct",
    device_map="auto",
    torch_dtype=torch.bfloat16,
)

# Load LoRA adapter
model = PeftModel.from_pretrained(model, "./adapters/ladybug")

# Generate
tokenizer = AutoTokenizer.from_pretrained("./adapters/ladybug")
messages = [
    {"role": "system", "content": "You are Ladybug, the superhero of Paris."},
    {"role": "user", "content": "Cat Noir is in trouble!"}
]
inputs = tokenizer.apply_chat_template(messages, return_tensors="pt", add_generation_prompt=True)
outputs = model.generate(inputs.to(model.device), max_new_tokens=256)
print(tokenizer.decode(outputs[0]))
```

---

## 7. Data Flow

### Multi-Turn Conversation Format

The preprocessing pipeline extracts **multi-turn conversations** where the target character participates in back-and-forth dialogue. The format is:

```json
{
  "messages": [
    {"role": "system", "content": "You are Ladybug, the superhero of Paris who wields the Miraculous of Creation..."},
    {"role": "user", "content": "Cat Noir is down! We need to help him!"},
    {"role": "assistant", "content": "Don't worry, I've got a plan! Lucky Charm!"},
    {"role": "user", "content": "What are you going to do with that?"},
    {"role": "assistant", "content": "Just trust me, kitty. I always figure it out!"}
  ]
}
```

**Key features:**
- **Multiple turns**: Average of 4 turns per conversation, ranging from 2-28
- **Varied system prompts**: 10 different system prompts per character to prevent overfitting
- **Character lore included**: System prompts reference Miraculous universe (kwamis, powers, catchphrases)
- **Minimal actions**: Only brief cues like `*laughs*`, `*sighs*` - no physical descriptions

### Complete Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: SCRAPING                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   MediaWiki API                   HTML Parser                               │
│   ┌──────────────┐               ┌──────────────┐                          │
│   │ Get category │──────────────▶│ Parse <poem> │                          │
│   │ members      │               │ divs         │                          │
│   └──────────────┘               └──────────────┘                          │
│          │                              │                                   │
│          ▼                              ▼                                   │
│   ┌──────────────┐               ┌──────────────┐                          │
│   │ 188 episode  │               │ Extract      │                          │
│   │ transcripts  │               │ dialogue +   │                          │
│   │              │               │ scenes       │                          │
│   └──────────────┘               └──────────────┘                          │
│                                         │                                   │
│                                         ▼                                   │
│                                  ┌──────────────┐                          │
│                                  │ Find back &  │                          │
│                                  │ forth convs  │                          │
│                                  └──────────────┘                          │
│                                         │                                   │
│                                         ▼                                   │
│                                  ┌──────────────┐                          │
│                                  │ output/*.json │                          │
│                                  │ (raw convs)  │                          │
│                                  └──────────────┘                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: PREPROCESSING                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Rule-Based Cleaner              Claude API                                │
│   ┌──────────────┐               ┌──────────────┐                          │
│   │ Remove visual│               │ Naturalize   │                          │
│   │ directions   │──────────────▶│ dialogue     │                          │
│   └──────────────┘               └──────────────┘                          │
│          │                              │                                   │
│          ▼                              ▼                                   │
│   ┌──────────────┐               ┌──────────────┐                          │
│   │ Keep emotion │               │ Generate sys │                          │
│   │ cues         │               │ prompts      │                          │
│   └──────────────┘               └──────────────┘                          │
│                                         │                                   │
│                                         ▼                                   │
│                                  ┌──────────────┐                          │
│                                  │ Data Split   │                          │
│                                  │ 85/10/5      │                          │
│                                  └──────────────┘                          │
│                                         │                                   │
│                                         ▼                                   │
│                                  ┌──────────────┐                          │
│                                  │ training/    │                          │
│                                  │ *.jsonl      │                          │
│                                  └──────────────┘                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: TRAINING (External)                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐               ┌──────────────┐                          │
│   │ Llama-3.2-3B │               │ 4x QLoRA     │                          │
│   │ Base Model   │──────────────▶│ Adapters     │                          │
│   └──────────────┘               └──────────────┘                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Transformation Example

**Stage 1 Output** (raw scraped):
```json
{
  "id": "stormy_weather_marinette_0001",
  "scene": "Dupain-Cheng House. Marinette is in her room.",
  "conversation": "Alya: Girl, guess what!\nMarinette: (nervously) W-what is it? (camera pans to her desk covered in Adrien photos)"
}
```

**After Rule-Based Cleaning**:
```json
{
  "context_line": "",
  "user_message": "Alya: Girl, guess what!",
  "assistant_response": "(nervously) W-what is it?"
}
```

**After Claude Enhancement**:
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a creative teenage girl who gets flustered easily..."
    },
    {
      "role": "user",
      "content": "Girl, guess what!"
    },
    {
      "role": "assistant",
      "content": "(nervously) W-what is it? Did something happen?"
    }
  ]
}
```

---

## 8. Configuration

### Environment Variables (.env)

```bash
# Required: Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-api03-...

# Optional: Model selection
# Options: claude-3-haiku-20240307, claude-3-5-sonnet-20241022
CLAUDE_MODEL=claude-3-haiku-20240307

# Optional: Rate limiting (requests per minute)
RATE_LIMIT_RPM=50
```

### Script Constants

**scrape_miraculous.py**:
```python
BASE_URL = "https://miraculousladybug.fandom.com"
API_URL = f"{BASE_URL}/api.php"
OUTPUT_DIR = Path("output")
REQUEST_DELAY = 1.5  # seconds between requests
```

**preprocess.py**:
```python
INPUT_DIR = Path("output")
OUTPUT_DIR = Path("training")
PROGRESS_DIR = Path(".progress")

TRAIN_RATIO = 0.85
VAL_RATIO = 0.10
TEST_RATIO = 0.05

CHARACTERS = ["marinette", "ladybug", "adrien", "cat_noir"]
```

---

## 9. Usage Guide

### Quick Start

```bash
# 1. Navigate to project directory
cd /home/brontolo/Desktop/MLB/data

# 2. Activate virtual environment
source venv/bin/activate

# 3. Set up API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 4. Run scraper (if not already done)
python scrape_miraculous.py

# 5. Run preprocessing
python preprocess.py

# 6. Check output
ls -la training/
```

### Full Workflow

```bash
# Step 1: Scrape all transcripts (~5-7 minutes)
python scrape_miraculous.py
# Creates: output/*.json

# Step 2: Preprocess with Claude API (~15-30 minutes)
python preprocess.py
# Creates: training/*.jsonl

# Step 3: (Optional) Process only specific characters
python preprocess.py --characters ladybug cat_noir

# Step 4: (Optional) Resume interrupted processing
python preprocess.py  # Automatically resumes from last checkpoint

# Step 5: (Optional) Start fresh
python preprocess.py --clear-progress
```

### Command Line Options

**scrape_miraculous.py**:
```
--limit, -l      Limit number of episodes (for testing)
--output, -o     Custom output directory
```

**preprocess.py**:
```
--characters, -c   Characters to process (marinette, ladybug, adrien, cat_noir)
--input, -i        Input directory with scraped data
--output, -o       Output directory for training data
--clear-progress   Clear all progress and start fresh
--dry-run          Only clean data, skip API enhancement
```

---

## 10. Output Formats

### Scraped Data (output/*.json)

```json
[
  {
    "id": "episode_character_0001",
    "scene": "Scene description from transcript",
    "conversation": "PrevChar: Context line\nTargetChar: First response\nPrevChar: Reply"
  }
]
```

### Training Data (training/*.jsonl)

```jsonl
{"messages":[{"role":"system","content":"System prompt"},{"role":"user","content":"User input"},{"role":"assistant","content":"Assistant response"}]}
```

**Llama-3.2 Chat Format**:
```
<|begin_of_text|><|start_header_id|>system<|end_header_id|>

{system_prompt}<|eot_id|><|start_header_id|>user<|end_header_id|>

{user_message}<|eot_id|><|start_header_id|>assistant<|end_header_id|>

{assistant_response}<|eot_id|>
```

### System Prompts (training/system_prompts.json)

```json
{
  "marinette": "You are a creative and kind-hearted teenage girl who is passionate about fashion design. You tend to get flustered and stutter when nervous, especially around your crush. You're fiercely loyal to your friends and always try to help others, even if you're clumsy about it.",
  "ladybug": "You are a confident and quick-thinking superhero who protects Paris from villains. You're resourceful, brave, and always find creative solutions to problems. You work as a team with Cat Noir, often calling him 'kitty' affectionately while keeping him focused on the mission.",
  "adrien": "You are a kind and genuine teenage boy who tries to see the best in everyone. Despite being a famous model, you're down-to-earth and sometimes naive about normal teenage life. You're polite, considerate, and always willing to help your friends.",
  "cat_noir": "You are a playful and flirtatious superhero who loves making cat puns and jokes. You're loyal and brave in battle, but also enjoy teasing and flirting with Ladybug, calling her 'm'lady' and 'bugaboo'. You use humor to lighten tense situations and your catchphrase is 'Cataclysm!' when using your power."
}
```

---

## 11. API Reference

### scrape_miraculous.py

#### MiraculousScraper

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `__init__` | `output_dir: Path` | - | Initialize scraper with output directory |
| `get_transcript_pages` | - | `list[dict]` | Fetch all transcript page titles from API |
| `fetch_transcript` | `page_title: str` | `str \| None` | Fetch HTML content via MediaWiki API |
| `parse_transcript` | `html: str` | `list[DialogueLine]` | Parse dialogue and scenes from HTML |
| `extract_back_and_forth` | `all_lines, episode` | `list[Conversation]` | Extract valid conversations |
| `process_all_transcripts` | `limit: int \| None` | - | Process all/limited transcripts |
| `save_results` | - | - | Save to JSON/CSV files |

### preprocess.py

#### ClaudeClient

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `__init__` | `api_key, model, rpm` | - | Initialize with rate limiting |
| `naturalize_dialogue` | `cleaned: CleanedConversation` | `str \| None` | Make dialogue more natural |
| `generate_system_prompt` | `character, samples` | `str \| None` | Generate personality prompt |

#### ProgressTracker

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `load_progress` | `character: str` | `ProcessingProgress` | Load or create progress |
| `save_progress` | `progress` | - | Save progress to disk |
| `mark_processed` | `progress, conversation_id` | - | Mark as processed |
| `is_processed` | `progress, conversation_id` | `bool` | Check if already processed |
| `clear_progress` | `character: str` | - | Reset progress |

#### PreprocessingPipeline

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `__init__` | `input_dir, output_dir, api_key` | - | Initialize pipeline |
| `load_raw_conversations` | `character: str` | `list[RawConversation]` | Load scraped data |
| `process_character` | `character: str` | `list[EnhancedConversation]` | Full processing |
| `run` | `characters: list \| None` | - | Run full pipeline |

#### Utility Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `clean_html_entities` | `text: str` | `str` | Replace HTML entities |
| `contains_emotional_root` | `text: str` | `bool` | Check if text has emotional keyword root |
| `clean_stage_directions` | `text: str` | `str` | Keep emotional parentheticals, remove others |
| `extract_character_response` | `conversation, character` | `tuple` | Parse conversation |
| `clean_conversation` | `raw, character` | `CleanedConversation \| None` | Full clean |
| `split_data` | `conversations, ratios, seed` | `tuple[list, list, list]` | Split train/val/test |
| `save_jsonl` | `conversations, filepath` | - | Save JSONL file |

---

## 12. Troubleshooting

### Common Issues

#### 1. "ANTHROPIC_API_KEY not found"

```bash
# Solution: Create .env file with API key
cp .env.example .env
# Edit .env and add: ANTHROPIC_API_KEY=your_key_here
```

#### 2. "403 Forbidden" during scraping

The scraper uses MediaWiki API which should work. If issues persist:
```python
# Check in scrape_miraculous.py that fetch_transcript uses API:
def fetch_transcript(self, page_title: str) -> str | None:
    params = {'action': 'parse', 'page': page_title, ...}
    response = self.session.get(API_URL, params=params)
```

#### 3. Rate limiting errors

```bash
# Solution: Reduce rate limit in .env
RATE_LIMIT_RPM=30  # Default is 50
```

#### 4. Interrupted processing

The script automatically resumes from where it left off. Just run again:
```bash
python preprocess.py  # Automatically resumes
```

To start fresh:
```bash
python preprocess.py --clear-progress
```

#### 5. Missing dependencies

```bash
source venv/bin/activate
pip install anthropic python-dotenv tqdm requests beautifulsoup4 lxml
```

#### 6. Empty output files

Check that scraping completed successfully:
```bash
ls -la output/
cat output/summary.json
```

If files are empty, re-run scraper:
```bash
python scrape_miraculous.py
```

---

## 13. Cost Estimation

### Claude API Costs (as of March 2026)

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| Claude 3 Haiku | $0.25 | $1.25 |
| Claude 3.5 Sonnet | $3.00 | $15.00 |

### Estimated Usage

Based on ~10,000 conversations:

| Task | Conversations | Avg Tokens | Total Tokens | Cost (Haiku) |
|------|---------------|------------|--------------|--------------|
| Naturalization | 10,000 | ~200 in + ~100 out | 2M in + 1M out | ~$1.75 |
| System Prompts | 4 | ~2000 in + ~100 out | 8K in + 400 out | ~$0.01 |
| **Total** | | | | **~$2-5** |

### Actual Cost Factors

- **Conversation length**: Longer conversations = more tokens
- **Retry rate**: API errors may require retries
- **Model choice**: Sonnet is ~12x more expensive than Haiku

### Cost Optimization Tips

1. Use `--dry-run` first to verify data quality without API calls
2. Process one character at a time to monitor costs
3. Use Haiku for bulk processing, Sonnet for final polish
4. Resumability prevents re-processing on interruption

---

## Appendix A: Example Prompts

### Dialogue Naturalization Prompt

```
System:
You are an expert dialogue writer helping prepare training data for a conversational AI.

Your task is to rewrite dialogue to be more natural and conversational while STRICTLY preserving:
- The character's unique personality and speech patterns
- All emotional cues (keep expressions like "laughs nervously", "sighs", etc.)
- The core meaning and intent of what the character is saying
- Any stuttering, hesitation, or verbal quirks that define the character

Remove or integrate smoothly:
- Any remaining stage directions that describe actions rather than emotions
- Awkward transcript-style formatting

Return ONLY the rewritten response, nothing else. Do not add quotation marks or character names.

User:
Character: Marinette, a creative and clumsy teenage girl who gets flustered around her crush Adrien

Context from the scene: Dupain-Cheng House. Marinette is in her room.

Previous message in conversation:
Alya: Girl, you'll never guess who I just saw!

Original character response to rewrite:
(nervously) W-who? (stutters) I mean, who did you see? (fidgets with her hands)

Rewrite this response to be more natural while keeping the character's voice:
```

### System Prompt Generation Prompt

```
System:
You are an expert at analyzing character personalities and writing system prompts for AI assistants.

Your task is to write a personality-focused system prompt (2-3 sentences) that will help an AI assistant respond in character. The prompt should describe:
- How this character communicates (speech patterns, verbal quirks)
- Their emotional tendencies and typical reactions
- Key personality traits that affect their responses
- Any catchphrases or distinctive ways of speaking

The prompt should be written in second person ("You are...") and be specific enough to guide consistent character portrayal.

Return ONLY the system prompt, nothing else.

User:
Character: Ladybug

Here are example conversations showing how this character speaks:

User: Cat Noir: Meow, m'lady!
Assistant: Perfect timing, kitty cat. Check this out - there's a new villain in town.

---

User: Cat Noir: Your superpower has quite a sense of humor.
Assistant: A plastic bag? (realizes) Wait - because it's already plastic! Good thinking, Cat Noir!

---

[... more examples ...]

Write a 2-3 sentence system prompt that captures this character's personality and communication style:
```

---

## Appendix B: Data Quality Checks

### Validation Script

```python
import json
from pathlib import Path

def validate_jsonl(filepath):
    """Validate a JSONL training file."""
    issues = []
    
    with open(filepath) as f:
        for i, line in enumerate(f, 1):
            try:
                data = json.loads(line)
                messages = data.get('messages', [])
                
                # Check structure
                if len(messages) != 3:
                    issues.append(f"Line {i}: Expected 3 messages, got {len(messages)}")
                    continue
                
                # Check roles
                roles = [m['role'] for m in messages]
                if roles != ['system', 'user', 'assistant']:
                    issues.append(f"Line {i}: Invalid roles: {roles}")
                
                # Check content
                for m in messages:
                    if not m.get('content', '').strip():
                        issues.append(f"Line {i}: Empty content for {m['role']}")
                
            except json.JSONDecodeError as e:
                issues.append(f"Line {i}: Invalid JSON: {e}")
    
    return issues

# Usage
for char in ['marinette', 'ladybug', 'adrien', 'cat_noir']:
    for split in ['train', 'val', 'test']:
        filepath = Path(f'training/{char}_{split}.jsonl')
        if filepath.exists():
            issues = validate_jsonl(filepath)
            print(f"{filepath}: {len(issues)} issues")
            for issue in issues[:5]:
                print(f"  - {issue}")
```

---

## Appendix C: Quick Start Guide

### Full Pipeline Execution

```bash
# 1. Setup environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# 2. Install dependencies
pip install requests beautifulsoup4 lxml python-dotenv anthropic tqdm
pip install torch transformers peft bitsandbytes trl accelerate datasets

# 3. Configure API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 4. Scrape transcripts (Stage 1)
python scrape_miraculous.py

# 5. Preprocess data (Stage 2)
python preprocess.py

# 6. Explore data (optional)
jupyter notebook explore_ladybug.ipynb

# 7. Train LoRA adapter (Stage 3)
huggingface-cli login  # Login to access Llama
python train_qlora.py --character ladybug

# 8. Test the trained model
python train_qlora.py --character ladybug --test ./adapters/ladybug
```

### Training All Characters

```bash
# Train all four character adapters
for char in marinette ladybug adrien cat_noir; do
    python train_qlora.py --character $char --epochs 3
done
```

### Memory Requirements

| Batch Size | VRAM Required | Notes |
|------------|---------------|-------|
| 1 | ~6GB | Slow training |
| 2 | ~7GB | Reasonable speed |
| 4 | ~8GB | Recommended |
| 8 | ~12GB | Fast training |

### Inference Example

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import torch

# Load model with adapter
base_model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.2-3B-Instruct",
    torch_dtype=torch.bfloat16,
    device_map="auto"
)
model = PeftModel.from_pretrained(base_model, "./adapters/ladybug")
tokenizer = AutoTokenizer.from_pretrained("./adapters/ladybug")

# Chat with Ladybug
messages = [
    {"role": "system", "content": "You are Ladybug, the superhero of Paris."},
    {"role": "user", "content": "There's an akuma attacking the Eiffel Tower!"}
]

inputs = tokenizer.apply_chat_template(
    messages, 
    return_tensors="pt", 
    add_generation_prompt=True
).to(model.device)

outputs = model.generate(
    inputs,
    max_new_tokens=256,
    temperature=0.7,
    do_sample=True
)

print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

---

## Appendix D: Data Statistics

### Scraped Conversations (Stage 1)

| Character | Conversations | Episodes |
|-----------|---------------|----------|
| Marinette | 1,356 | 188 |
| Ladybug | 1,125 | 188 |
| Adrien | 654 | 188 |
| Cat Noir | 800 | 188 |

### Processed Conversations (Stage 2)

| Character | Valid Conversations | Avg Turns | Turn Range |
|-----------|---------------------|-----------|------------|
| Marinette | ~1,100 | 4.0 | 2-28 |
| Ladybug | ~880 | 4.0 | 2-28 |
| Adrien | ~550 | 4.0 | 2-28 |
| Cat Noir | ~690 | 4.0 | 2-28 |

### System Prompt Variety

Each character has 10 unique system prompts that rotate during training to prevent overfitting. Each prompt:
- Starts with the character's name
- Includes Miraculous Ladybug universe lore (kwamis, powers, transformations)
- Describes speech patterns and verbal quirks
- Mentions catchphrases and key relationships

Example system prompts for Ladybug:

1. "You are Ladybug, the spotted superhero of Paris who wields the Miraculous of Creation. You work alongside Cat Noir to defeat akumatized villains, calling him 'kitty' while staying focused on strategic solutions using your Lucky Charm."

2. "You are Ladybug, guardian of the Miracle Box and protector of Paris. You speak with confidence and quick wit, transforming with 'Spots on!' and finishing battles with 'Miraculous Ladybug!' to restore everything."

3. "You are Ladybug, Marinette's superhero alter ego who becomes confident and decisive in battle. You care deeply about Cat Noir as your partner, balancing mission focus with genuine affection when you call him 'chaton'."

---

**End of Documentation**
