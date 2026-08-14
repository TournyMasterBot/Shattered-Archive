import type { ParticipantView } from '@shatteredarchive/scrum-poker-core';

/**
 * Who's in the room and what they picked.
 *
 * The estimate column has three distinct states, and conflating any two of them makes the
 * table useless during a round: "hasn't voted" (an em dash), "voted, still hidden" (a filled
 * chip — you can see they're done without seeing the number), and the revealed value.
 */
export default function ParticipantTable({
  participants,
  youId,
  revealed,
}: {
  participants: readonly ParticipantView[];
  youId: string | null;
  revealed: boolean;
}) {
  if (participants.length === 0) {
    return <p className="sp-empty">Nobody has joined yet. Share the invite link to get started.</p>;
  }

  return (
    <table className="sp-table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col" className="sp-vote-cell">
            Estimate
          </th>
        </tr>
      </thead>
      <tbody>
        {participants.map((p) => (
          <tr key={p.id}>
            <td>
              {p.name}
              {p.id === youId && <span className="sp-table-you">you</span>}
            </td>
            <td className="sp-vote-cell">
              {!p.hasVoted ? (
                <span className="sp-vote-pending" aria-label="No estimate yet">
                  —
                </span>
              ) : p.vote === null ? (
                <span className="sp-vote-hidden" aria-label="Estimate submitted, hidden until revealed">
                  ✓
                </span>
              ) : (
                <span aria-label={revealed ? `Estimate ${p.vote}` : undefined}>{p.vote}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
