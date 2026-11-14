import React from 'react';
import type { ConfirmRequest } from '../../features/simulacrumAdmin/sender';

interface Pending {
  request: ConfirmRequest;
  resolve: (accepted: boolean) => void;
}

export interface Confirmation {
  /** The question being asked, if any. */
  pending: ConfirmRequest | undefined;
  /** Pass to `sender.run` as the `confirm` option: resolves when the owner answers. */
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  /** The owner's answer to the open question. */
  answer: (accepted: boolean) => void;
}

/**
 * Holds the open confirmation of a tab. A question still open when the tab leaves the page is answered "no", so nothing is sent behind a
 * closed window.
 */
export function useConfirmation(): Confirmation {
  const [pending, setPending] = React.useState<Pending | undefined>();
  const ref = React.useRef<Pending | undefined>(undefined);

  React.useEffect(() => () => ref.current?.resolve(false), []);

  const confirm = React.useCallback(
    (request: ConfirmRequest): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        const next: Pending = {
          request,
          resolve: (accepted) => {
            ref.current = undefined;
            setPending(undefined);
            resolve(accepted);
          },
        };
        ref.current = next;
        setPending(next);
      }),
    [],
  );
  const answer = React.useCallback((accepted: boolean) => ref.current?.resolve(accepted), []);

  return { pending: pending?.request, confirm, answer };
}
