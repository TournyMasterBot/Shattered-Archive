import { ITelnetClient } from './telnet-client';

export interface MudClientAppProps {
  host: string;
  port: number;
}

export interface IMudClientApp {
  /** Configuration for connected MUD */
  Config: MudClientAppProps;
  /** Session ID assigned to connected client */
  SessionId: string;
  /** Mud client service */
  MudClient: IMudClientService;
}

export interface MudClientServiceProps {
  host: string;
  port: number;
}

export interface IMudClientService {
  Config: MudClientServiceProps;
  TelnetClient: ITelnetClient;
}
