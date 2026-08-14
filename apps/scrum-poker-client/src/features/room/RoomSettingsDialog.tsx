import { useState } from 'react';

import { formatDeck, parseDeck, validateDeck } from '@shatteredarchive/scrum-poker-core';
import type { RoomSettings, RoomSettingsPatch } from '@shatteredarchive/scrum-poker-core';

/**
 * The organizer's room configuration.
 *
 * The deck is edited as one comma-separated field (the reference site's shape, and the
 * fastest thing to paste a team's agreed scale into) and validated with the SAME
 * `validateDeck` the server runs — so an invalid deck is refused here, before any frame is
 * sent, with the identical wording the server would have used.
 */

interface Props {
  settings: RoomSettings;
  onSave: (patch: RoomSettingsPatch) => void;
  onClose: () => void;
}

const TOGGLES: { key: keyof RoomSettings; label: string }[] = [
  { key: 'hideUntilRevealed', label: 'Hide estimates until revealed' },
  { key: 'allowGuestsToReveal', label: 'Let anyone show or hide estimates' },
  { key: 'allowGuestsToReset', label: 'Let anyone reset estimates' },
  { key: 'allowGuestsToClearUsers', label: 'Let anyone clear all users' },
  { key: 'showAverage', label: 'Show the average after reveal' },
  { key: 'showMedian', label: 'Show the median after reveal' },
];

export default function RoomSettingsDialog({ settings, onSave, onClose }: Props) {
  const [friendlyName, setFriendlyName] = useState(settings.friendlyName);
  const [deckText, setDeckText] = useState(formatDeck(settings.deck));
  const [flags, setFlags] = useState<RoomSettings>(settings);

  const deck = parseDeck(deckText);
  const deckError = validateDeck(deck);

  const save = () => {
    if (deckError) return;
    onSave({
      friendlyName,
      deck,
      hideUntilRevealed: flags.hideUntilRevealed,
      allowGuestsToReveal: flags.allowGuestsToReveal,
      allowGuestsToReset: flags.allowGuestsToReset,
      allowGuestsToClearUsers: flags.allowGuestsToClearUsers,
      showAverage: flags.showAverage,
      showMedian: flags.showMedian,
    });
    onClose();
  };

  return (
    <div className="sp-modal-backdrop" role="dialog" aria-modal="true" aria-label="Room settings">
      <div className="sp-modal">
        <div className="sp-modal-head">
          <h2>Room settings</h2>
          <button type="button" className="sp-btn sp-btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="sp-field">
          <label htmlFor="sp-friendly-name">Room name</label>
          <input
            id="sp-friendly-name"
            type="text"
            value={friendlyName}
            maxLength={60}
            placeholder="e.g. Platform Team"
            onChange={(e) => setFriendlyName(e.target.value)}
          />
          <span className="sp-field-hint">Shown in the header. The invite link stays the same either way.</span>
        </div>

        <div className="sp-field">
          <label htmlFor="sp-deck">Estimate cards</label>
          <input id="sp-deck" type="text" value={deckText} onChange={(e) => setDeckText(e.target.value)} />
          <span className="sp-field-hint">
            {deckError ? deckError : `Comma-separated, in the order shown. ${deck.length} cards.`}
          </span>
        </div>

        {TOGGLES.map(({ key, label }) => (
          <label key={key} className="sp-toggle-row">
            <span>{label}</span>
            <input
              type="checkbox"
              checked={Boolean(flags[key])}
              onChange={(e) => setFlags((prev) => ({ ...prev, [key]: e.target.checked }))}
            />
          </label>
        ))}

        <div className="sp-modal-actions">
          <button type="button" className="sp-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="sp-btn sp-btn-primary" onClick={save} disabled={Boolean(deckError)}>
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
