// Auth feature slice — optional cloud account (Phase F): login, match history + replay viewer,
// army-layout cloud sync. Logged out is the default, fully-supported state.
export { AccountScreen } from './AccountScreen';
export { useAuthCallback } from './useAuthCallback';
export { startLogin, parseAuthFragment, type ParsedAuthFragment } from './ktSso';
export { getToken, setToken, clearToken, isExpired, type StoredAuthToken } from './authTokenStore';
