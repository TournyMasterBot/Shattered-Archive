/** Expected auth-server failure with an HTTP status; routes map it via a safe() wrapper. */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
