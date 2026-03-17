import { useState } from 'react';
import { Chat, Settings, Persona } from '../types';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  chats: Chat[];
  currentChatId: string | null;
  settings: Settings;
  persona: Persona;
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onUpdateSettings: (settings: Partial<Settings>) => void;
}

export function Sidebar({
  isOpen,
  chats,
  currentChatId,
  settings,
  persona,
  onClose,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onUpdateSettings,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'chats' | 'settings'>('chats');

  const formatDate = (date: Date) => {
    const now = new Date();
    const chatDate = new Date(date);
    const diffDays = Math.floor((now.getTime() - chatDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return chatDate.toLocaleDateString();
  };

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>{persona === 'ladybug' ? 'Ladybug' : 'Chat Noir'}</h2>
          <button className="close-button" onClick={onClose} aria-label="Close sidebar">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="sidebar-tabs">
          <button
            className={`tab-button ${activeTab === 'chats' ? 'active' : ''}`}
            onClick={() => setActiveTab('chats')}
          >
            Chats
          </button>
          <button
            className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>

        <div className="sidebar-content">
          {activeTab === 'chats' ? (
            <div className="chats-list">
              <button className="new-chat-button" onClick={onNewChat}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
                New Chat
              </button>

              {chats.length === 0 ? (
                <div className="no-chats">
                  <p>No conversations yet</p>
                </div>
              ) : (
                chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`chat-item ${chat.id === currentChatId ? 'active' : ''}`}
                    onClick={() => {
                      onSelectChat(chat.id);
                      onClose();
                    }}
                  >
                    <div className="chat-item-content">
                      <span className="chat-item-title">{chat.title}</span>
                      <span className="chat-item-date">{formatDate(chat.updatedAt)}</span>
                    </div>
                    <button
                      className="delete-chat-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(chat.id);
                      }}
                      aria-label="Delete chat"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="settings-panel">
              <div className="settings-group">
                <label className="settings-label">API Key</label>
                <input
                  type="password"
                  className="settings-input"
                  placeholder="Enter your API key"
                  value={settings.apiKey}
                  onChange={(e) => onUpdateSettings({ apiKey: e.target.value })}
                />
              </div>

              <div className="settings-group">
                <label className="settings-label">Model</label>
                <select
                  className="settings-select"
                  value={settings.model}
                  onChange={(e) => onUpdateSettings({ model: e.target.value })}
                >
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="claude-3-opus">Claude 3 Opus</option>
                  <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                </select>
              </div>

              <div className="settings-group">
                <label className="settings-label">
                  Temperature: {settings.temperature}
                </label>
                <input
                  type="range"
                  className="settings-range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={settings.temperature}
                  onChange={(e) => onUpdateSettings({ temperature: parseFloat(e.target.value) })}
                />
              </div>

              <div className="settings-group">
                <label className="settings-label">
                  Max Tokens: {settings.maxTokens}
                </label>
                <input
                  type="range"
                  className="settings-range"
                  min="256"
                  max="4096"
                  step="256"
                  value={settings.maxTokens}
                  onChange={(e) => onUpdateSettings({ maxTokens: parseInt(e.target.value) })}
                />
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
