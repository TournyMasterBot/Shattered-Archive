// apps/game-client/src/components/RightSidebar.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from '../styles/LayoutShell.module.scss';
import { useStatusBlockViewModel } from '../hooks/useLayoutShell';
import { useSanctuaryActive } from '../hooks/useSanctuaryActive';
import AffectsBlock from './AffectsBlock';
import CompassBlock from './CompassBlock';
import RoomHeader from './RoomHeader';
import {
  enemyColorClass,
  formatOpponentStatusText,
  type EnemyUiState,
  type OpponentStatusDetail,
} from '../features/combat/opponent-types';
import { ListenDomEvent, ListenEvent } from '../features/event-emitter/event-dispatcher';

/* ---------------- Status block (tick + vitals + enemy + ancillary) ---------------- */

type HudKey = 'tick' | 'statusIcons' | 'hp' | 'mp' | 'stam' | 'opponent';
type HudToggles = Record<HudKey, boolean>;

const DEFAULT_HUD: HudToggles = {
  tick: true,
  statusIcons: true,
  hp: true,
  mp: true,
  stam: true,
  opponent: true,
};

function safeParseHud(json: string | null): HudToggles | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as Partial<HudToggles>;
    if (!obj || typeof obj !== 'object') return null;

    const out: HudToggles = { ...DEFAULT_HUD };
    (Object.keys(DEFAULT_HUD) as HudKey[]).forEach((k) => {
      if (typeof obj[k] === 'boolean') out[k] = obj[k] as boolean;
    });
    return out;
  } catch {
    return null;
  }
}

const HUD_STORAGE_KEY = 'shatteredarchive:hud:statusBlock';

const StatusBlock: React.FC = () => {
  const { remaining, vitals, hpPct, mpPct, staPct, ancillary } = useStatusBlockViewModel();
  const { hasSanctuary } = useSanctuaryActive();

  // HUD toggle state (persisted)
  const [hud, setHud] = useState<HudToggles>(
    () => safeParseHud(window.localStorage?.getItem(HUD_STORAGE_KEY)) ?? DEFAULT_HUD,
  );
  const [hudMenuOpen, setHudMenuOpen] = useState(false);
  const hudMenuWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      window.localStorage?.setItem(HUD_STORAGE_KEY, JSON.stringify(hud));
    } catch {
      // ignore
    }
  }, [hud]);

  const toggleHud = (key: HudKey) => setHud((prev) => ({ ...prev, [key]: !prev[key] }));

  // Click-outside to close menu
  useEffect(() => {
    if (!hudMenuOpen) return;

    const dispose = ListenDomEvent<MouseEvent>(
      'mousedown',
      (e) => {
        const wrap = hudMenuWrapRef.current;
        if (!wrap) return;
        if (wrap.contains(e.target as Node)) return;
        setHudMenuOpen(false);
      },
      { key: 'RightSidebar::StatusBlock::hudMenu::mousedown' },
    );

    return () => {
      try {
        dispose?.();
      } catch {
        // ignore
      }
    };
  }, [hudMenuOpen]);

  // Enemy UI state (last known)
  const [enemyUi, setEnemyUi] = useState<EnemyUiState>({
    lastSeenTs: 0,
    label: 'Enemy',
    pct: 0,
    statusText: '',
  });

  type DamageChunk = { leftPct: number; widthPct: number; key: number };
  const [damageChunk, setDamageChunk] = useState<DamageChunk | null>(null);
  const chunkTimerRef = useRef<number | null>(null);

  // "Now" ticker so staleness can flip without new events
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const dispose = ListenEvent<OpponentStatusDetail>(
      'event:fighting:opponent',
      (d) => {
        if (!d || !Number.isFinite(d.pct)) return;

        setEnemyUi((prev) => {
          const prevSeen = prev.lastSeenTs > 0;
          const prevPct = prevSeen ? prev.pct : d.pct;
          const nextPct = d.pct;

          // If enemy pct decreased, show pulsing "damage chunk" over the lost segment.
          if (nextPct < prevPct) {
            const left = Math.max(0, Math.min(100, nextPct));
            const width = Math.max(0, Math.min(100 - left, prevPct - nextPct));

            if (width > 0.05) {
              setDamageChunk({ leftPct: left, widthPct: width, key: d.ts || Date.now() });

              if (chunkTimerRef.current) window.clearTimeout(chunkTimerRef.current);
              chunkTimerRef.current = window.setTimeout(() => setDamageChunk(null), 4500);
            }
          }

          return {
            lastSeenTs: d.ts || Date.now(),
            label: d.label?.trim() || prev.label || 'Enemy',
            pct: nextPct,
            statusText: formatOpponentStatusText(d.pct, d.minPct, d.maxPct),
          };
        });
      },
      { key: 'RightSidebar::StatusBlock::opponent' },
    );

    return () => {
      try {
        dispose?.();
      } catch {
        // ignore
      }
      if (chunkTimerRef.current) window.clearTimeout(chunkTimerRef.current);
    };
  }, []);

  // Only log ancillary when it actually changes
  useEffect(() => {
    if (
      ancillary.carryWeightPct == null &&
      ancillary.carryWeight == null &&
      ancillary.carryWeightMax == null &&
      !ancillary.isQuiet &&
      !ancillary.isFlying &&
      !ancillary.isRiding &&
      !ancillary.isFighting &&
      !ancillary.language
    ) {
      return;
    }
  }, [
    ancillary.carryWeight,
    ancillary.carryWeightMax,
    ancillary.carryWeightPct,
    ancillary.isQuiet,
    ancillary.isFlying,
    ancillary.isRiding,
    ancillary.isFighting,
    ancillary.language,
  ]);

  type StatusPiece = { key: string; text: string; title: string };

  const statusPieces: StatusPiece[] = [];

  if (ancillary.carryWeight != null && ancillary.carryWeightMax != null && ancillary.carryWeightPct != null) {
    const cw = ancillary.carryWeight.toFixed(0);
    const cwm = ancillary.carryWeightMax.toFixed(0);
    const cwp = ancillary.carryWeightPct.toFixed(0);

    statusPieces.push({
      key: 'carry',
      text: `🧺 ${cw} / ${cwm} (${cwp}%)`,
      title: `Carry weight: ${cw} / ${cwm} (${cwp}%)`,
    });
  }

  if (ancillary.isQuiet) statusPieces.push({ key: 'quiet', text: '🔇', title: 'Quiet (deafened)' });
  if (ancillary.isFlying) statusPieces.push({ key: 'flying', text: '🪽', title: 'Flying' });
  if (ancillary.isRiding) statusPieces.push({ key: 'riding', text: '🐎', title: 'Riding' });
  if (ancillary.isFighting) statusPieces.push({ key: 'fighting', text: '⚔️', title: 'Fighting' });

  if (ancillary.language && ancillary.language.toLowerCase() !== 'common') {
    statusPieces.push({ key: 'language', text: `💬 ${ancillary.language}`, title: `Language: ${ancillary.language}` });
  }

  const hasStatusPieces = statusPieces.length > 0;

  const enemyRowClass = useMemo(() => {
    const color = enemyColorClass(styles as any, enemyUi.pct);
    return `${styles.barRow} ${styles.barEnemy} ${color}`;
  }, [enemyUi.pct]);

  // Active if we saw a message in the last 5 seconds
  const ENEMY_STALE_MS = 5000;
  const isEnemyActive = enemyUi.lastSeenTs > 0 && now - enemyUi.lastSeenTs <= ENEMY_STALE_MS;

  // If stale, clear any leftover chunk immediately
  useEffect(() => {
    if (!isEnemyActive && damageChunk) setDamageChunk(null);
  }, [isEnemyActive, damageChunk]);

  return (
    <div className={styles.statusBlock}>
      {/* TOP ROW: always visible so the config manager never disappears */}
      <div className={styles.tickRow}>
        <div className={styles.tickLeft}>
          <div className={styles.hudConfigWrap} ref={hudMenuWrapRef}>
            <button
              type="button"
              className={styles.hudConfigButton}
              aria-label="HUD display options"
              aria-expanded={hudMenuOpen}
              onClick={() => setHudMenuOpen((v) => !v)}
            >
              ⚙
            </button>

            {hudMenuOpen && (
              <div className={styles.hudConfigPanel} role="menu" aria-label="HUD toggles">
                <div className={styles.hudToggleRow} role="menuitem" onClick={() => toggleHud('tick')}>
                  <span className={`${styles.hudDot} ${hud.tick ? styles.hudDotOn : styles.hudDotOff}`} />
                  <span className={styles.hudToggleLabel}>Tick</span>
                </div>

                <div className={styles.hudToggleRow} role="menuitem" onClick={() => toggleHud('statusIcons')}>
                  <span className={`${styles.hudDot} ${hud.statusIcons ? styles.hudDotOn : styles.hudDotOff}`} />
                  <span className={styles.hudToggleLabel}>Status</span>
                </div>

                <div className={styles.hudToggleRow} role="menuitem" onClick={() => toggleHud('hp')}>
                  <span className={`${styles.hudDot} ${hud.hp ? styles.hudDotOn : styles.hudDotOff}`} />
                  <span className={styles.hudToggleLabel}>HP</span>
                </div>

                <div className={styles.hudToggleRow} role="menuitem" onClick={() => toggleHud('mp')}>
                  <span className={`${styles.hudDot} ${hud.mp ? styles.hudDotOn : styles.hudDotOff}`} />
                  <span className={styles.hudToggleLabel}>MP</span>
                </div>

                <div className={styles.hudToggleRow} role="menuitem" onClick={() => toggleHud('stam')}>
                  <span className={`${styles.hudDot} ${hud.stam ? styles.hudDotOn : styles.hudDotOff}`} />
                  <span className={styles.hudToggleLabel}>Stam</span>
                </div>

                <div className={styles.hudToggleRow} role="menuitem" onClick={() => toggleHud('opponent')}>
                  <span className={`${styles.hudDot} ${hud.opponent ? styles.hudDotOn : styles.hudDotOff}`} />
                  <span className={styles.hudToggleLabel}>Opp</span>
                </div>
              </div>
            )}
          </div>

          {/* Only show the tick label when enabled */}
          {hud.tick && <span className={styles.tickLabel}>Next Tick:</span>}
        </div>

        {/* Only show the tick value pill when enabled */}
        {hud.tick && <span className={styles.tickValue}>{remaining}</span>}
      </div>

      {/* Status icons row */}
      {hud.statusIcons && hasStatusPieces && (
        <div className={styles.tickRow}>
          <span className={styles.tickLabel}>Status:</span>

          <span style={{ flex: 1, fontSize: '0.7rem', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {statusPieces.map((p) => (
              <span key={p.key} title={p.title} aria-label={p.title}>
                {p.text}
              </span>
            ))}
          </span>
        </div>
      )}

      {/* Vitals + enemy bars */}
      <div className={styles.barGroup}>
        {hud.hp && (
          <div className={`${styles.barRow} ${styles.barHp} ${hasSanctuary ? styles.hpSanctuary : ''}`}>
            <span className={styles.barLabel}>HP</span>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${hpPct}%` }} />
            </div>
            <span className={styles.barValue}>
              {vitals.hp} / {vitals.hpMax}
            </span>
          </div>
        )}

        {hud.mp && (
          <div className={`${styles.barRow} ${styles.barMp}`}>
            <span className={styles.barLabel}>MP</span>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${mpPct}%` }} />
            </div>
            <span className={styles.barValue}>
              {vitals.mp} / {vitals.mpMax}
            </span>
          </div>
        )}

        {hud.stam && (
          <div className={`${styles.barRow} ${styles.barSta}`}>
            <span className={styles.barLabel}>Stam</span>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${staPct}%` }} />
            </div>
            <span className={styles.barValue}>
              {vitals.stamina} / {vitals.staminaMax}
            </span>
          </div>
        )}

        {hud.opponent && (
          <div className={enemyRowClass}>
            <span className={styles.barLabel}>{isEnemyActive ? enemyUi.label : ''}</span>

            <div className={`${styles.barTrack} ${styles.enemyTrack}`}>
              <div className={styles.barFill} style={{ width: `${isEnemyActive ? enemyUi.pct : 0}%` }} />

              {isEnemyActive && damageChunk && damageChunk.widthPct > 0.05 && (
                <div
                  key={damageChunk.key}
                  className={styles.enemyDamageChunk}
                  style={{ left: `${damageChunk.leftPct}%`, width: `${damageChunk.widthPct}%` }}
                />
              )}
            </div>

            <span className={styles.barValue}>{isEnemyActive ? enemyUi.statusText : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------- Right sidebar shell ---------------- */

export const RightSidebar: React.FC = () => {
  return (
    <aside className={styles.rightPane}>
      <RoomHeader />
      <StatusBlock />
      <AffectsBlock />
      <CompassBlock />
    </aside>
  );
};

export default RightSidebar;
