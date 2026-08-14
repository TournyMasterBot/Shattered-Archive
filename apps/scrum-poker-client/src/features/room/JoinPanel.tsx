import { useState } from 'react';

/**
 * The name gate. Nothing connects until this is filled in — there are no accounts, so a name
 * is the only identity in the room, and joining without one would put an anonymous row on
 * everyone's screen.
 *
 * The name is pre-filled from localStorage, so a regular participant confirms rather than
 * retypes.
 */
export default function JoinPanel({
  roomLabel,
  initialName,
  busy,
  onJoin,
}: {
  roomLabel: string;
  initialName: string;
  busy: boolean;
  onJoin: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);

  return (
    <form
      className="sp-card"
      onSubmit={(e) => {
        e.preventDefault();
        onJoin(name);
      }}
    >
      <h2 className="sp-section-title">Join {roomLabel}</h2>
      <p className="sp-section-hint">Your name is only kept while you’re active in this room.</p>

      <div className="sp-field">
        <label htmlFor="sp-join-name">Your name</label>
        <input
          id="sp-join-name"
          type="text"
          value={name}
          maxLength={32}
          autoFocus
          autoComplete="nickname"
          placeholder="e.g. Ada"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <button type="submit" className="sp-btn sp-btn-primary" disabled={busy || name.trim().length === 0}>
        {busy ? 'Joining…' : 'Join room'}
      </button>
    </form>
  );
}
