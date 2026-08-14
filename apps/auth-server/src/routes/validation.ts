import { AuthError } from '../errors.js';

const MIN_PASSWORD_LENGTH = 12;
const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export function requireString(body: unknown, field: string): string {
  const value = (body as Record<string, unknown> | undefined)?.[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AuthError(`${field} is required`, 400);
  }
  return value;
}

/** Strict shape check — used only at signup, where the username is being CHOSEN for the first time. Login/forgot-password use the looser requireString so a malformed value can't act as a format oracle beyond what signup already documents publicly. */
export function requireNewUsername(body: unknown): string {
  const raw = requireString(body, 'username').trim();
  if (raw.length < 3 || raw.length > 32 || !USERNAME_PATTERN.test(raw)) {
    throw new AuthError('username must be 3-32 characters: letters, digits, underscore, hyphen', 400);
  }
  return raw;
}

export function requireNewPassword(body: unknown, field = 'newPassword'): string {
  const value = requireString(body, field);
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`${field} must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
  }
  return value;
}

export function requireChallengeAnswers(body: unknown): { challengeId: string; answers: Record<string, string> } {
  const challengeId = requireString(body, 'challengeId');
  const raw = (body as Record<string, unknown> | undefined)?.answers;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AuthError('answers must be an object of { [questionId]: answer }', 400);
  }
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') answers[k] = v;
  }
  return { challengeId, answers };
}

/** Absent/null = no expiration ("forever" is explicitly allowed). Present must be a real, future ISO date. */
export function requireOptionalExpiresAt(body: unknown): string | null {
  const value = (body as Record<string, unknown> | undefined)?.expiresAt;
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new AuthError('expiresAt must be an ISO date string, null, or omitted', 400);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new AuthError('expiresAt is not a valid date', 400);
  if (parsed <= Date.now()) throw new AuthError('expiresAt must be in the future', 400);
  return new Date(parsed).toISOString();
}
