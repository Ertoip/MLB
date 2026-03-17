import { useEffect, useRef } from 'react';
import { Chat, Persona } from '../types';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import './ChatView.css';

interface ChatViewProps {
  chat: Chat | null;
  isLoading: boolean;
  persona: Persona;
  onSendMessage: (message: string) => void;
  onMenuClick: () => void;
}

export function ChatView({ chat, isLoading, persona, onSendMessage, onMenuClick }: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get the last message content to trigger scroll on streaming updates
  const lastMessageContent = chat?.messages[chat.messages.length - 1]?.content;
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages, lastMessageContent]);

  const isLadybug = persona === 'ladybug';
  const logo = isLadybug ? '/Ladybug.png' : '/Charnoir.png';
  const name = isLadybug ? 'Ladybug' : 'Chat Noir';

  return (
    <div className="chat-container">
      {/* HEADER */}
      <header className="chat-header">
        <button className="menu-button" onClick={onMenuClick} aria-label="Open menu">
          <img src={logo} alt="Menu" className="menu-logo" />
        </button>
        <div className="header-spacer" />
      </header>

      {/* CHAT MESSAGES */}
      <div className="chat-messages-wrapper">
        <main className="chat-messages">
          {!chat || chat.messages.length === 0 ? (
            <div className="empty-state">
              <img src={logo} alt={name} className="empty-logo" />
              <h2>{isLadybug ? "Let's chat!" : "Hey there, gorgeous"}</h2>
              <p>{isLadybug 
                ? `Send a message to begin chatting with ${name}.`
                : `Care to chat with this cool cat?`
              }</p>
            </div>
          ) : (
            <div className="messages-list">
              {chat.messages.map((message, index) => (
                <ChatMessage 
                  key={message.id} 
                  message={message} 
                  isStreaming={isLoading && index === chat.messages.length - 1}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>
      </div>

      {/* INPUT */}
      <footer className="chat-input-section">
        <ChatInput onSend={onSendMessage} disabled={isLoading} />
      </footer>
    </div>
  );
}
