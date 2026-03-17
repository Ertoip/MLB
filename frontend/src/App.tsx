import { useState, useEffect } from 'react';
import { useChat } from './hooks/useChat';
import { ChatView } from './components/ChatView';
import { Sidebar } from './components/Sidebar';
import { PasswordModal } from './components/PasswordModal';
import { PersonaToggle } from './components/PersonaToggle';
import { Persona } from './types';
import './styles/index.css';

const API_BASE_URL = 'http://localhost:8000';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [isNewAccount, setIsNewAccount] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [persona, setPersona] = useState<Persona>('ladybug');

  const {
    chats,
    currentChat,
    currentChatId,
    settings,
    isLoading,
    isSaving,
    createNewChat,
    selectChat,
    deleteChat,
    sendMessage,
    updateSettings,
    loadChats,
  } = useChat(password, persona);

  // Check if account exists on mount
  useEffect(() => {
    const checkAccount = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/account/exists`);
        const data = await response.json();
        setIsNewAccount(!data.exists);
      } catch (error) {
        console.error('Failed to check account:', error);
        // Assume new account if we can't connect
        setIsNewAccount(true);
      } finally {
        setIsAuthLoading(false);
      }
    };

    checkAccount();
  }, []);

  // Load chats when password is set
  useEffect(() => {
    if (password) {
      const doLoad = async () => {
        setIsAuthLoading(true);
        const success = await loadChats();
        setIsAuthLoading(false);
        if (!success && !isNewAccount) {
          setAuthError('Invalid password');
          setPassword(null);
        }
      };
      doLoad();
    }
  }, [password, loadChats, isNewAccount]);

  const handlePasswordSubmit = (submittedPassword: string) => {
    setAuthError(null);
    setPassword(submittedPassword);
  };

  const togglePersona = () => {
    setPersona((prev) => (prev === 'ladybug' ? 'chatnoir' : 'ladybug'));
  };

  // Get the appropriate logo for current persona
  const getLogo = () => {
    return persona === 'ladybug' ? '/Ladybug.png' : '/Charnoir.png';
  };

  // Show loading while checking account
  if (isAuthLoading && isNewAccount === null) {
    return (
      <div className="app loading-screen" data-persona={persona}>
        <img src={getLogo()} alt={persona} className="loading-logo" />
        <p>Loading...</p>
      </div>
    );
  }

  // Show password modal if not authenticated
  if (!password) {
    return (
      <PasswordModal
        isNewAccount={isNewAccount ?? true}
        onSubmit={handlePasswordSubmit}
        error={authError}
        isLoading={isAuthLoading}
      />
    );
  }

  return (
    <div className="app" data-persona={persona}>
      {isSaving && <div className="save-indicator">Saving...</div>}
      <Sidebar
        isOpen={sidebarOpen}
        chats={chats}
        currentChatId={currentChatId}
        settings={settings}
        persona={persona}
        onClose={() => setSidebarOpen(false)}
        onSelectChat={selectChat}
        onNewChat={() => {
          createNewChat();
          setSidebarOpen(false);
        }}
        onDeleteChat={deleteChat}
        onUpdateSettings={updateSettings}
      />
      <ChatView
        chat={currentChat}
        isLoading={isLoading}
        persona={persona}
        onSendMessage={sendMessage}
        onMenuClick={() => setSidebarOpen(true)}
      />
      <PersonaToggle persona={persona} onToggle={togglePersona} />
    </div>
  );
}

export default App;
