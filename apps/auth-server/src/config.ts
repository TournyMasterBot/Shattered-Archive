import path from 'path';

/** Runtime configuration for the auth service. */
export interface AuthServerConfig {
  port: number;
  dataDir: string;
  /** LOCAL DEV / test only — 64 hex chars. See DATA_ENCRYPTION_KEY_FILE for the deploy path. */
  dataEncryptionKey?: string;
  /** Deploy path to a mounted key file (self-generated on first boot if absent). */
  dataEncryptionKeyFile?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  publicOrigin: string;
}

export function getAuthServerConfig(env: NodeJS.ProcessEnv = process.env): AuthServerConfig {
  const port = Number(env.PORT ?? '62000');
  return {
    port,
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    dataEncryptionKey: env.DATA_ENCRYPTION_KEY || undefined,
    dataEncryptionKeyFile: env.DATA_ENCRYPTION_KEY_FILE || undefined,
    smtpHost: env.SMTP_HOST || undefined,
    smtpPort: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined,
    smtpUser: env.SMTP_USER || undefined,
    smtpPass: env.SMTP_PASS || undefined,
    publicOrigin: env.PUBLIC_ORIGIN ?? 'http://localhost:62080',
  };
}
