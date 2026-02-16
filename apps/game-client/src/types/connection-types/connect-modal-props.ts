// apps\game-client\src\types\connection-types\connect-modal-props.ts
export interface ConnectModalProps {
  isOpen: boolean;
  isConnected: boolean;
  currentHost?: string;
  currentPort?: number;

  onConnect: (host: string, port: number, options?: { autoEnableGmcp?: boolean }) => void;
  onDisconnect: () => void;
  onClose: () => void;
}
