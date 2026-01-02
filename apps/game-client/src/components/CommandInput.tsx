import React, { useCallback, useRef } from 'react';
import styles from '../styles/CommandInput.module.scss';
import { useGameCommand } from '../hooks/useGameCommand';
import { useVoiceDictation } from '../hooks/useVoiceDictation';

interface CommandInputProps {
  sendRaw: (data: string) => void;
  isConnected: boolean;
  onOpenAutoLeveling?: () => void;
  autoLevelingActive?: boolean;
}

export const CommandInput: React.FC<CommandInputProps> = ({
  sendRaw,
  isConnected,
  onOpenAutoLeveling,
  autoLevelingActive = false,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { inputValue, setInputValue, handleKeyDown } = useGameCommand({
    sendRaw,
    isConnected,
    inputRef,
  });

  const onFinalText = useCallback(
    (text: string) => {
      const prev = inputValue ?? '';
      const next = text ?? '';

      let merged: string;
      if (prev.length === 0) merged = next;
      else if (next.length === 0) merged = prev;
      else {
        const left = prev.replace(/\s+$/, '');
        const right = next.replace(/^\s+/, '');
        merged = `${left} ${right}`;
      }

      setInputValue(merged);

      queueMicrotask(() => {
        try {
          inputRef.current?.focus();
          inputRef.current?.select();
        } catch {
          // ignore
        }
      });
    },
    [inputValue, setInputValue],
  );

  const { isSupported, isRecording, lastError, toggle } = useVoiceDictation({
    enabled: isConnected,
    onFinalText,
    stopForceAbortMs: 700,
  });

  const micDisabled = !isConnected || !isSupported;
  const autoDisabled = !isConnected || !onOpenAutoLeveling;

  return (
    <div className={styles.commandInputBar}>
      <input
        ref={inputRef}
        id="game-command-input"
        className={`${styles.commandInput} ${isRecording ? styles.commandInputRecording : ''}`}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (isRecording && e.key === 'Enter') {
            e.preventDefault();
            return;
          }
          handleKeyDown(e);
        }}
        placeholder={
          !isConnected
            ? 'Connect to a server to begin'
            : isRecording
              ? 'Recording… tap mic again to stop & transcribe'
              : 'Type commands…'
        }
        disabled={!isConnected}
      />

      <button
        type="button"
        className={`${styles.autoLevelButton} ${autoLevelingActive ? styles.autoLevelButtonActive : ''}`}
        onMouseDown={(e) => e.preventDefault()} // keep focus in input
        onClick={() => onOpenAutoLeveling?.()}
        disabled={autoDisabled}
        aria-label={autoDisabled ? 'Auto leveling unavailable' : 'Open auto leveling'}
        title={!isConnected ? 'Connect to a server to use auto leveling' : 'Auto leveling'}
      >
        ⚔️
      </button>

      <button
        type="button"
        className={`${styles.micButton} ${isRecording ? styles.micButtonRecording : ''}`}
        onMouseDown={(e) => e.preventDefault()} // keep input focus
        onClick={toggle}
        disabled={micDisabled}
        aria-label={micDisabled ? 'Voice dictation unavailable' : isRecording ? 'Stop recording' : 'Start dictation'}
        aria-pressed={isRecording}
        title={
          !isSupported
            ? 'Voice dictation not supported in this browser'
            : !isConnected
              ? 'Connect to a server to use dictation'
              : isRecording
                ? 'Stop recording'
                : 'Start recording'
        }
      >
        {isRecording ? '⏺️' : '🎤'}
      </button>

      {isRecording ? <div className={styles.recordingHint}>Recording… tap again to stop & transcribe</div> : null}
      {lastError ? <div className={styles.micError}>{lastError}</div> : null}
    </div>
  );
};

export default CommandInput;
