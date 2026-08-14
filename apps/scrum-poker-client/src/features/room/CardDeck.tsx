import type { EstimateDeck } from '@shatteredarchive/scrum-poker-core';

/**
 * The estimate cards. Clicking the selected card again clears the vote, which is the
 * shortest path to "actually, I want to think again" and avoids a separate clear control.
 */
export default function CardDeck({
  deck,
  selected,
  disabled,
  onPick,
}: {
  deck: EstimateDeck;
  selected: string | null;
  disabled: boolean;
  onPick: (card: string | null) => void;
}) {
  return (
    <div className="sp-deck" role="group" aria-label="Estimate cards">
      {deck.map((card) => {
        const isSelected = card === selected;
        return (
          <button
            key={card}
            type="button"
            className={`sp-deck-card${isSelected ? ' is-selected' : ''}`}
            disabled={disabled}
            aria-pressed={isSelected}
            onClick={() => onPick(isSelected ? null : card)}
          >
            {card}
          </button>
        );
      })}
    </div>
  );
}
