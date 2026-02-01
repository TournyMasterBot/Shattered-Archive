// apps/game-client/src/components/CommandInput.tsx
import React, { useCallback, useRef } from 'react';
import styles from '../styles/CommandInput.module.scss';
import { useGameCommand } from '../hooks/useGameCommand';
import { useVoiceDictation } from '../hooks/useVoiceDictation';
import { CommandInputProps } from '../types/chat-types/command-input-props';

export const CommandInput: React.FC<CommandInputProps> = ({
  sendRaw,
  isConnected,

  onOpenAutoLeveling,

  autoLevelingActive = false,
  autoLevelRunState,

  onAutoLevelStart,
  onAutoLevelPause,
  onAutoLevelResume,
  onAutoLevelStop,
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

  const state = autoLevelRunState?.status ?? 'idle';
  const isRunning = state === 'running';
  const isPaused = state === 'paused';
  const isIdle = state === 'idle';

  const autoDisabled = !isConnected || !autoLevelingActive;

  //const fireStart = () => (onAutoLevelStart ? onAutoLevelStart() : DispatchEvent('shatteredarchive:autoleveling-start', {}));
  //const firePause = () => (onAutoLevelPause ? onAutoLevelPause() : DispatchEvent('shatteredarchive:autoleveling-pause', {}));
  //const fireResume = () => (onAutoLevelResume ? onAutoLevelResume() : DispatchEvent('shatteredarchive:autoleveling-resume', {}));
  //const fireStop = () => (onAutoLevelStop ? onAutoLevelStop() : DispatchEvent('shatteredarchive:autoleveling-stop', {}));

  const onAutoClick = () => {
    if (autoDisabled) return;
    /*
    if (isIdle) {
      const ok = window.confirm('Begin auto leveling now?');
      if (!ok) return;
      fireStart();
      return;
    }

    if (isRunning) {
      firePause();
      return;
    }

    if (isPaused) {
      fireResume();
      return;
    }

    // error/stopping fallback
    const ok = window.confirm('Auto leveling is not idle. Start again?');
    if (!ok) return;
    fireStart(); */
  };

  const onStopClick = () => {
    if (!isConnected) return;
    if (isIdle) return;

    const ok = window.confirm('Stop auto leveling? This ends the current run.');
    if (!ok) return;

    //fireStop();
  };

  const autoLabel = isIdle
    ? 'Start auto level'
    : isRunning
      ? 'Pause auto level'
      : isPaused
        ? 'Resume auto level'
        : 'Auto level';

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

      {/*
      <button
        type="button"
        className={`${styles.autoLevelButton} ${!autoDisabled && !isIdle ? styles.autoLevelButtonActive : ''}`}
        onMouseDown={(e) => e.preventDefault()} // keep focus in input
        onClick={onAutoClick}
        disabled={autoDisabled}
        aria-label={autoDisabled ? 'Auto leveling unavailable' : autoLabel}
        title={
          !isConnected
            ? 'Connect to a server to use auto leveling'
            : !autoLevelingActive
              ? 'Enable auto leveling first'
              : autoLabel
        }
      >
        ⚔️
      </button>

        
      {!isIdle ? (
        <button
          type="button"
          className={styles.autoStopButton}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onStopClick}
          aria-label="Stop auto leveling"
          title="Stop auto leveling"
        >
          ⏹
        </button>
      ) : null}
       */}

      {onOpenAutoLeveling ? (
        <button
          type="button"
          className={styles.autoConfigButton}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onOpenAutoLeveling?.()}
          disabled={!isConnected}
          aria-label="Configure auto leveling"
          title="Configure auto leveling"
        >
          ⚙️
        </button>
      ) : null}

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
