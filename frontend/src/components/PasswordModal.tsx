import { useState } from 'react';
import './PasswordModal.css';

interface PasswordModalProps {
  isNewAccount: boolean;
  onSubmit: (password: string) => void;
  error?: string | null;
  isLoading?: boolean;
}

export function PasswordModal({ isNewAccount, onSubmit, error, isLoading }: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!password) {
      setLocalError('Password is required');
      return;
    }

    onSubmit(password);
  };

  const displayError = localError || error;

  return (
    <div className="password-modal-overlay">
      <div className="password-modal">
        <div className="password-modal-header">
          <img src="/Ladybug.png" alt="Ladybug" className="password-modal-logo" />
          <h1>{isNewAccount ? 'Create Your Account' : 'Welcome Back'}</h1>
          <p>
            {isNewAccount
              ? 'Set a password to encrypt your chats. This password cannot be recovered!'
              : 'Enter your password to unlock your chats.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="password-modal-form">
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isNewAccount ? 'Create a password' : 'Enter your password'}
              autoFocus
              disabled={isLoading}
            />
          </div>

          {displayError && <div className="password-error">{displayError}</div>}

          <button type="submit" className="password-submit" disabled={isLoading}>
            {isLoading ? 'Loading...' : isNewAccount ? 'Create Account' : 'Unlock'}
          </button>
        </form>

        {isNewAccount && (
          <p className="password-warning">
            Warning: If you forget your password, your chats cannot be recovered.
          </p>
        )}
      </div>
    </div>
  );
}
