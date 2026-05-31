# Miraculous Chat - Mobile App

A React Native mobile app for chatting with Ladybug and Chat Noir AI assistants, powered by Llama 3.2 3B running locally on your device.

## Features

- **Dual Personas**: Switch between Ladybug (cheerful & helpful) and Chat Noir (flirty & cool)
- **Fully Offline**: LLM runs completely on your device - no internet needed after model download
- **Encrypted Storage**: Your chats are encrypted with your password
- **Streaming Responses**: See AI responses as they're generated
- **Separate Chat Histories**: Each persona has their own chat history

## Requirements

- Android device with 8GB+ RAM (12GB+ recommended)
- ~3GB free storage for the app and model
- Node.js 18+ for development
- Android Studio (for building APK)

## Development Setup

1. **Install dependencies:**
   ```bash
   cd mobile
   npm install
   ```

2. **Start the development server:**
   ```bash
   npx expo start
   ```

3. **Run on Android device/emulator:**
   ```bash
   npx expo run:android
   ```

## Building the APK

### Option 1: Using EAS Build (Recommended)

1. **Install EAS CLI:**
   ```bash
   npm install -g eas-cli
   ```

2. **Login to Expo:**
   ```bash
   eas login
   ```

3. **Build APK:**
   ```bash
   eas build -p android --profile preview
   ```

   This will build the APK in the cloud and give you a download link.

### Option 2: Local Build

1. **Prebuild the native project:**
   ```bash
   npx expo prebuild
   ```

2. **Build the APK:**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

   The APK will be at: `android/app/build/outputs/apk/release/app-release.apk`

## Installing the APK

1. Transfer the APK to your Android device
2. Enable "Install from unknown sources" in Android settings
3. Open the APK file to install
4. On first launch, the app will download the AI model (~2GB)

## Project Structure

```
mobile/
├── src/
│   ├── components/       # React Native components
│   │   ├── ChatView.tsx
│   │   ├── ChatInput.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── Sidebar.tsx
│   │   ├── PersonaToggle.tsx
│   │   ├── PasswordModal.tsx
│   │   └── LoadingScreen.tsx
│   ├── hooks/
│   │   └── useChat.ts    # Chat state management
│   ├── services/
│   │   ├── llm.ts        # LLM integration with llama.rn
│   │   └── storage.ts    # Encrypted storage
│   ├── styles/
│   │   ├── theme.ts      # Theme definitions
│   │   └── ThemeContext.tsx
│   ├── types/
│   │   └── index.ts      # TypeScript types
│   ├── assets/           # Images
│   └── App.tsx           # Main app component
├── app.json              # Expo configuration
├── eas.json              # EAS Build configuration
└── package.json
```

## Tech Stack

- **React Native** with Expo
- **llama.rn** - Run GGUF models on mobile
- **expo-file-system** - File operations
- **expo-secure-store** - Secure password storage
- **expo-crypto** - Encryption

## Notes

- First launch will download the Llama 3.2 3B model (~2GB)
- Model inference is slower on mobile compared to desktop
- Newer phones with more RAM will have better performance
- The app uses ~4GB RAM when the model is loaded
