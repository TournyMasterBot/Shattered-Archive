// services\services-server\src\mud-client-service.ts
import { v4 } from 'uuid';
import {
  IMudClientApp,
  IMudClientService,
  ITelnetClient,
  MudClientAppProps,
  MudClientServiceProps,
} from '@shatteredarchive/types-server';
import { TelnetClient } from './telnet-client-service.js';

export class MudClientApp implements IMudClientApp {
  private config: MudClientAppProps;
  private sessionId: string;
  private mudClient: IMudClientService;

  constructor(props: MudClientAppProps) {
    this.config = props;
    this.sessionId = v4();
    this.mudClient = new MudClientService({
      host: props.host,
      port: props.port,
    });
  }

  public get Config() {
    return this.config;
  }

  public get SessionId() {
    return this.sessionId;
  }

  public get MudClient() {
    return this.mudClient;
  }
}

export class MudClientService implements IMudClientService {
  config: MudClientServiceProps;
  telnetClient: ITelnetClient;

  constructor(props: MudClientServiceProps) {
    this.config = props;
    this.telnetClient = new TelnetClient({
      host: props.host,
      port: props.port,
      sendRate: 100,
      treatGoAheadAsNewline: true,
      promptFlushDelayMs: 120,
    });
  }

  public get Config() {
    return this.config;
  }

  public get TelnetClient() {
    return this.telnetClient;
  }
}
