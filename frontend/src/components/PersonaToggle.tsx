import { Persona } from '../types';
import './PersonaToggle.css';

interface PersonaToggleProps {
  persona: Persona;
  onToggle: () => void;
}

export function PersonaToggle({ persona, onToggle }: PersonaToggleProps) {
  const isLadybug = persona === 'ladybug';

  return (
    <button
      className={`persona-toggle ${persona}`}
      onClick={onToggle}
      aria-label={`Switch to ${isLadybug ? 'Chat Noir' : 'Ladybug'}`}
      title={`Switch to ${isLadybug ? 'Chat Noir' : 'Ladybug'}`}
    >
      <div className="persona-toggle-track">
        <span className="persona-icon ladybug-icon">LB</span>
        <span className="persona-icon chatnoir-icon">CN</span>
        <div className="persona-toggle-thumb" />
      </div>
    </button>
  );
}
