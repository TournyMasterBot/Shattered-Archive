// Net feature slice — online multiplayer over the authoritative `/ws/kt` gateway.
export { OnlineMatchScreen } from './OnlineMatchScreen';
export { useKtMatch, type UseKtMatch, type KtConnectConfig } from './hooks/useKtMatch';
export {
  KtSocket,
  type KtSocketStatus,
  type KtSocketHandlers,
  type SocketFactory,
  type WebSocketLike,
} from './kt-socket';
