// apps\game-client\src\types\chat-types\command-input-props.ts
import { AutoLevelRunState } from "../../features/autoleveling/autoleveling-types";

export interface CommandInputProps {
  sendRaw: (data: string) => void;
  isConnected: boolean;

  /** Opens the configuration modal (optional) */
  onOpenAutoLeveling?: () => void;

  /** Whether autoleveling feature is enabled/configured */
  autoLevelingActive?: boolean;

  /** Current run state (for Start/Pause/Resume labeling) */
  autoLevelRunState?: AutoLevelRunState;

  /** Optional direct callbacks; if omitted we dispatch events. */
  onAutoLevelStart?: () => void;
  onAutoLevelPause?: () => void;
  onAutoLevelResume?: () => void;
  onAutoLevelStop?: () => void;
}