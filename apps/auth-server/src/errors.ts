/** Expected auth-server failure with an HTTP status; routes map it via a safe() wrapper. */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /**
     * Optional stable, machine-readable discriminator emitted alongside the message, for the
     * cases where a client must BRANCH on the failure rather than just display it (e.g.
     * DEVICE_REENROLL_REQUIRED → start enrollment, not "show an error"). Generalizes the
     * hand-rolled `code: 'MUST_CHANGE_PASSWORD'` that session-guard.ts already returns.
     * Never put anything in here that the message itself wouldn't reveal.
     */
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
