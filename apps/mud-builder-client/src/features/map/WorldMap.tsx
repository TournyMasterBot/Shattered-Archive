import { useEffect, useState } from 'react';

import { api, type WorldMapResponse } from '../../api/client.js';
import { DOOR_NAMES } from './layout.js';

/**
 * AI-ANNOTATION
 * @ai-summary World-level map (Phase 12): every listed area as a node on a
 *   circle (radius scaled by room count), directional cross-area exit links as
 *   edges (thickness by count, hover lists each connecting exit). Clicking an
 *   area drills into its area map.
 * @ai-public WorldMap (default)
 * @ai-notes Circle placement is deliberate — ~30 stock areas need legibility,
 *   not force simulation. Unparseable areas render dashed with a parse tooltip.
 */

const SIZE = 900;
const CENTER = SIZE / 2;
const RING = SIZE / 2 - 120;

function nodeRadius(rooms: number): number {
  return 14 + Math.min(Math.sqrt(rooms) * 2.2, 26);
}

export default function WorldMap({ onOpenArea }: { onOpenArea: (file: string) => void }) {
  const [data, setData] = useState<WorldMapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .worldMap()
      .then((res) => live && setData(res))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, []);

  if (error) return <p className="mb-map-error">{error}</p>;
  if (!data) return <p className="mb-map-loading">Loading world map…</p>;

  const positions = new Map<string, [number, number]>();
  data.areas.forEach((area, i) => {
    const angle = (2 * Math.PI * i) / Math.max(data.areas.length, 1) - Math.PI / 2;
    positions.set(area.file, [CENTER + RING * Math.cos(angle), CENTER + RING * Math.sin(angle)]);
  });

  const maxCount = Math.max(1, ...data.links.map((l) => l.count));

  return (
    <svg className="mb-map-svg mb-map-svg--world" role="img" aria-label="World map" viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {data.links.map((link) => {
        const from = positions.get(link.from);
        const to = positions.get(link.to);
        if (!from || !to) return null;
        return (
          <line
            key={`${link.from}->${link.to}`}
            className="mb-map-worldlink"
            x1={from[0]}
            y1={from[1]}
            x2={to[0]}
            y2={to[1]}
            strokeWidth={1 + (link.count / maxCount) * 5}
          >
            <title>
              {`${link.from} → ${link.to} (${link.count} exit${link.count === 1 ? '' : 's'})\n` +
                link.exits
                  .map((e) => `#${e.fromVnum} ${DOOR_NAMES[e.door] ?? '?'} → #${e.toVnum} ${e.toName}`)
                  .join('\n')}
            </title>
          </line>
        );
      })}
      {data.areas.map((area) => {
        const [x, y] = positions.get(area.file)!;
        const r = nodeRadius(area.rooms);
        return (
          <g
            key={area.file}
            className={area.parseError ? 'mb-map-worldnode mb-map-worldnode--broken' : 'mb-map-worldnode'}
            role="button"
            tabIndex={0}
            aria-label={`area ${area.file}`}
            onClick={() => onOpenArea(area.file)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onOpenArea(area.file);
            }}
          >
            <title>
              {area.parseError
                ? `${area.file} — parse error: ${area.parseError}`
                : `${area.name ?? area.file} — ${area.rooms} rooms — click for its map`}
            </title>
            <circle cx={x} cy={y} r={r} />
            <text x={x} y={y + r + 14} className="mb-map-worldnode-label">
              {area.name ?? area.file}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
