export type Persona = 'ladybug' | 'chatnoir';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  persona: Persona;
}

export interface Settings {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface AppState {
  chats: Chat[];
  currentChatId: string | null;
  settings: Settings;
  sidebarOpen: boolean;
  persona: Persona;
}
