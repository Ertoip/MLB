import { Message } from '../types';
import './ChatMessage.css';

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const showTypingIndicator = !isUser && isStreaming && !message.content;

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-text">
        {showTypingIndicator ? (
          <span className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </span>
        ) : (
          message.content
        )}
      </div>
    </div>
  );
}
