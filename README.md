# Miraculous Chat

Miraculous Chat is a local-first character chatbot project built around the Miraculous Ladybug universe. The repository contains a desktop chat app, a mobile chat app, a Python backend for local model inference, and a data pipeline for scraping transcripts, preparing character dialogue data, generating RAG embeddings, and training LoRA adapters.

The main product experience is simple: the user unlocks their chat history with a password, chooses a persona such as Ladybug or Cat Noir, sends a message, and receives a streamed local LLM response in that character's voice. The supporting data tools explain how the character voice and retrieval data were built.

## Repository Layout

```text
MLB/
|-- backend/                 # FastAPI server for the desktop app
|   |-- server.py            # Chat API, streaming endpoint, persona prompts
|   |-- storage.py           # Password-based encrypted chat storage
|   `-- requirements.txt     # Python backend dependencies
|-- frontend/                # React + Electron desktop client
|   |-- src/components/      # Chat UI, sidebar, password modal, persona toggle
|   |-- src/hooks/useChat.ts # Desktop chat state, streaming, persistence calls
|   |-- src/electron/        # Electron main/preload processes
|   `-- package.json         # Desktop build and dev scripts
|-- mobile/                  # Expo React Native app
|   |-- src/services/llm.ts  # llama.rn local LLM loading and generation
|   |-- src/services/rag.ts  # Embedding model and semantic retrieval
|   |-- src/services/storage.ts
|   |-- src/data/            # Precomputed RAG chunks and embeddings
|   `-- package.json
|-- data/                    # Dataset, RAG, and fine-tuning tools
|   |-- scrape_miraculous.py # Fandom transcript scraper
|   |-- preprocess.py        # Cleaning and Claude-based dialogue enhancement
|   |-- generate_embeddings.py
|   |-- train_qlora.py       # Llama 3.2 QLoRA adapter training
|   |-- chat.py              # Test trained LoRA adapters locally
|   |-- chat_nemotron.py     # Prompt-only Nemotron character chat utility
|   |-- output/              # Scraped raw conversations
|   |-- training/            # Prepared training data
|   |-- raw_rag/             # Curated RAG source chunks
|   `-- adapters/            # LoRA adapter outputs/checkpoints
`-- README.md                # This file
```

## App Architecture

The project has two runtime paths.

The desktop path uses a separate backend and frontend:

```text
React/Electron desktop UI
        |
        | HTTP + Server-Sent Events
        v
FastAPI backend on localhost:8000
        |
        | llama-cpp-python
        v
Local GGUF model from Hugging Face
```

The mobile path is fully on-device after the first model downloads:

```text
Expo React Native app
        |
        | llama.rn
        v
Local Nemotron GGUF model
        |
        | optional RAG context from local embedding search
        v
Persona response streamed into the chat UI
```

## User Workflow

1. The app starts and checks whether a local account already exists.
2. The user creates or enters a password.
3. Existing chats are loaded from encrypted or password-protected local storage.
4. The selected persona controls the theme, system prompt, and chat list filtering.
5. The user sends a message.
6. The app adds the user message to the active conversation and creates an empty assistant message.
7. The backend or mobile LLM service builds the prompt from persona instructions, recent chat history, user settings, and optional RAG facts.
8. Tokens stream back into the placeholder assistant message so the response appears progressively.
9. Chat history is debounced and saved locally after updates.

## Libraries And Why They Are Used

### Backend

The backend is a Python API used by the desktop frontend.

| Library | Purpose |
|---------|---------|
| `fastapi` | Defines the HTTP API for health checks, chat generation, streaming generation, and chat storage. It provides typed request parsing and clean route definitions. |
| `uvicorn[standard]` | ASGI server used to run the FastAPI app locally on `http://localhost:8000`. |
| `pydantic` | Defines request schemas such as `ChatMessage`, `ChatRequest`, and `SaveChatsRequest`. FastAPI uses these models for validation and serialization. |
| `llama-cpp-python` | Loads and runs local GGUF models from Hugging Face. The backend currently loads `bartowski/Llama-3.2-3B-Instruct-GGUF` with a `Q4_K_M` quantized file. |
| `cryptography` | Encrypts desktop chat history using Fernet. Passwords are converted into encryption keys with PBKDF2-HMAC-SHA256 and a local salt. |

Backend responsibilities:

- Load the local model at server startup.
- Add the correct persona system prompt before each request.
- Generate either a full response from `/chat` or streamed chunks from `/chat/stream`.
- Store chat history in `~/.ladybug/chats.enc`.
- Verify passwords by attempting to decrypt the stored chat file.

### Desktop Frontend

The desktop app is a React application packaged with Electron.

| Library | Purpose |
|---------|---------|
| `react` and `react-dom` | Build the component-based desktop chat UI. |
| `typescript` | Adds static typing for messages, chats, settings, personas, component props, and hooks. |
| `vite` | Development server and production bundler for the React renderer process. |
| `electron` | Wraps the web UI in a native desktop window. The app uses a small phone-like window size and an isolated preload script. |
| `electron-builder` | Packages the desktop app for Linux, macOS, and Windows targets. |
| `concurrently` | Runs the Vite dev server and Electron process together during development. |
| `wait-on` | Waits for the Vite dev server to be ready before launching Electron. |

Desktop frontend responsibilities:

- Render chat messages, input, sidebar, settings, password modal, and persona toggle.
- Maintain chat state in `useChat`.
- Filter conversations by persona so Ladybug and Chat Noir have separate histories.
- Stream assistant responses by reading the `ReadableStream` returned from the backend SSE endpoint.
- Debounce saves to avoid writing chat history after every token.

### Mobile App

The mobile app is an Expo React Native app that runs inference directly on the device.

| Library | Purpose |
|---------|---------|
| `expo` | Provides the React Native app runtime, development tooling, native prebuild support, and platform configuration. |
| `react` and `react-native` | Build the native mobile interface. |
| `llama.rn` | Loads GGUF models and runs local inference on mobile. It is used both for the chat model and the embedding model. |
| `expo-file-system` | Stores downloaded models and local chat files in the app document directory. It is also used for model cleanup and file management. |
| `expo-secure-store` | Stores small sensitive values such as salt and user name in platform secure storage. |
| `expo-crypto` | Generates random salts and hashes password plus salt for the mobile storage key. |
| `expo-splash-screen` | Keeps the splash/loading experience controlled while the app checks storage and initializes models. |
| `expo-status-bar` | Controls status bar styling for the dark themed UI. |
| `react-native-safe-area-context` | Keeps the app layout inside device safe areas. |
| `react-native-gesture-handler`, `react-native-reanimated`, `react-native-screens` | Support native navigation, drawer-style UI, gestures, and performant transitions. |
| `@react-navigation/native` and `@react-navigation/drawer` | Navigation and drawer dependencies available to the app UI. |
| `@shopify/react-native-skia` | Supports custom visual effects such as the persona dissolve transition. |
| `react-native-markdown-display` | Renders assistant responses with Markdown formatting. |
| `@expo/vector-icons` | Provides icon assets for React Native UI controls. |

Mobile runtime model flow:

- The app checks whether the chat model exists locally.
- If missing, it downloads `Nemotron-Mini-4B-Instruct-Q4_K_M.gguf` from Hugging Face.
- It initializes the model through `llama.rn` with mobile-oriented settings such as smaller context, CPU execution, and reduced batch size.
- It prewarms the model with a tiny inference to reduce first-message latency.
- It then initializes the embedding model for RAG if needed.
- When the user sends a message, the app retrieves relevant facts, builds a Nemotron-format prompt, and streams tokens into the UI.

### Data And Training Pipeline

The `data/` folder contains scripts for building the character dataset and optional model adapters.

| Library | Purpose |
|---------|---------|
| `requests` | Calls the Miraculous Ladybug Fandom MediaWiki API to fetch transcript page lists and transcript HTML. |
| `beautifulsoup4` | Parses transcript HTML and extracts structured dialogue and scene information. |
| `lxml` | Fast parser backend used by BeautifulSoup. |
| `anthropic` | Calls Claude to rewrite noisy transcript dialogue into cleaner, natural multi-turn training examples and to generate varied system prompts. |
| `python-dotenv` | Loads `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, and `RATE_LIMIT_RPM` from `data/.env`. |
| `tqdm` | Shows progress bars while preprocessing conversations. |
| `torch` | Core tensor and GPU framework used for model loading, inference, and QLoRA training. |
| `transformers` | Loads Hugging Face models and tokenizers, applies chat templates, and performs text generation. |
| `datasets` | Converts prepared conversations into Hugging Face datasets for train/eval splitting. |
| `peft` | Adds and loads LoRA adapters for parameter-efficient fine-tuning. |
| `bitsandbytes` | Enables 4-bit quantization and memory-efficient optimizers for QLoRA. |
| `trl` | Provides `SFTTrainer` and supervised fine-tuning configuration. |
| `accelerate` | Handles device placement and training acceleration used by the Hugging Face stack. |
| `sentence-transformers` | Generates `all-MiniLM-L6-v2` embeddings for curated RAG chunks. |
| `numpy` | Supports embedding array conversion before JSON export. |

Data pipeline stages:

1. `scrape_miraculous.py` fetches transcript pages through the MediaWiki API.
2. It parses dialogue and scene blocks with BeautifulSoup and regex-based extraction rules.
3. It groups alternating two-speaker conversations where a target character starts the exchange.
4. It writes raw JSON and CSV conversation files to `data/output/`.
5. `preprocess.py` removes visual stage directions while preserving emotional speech cues.
6. Claude rewrites the dialogue into natural chat-style turns and generates varied system prompts.
7. Processed conversations are cached in `data/.progress/` for resumability.
8. The final training data is split into train, validation, and test JSONL files.
9. `train_qlora.py` can fine-tune a Llama 3.2 3B LoRA adapter for a selected character.
10. `chat.py` can load the base Llama model plus a trained adapter for interactive testing.

RAG pipeline stages:

1. Curated knowledge chunks live in `data/raw_rag/`.
2. `generate_embeddings.py` embeds each chunk with `all-MiniLM-L6-v2`.
3. Output files are copied into `mobile/src/data/` as `ladybug_embeddings.json` and `cat_noir_embeddings.json`.
4. The mobile app embeds the current user query with a local GGUF embedding model.
5. Cosine similarity ranks the persona-specific chunks.
6. The top facts are injected into the system prompt as compact context.

## Desktop Setup

Start the backend first:

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python server.py
```

Then start the desktop frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Useful desktop commands:

```bash
npm run dev:react      # Start only the Vite renderer
npm run build:react    # Build only the React app
npm run build          # Build Electron plus packaged desktop artifacts
npm run preview        # Preview the Vite production build
```

The desktop frontend expects the backend at `http://localhost:8000`.

## Mobile Setup

```bash
cd mobile
npm install
npm start
```

Run on Android or iOS:

```bash
npm run android
npm run ios
```

Build an Android APK with EAS:

```bash
cd mobile
eas build -p android --profile preview
```

First launch requires internet because the app downloads the chat model and embedding model. After that, generation is local unless the models are deleted or redownloaded.

## Data Pipeline Setup

Create and activate a Python environment inside `data/`:

```bash
cd data
python -m venv venv
source venv/bin/activate
pip install requests beautifulsoup4 lxml python-dotenv anthropic tqdm
pip install torch transformers peft bitsandbytes trl accelerate datasets
pip install sentence-transformers numpy
```

Create `data/.env` for Claude-powered preprocessing:

```bash
ANTHROPIC_API_KEY=your_api_key_here
CLAUDE_MODEL=claude-3-5-haiku-latest
RATE_LIMIT_RPM=50
```

Run the transcript scraping pipeline:

```bash
python scrape_miraculous.py
```

Run preprocessing:

```bash
python preprocess.py
```

Train a LoRA adapter:

```bash
python train_qlora.py --character ladybug
```

Test a trained adapter:

```bash
python chat.py --character ladybug
```

Generate RAG embeddings:

```bash
python generate_embeddings.py
```

## API Endpoints

The backend exposes these routes:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Confirms the backend is running and reports the model label. |
| `POST` | `/chat` | Returns a complete assistant message in one response. |
| `POST` | `/chat/stream` | Streams assistant tokens as Server-Sent Events. |
| `GET` | `/account/exists` | Checks whether encrypted desktop chat storage already exists. |
| `POST` | `/chats/load` | Loads encrypted chats using the `X-Password` header. |
| `POST` | `/chats/save` | Saves encrypted chats using the `X-Password` header. |
| `DELETE` | `/chats/{chat_id}` | Deletes one stored chat after password validation. |

## Storage And Privacy

Desktop chat history is stored under `~/.ladybug/`. The backend derives a Fernet key from the user's password with PBKDF2-HMAC-SHA256 and a persistent random salt, then saves the encrypted chat payload as `chats.enc`.

Mobile chat history is stored in the app document directory as `chats.enc`. The mobile code stores the salt in `expo-secure-store`, derives a SHA-256 key from password plus salt, and applies local XOR obfuscation before writing the file. This is acceptable for project/demo storage, but it should be replaced with platform-backed authenticated encryption before treating it as production-grade security.

Model files are downloaded to local app storage. The mobile app can detect old model files and offer cleanup to recover disk space.

## Current Personas

The desktop backend supports:

- `ladybug`: cheerful, optimistic, helpful, hero-themed assistant.
- `chatnoir`: charming, flirty, pun-heavy assistant.

The mobile app supports:

- `ladybug`: confident, warm, leader-like helper.
- `chatnoir`: flirty, romantic, cat-pun-focused helper.
- `assistant`: neutral general-purpose assistant.

## Notes For Development

- The desktop app requires the backend to be running before chat requests work.
- The backend downloads or loads its GGUF model through `llama-cpp-python` from Hugging Face.
- The mobile app requires significant device storage and RAM because it runs GGUF models locally.
- Data preprocessing requires an Anthropic API key unless the script is changed to fully support offline cleaning only.
- Fine-tuning with QLoRA requires a CUDA-capable GPU and Hugging Face access to the base Llama model.
- More detailed scraper and fine-tuning documentation is available in `data/DOCUMENTATION.md`.
