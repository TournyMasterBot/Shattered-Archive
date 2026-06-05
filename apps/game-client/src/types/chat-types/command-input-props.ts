// apps\game-client\src\types\chat-types\command-input-props.ts
import { AutoLevelMode, AutoLevelRunState } from '../../features/autoleveling/autoleveling-types';

export interface CommandInputProps {
  sendRaw: (data: string) => void;
  isConnected: boolean;

  /** Opens the configuration modal (optional) */
  onOpenAutoLeveling?: () => void;

  /** Current mode — shows ⚔️ icon when not 'disabled' */
  autoLevelMode?: AutoLevelMode;

  /** Current run state (for button state) */
  autoLevelRunState?: AutoLevelRunState;

  /** Sightsee: re-fire identify commands without advancing the path */
  onSightseeRescan?: () => void;
}
