import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { Theme, getTheme, ladybugTheme, chatNoirTheme, assistantTheme } from './theme';
import { Persona } from '../types';

const PERSONA_ORDER: Persona[] = ['ladybug', 'chatnoir', 'assistant'];

function getPersonaColor(persona: Persona): string {
  if (persona === 'ladybug') return ladybugTheme.colors.primary;
  if (persona === 'chatnoir') return chatNoirTheme.colors.primary;
  return assistantTheme.colors.primary;
}

interface TransitionState {
  isActive: boolean;
  direction: 'in' | 'out';
  color: string;
}

interface ThemeContextType {
  theme: Theme;
  persona: Persona;
  setPersona: (persona: Persona) => void;
  cyclePersona: () => void;
  transition: TransitionState;
  onTransitionComplete: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [persona, setActivePersona] = useState<Persona>('ladybug');
  const [pendingPersona, setPendingPersona] = useState<Persona | null>(null);
  const [transition, setTransition] = useState<TransitionState>({
      isActive: false,
      direction: 'out',
      color: ladybugTheme.colors.primary,
    });
  
  const theme = getTheme(persona);

  const setPersona = useCallback(
    (nextPersona: Persona) => {
      if (transition.isActive || nextPersona === persona) {
        return;
      }

      setPendingPersona(nextPersona);
      setTransition({
        isActive: true,
        direction: 'out',
        color: getPersonaColor(persona),
      });
    },
    [persona, transition.isActive]
  );

  const cyclePersona = useCallback(() => {
    const currentIndex = PERSONA_ORDER.indexOf(persona);
    const nextPersona = PERSONA_ORDER[(currentIndex + 1) % PERSONA_ORDER.length];
    setPersona(nextPersona);
  }, [persona, setPersona]);

  const onTransitionComplete = useCallback(() => {
    if (transition.direction === 'out' && pendingPersona) {
      // Dissolve out complete - switch persona and start dissolve in
      setActivePersona(pendingPersona);
      const newColor = getPersonaColor(pendingPersona);
      
      setTransition({
        isActive: true,
        direction: 'in',
        color: newColor,
      });
      setPendingPersona(null);
    } else {
      // Dissolve in complete - end transition
      setTransition(prev => ({ ...prev, isActive: false }));
    }
  }, [transition.direction, pendingPersona]);

  return (
    <ThemeContext.Provider value={{ 
        theme, 
        persona, 
        setPersona, 
        cyclePersona,
        transition,
        onTransitionComplete,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
