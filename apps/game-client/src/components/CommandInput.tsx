// apps/game-client/src/components/CommandInput.tsx
import React from 'react';
import styles from '../styles/LayoutShell.module.scss';
import { useGameCommand } from '../hooks/useGameCommand';

interface CommandInputProps {
  sendRaw: (data: string) => void;
  isConnected: boolean;
}

export const CommandInput: React.FC<CommandInputProps> = ({ sendRaw, isConnected }) => {
  const { inputValue, setInputValue, handleKeyDown } = useGameCommand({
    sendRaw,
    isConnected,
  });

  return (
    <div className={styles.commandInputBar}>
      <input
        id="game-command-input"
        className={styles.commandInput}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isConnected ? 'Type commands…' : 'Connect to a server to begin'}
        disabled={!isConnected}
      />
    </div>
  );
};

export default CommandInput;
