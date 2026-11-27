// apps/web-server/src/mapsResponsePolicy.test.ts

import fs from 'fs';
import path from 'path';
import { cacheControlFor, createFallbackNotifier } from './mapsResponsePolicy.js';

describe('cacheControlFor (FALLBACK-01, E8)', () => {
  it('lets browsers keep an upstream answer for the given age', () => {
    expect(cacheControlFor('upstream', 2592000)).toBe('public, max-age=2592000');
  });

  it('lets browsers keep an in-memory cached upstream answer too', () => {
    expect(cacheControlFor('cache', 60)).toBe('public, max-age=60');
  });

  it('never lets a browser keep an offline snapshot answer', () => {
    expect(cacheControlFor('offline', 2592000)).toBe('no-store');
  });
});

describe('createFallbackNotifier (FALLBACK-01, E23)', () => {
  it('warns once per endpoint however many requests fall back', () => {
    const warn = jest.fn();
    const notify = createFallbackNotifier(warn);

    expect(notify('/maps/autoleveling/classes')).toBe(true);
    expect(notify('/maps/autoleveling/classes')).toBe(false);
    expect(notify('/maps/autoleveling/classes')).toBe(false);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('serving offline snapshot'), {
      endpoint: '/maps/autoleveling/classes',
    });
  });

  it('warns separately for each different endpoint', () => {
    const warn = jest.fn();
    const notify = createFallbackNotifier(warn);

    expect(notify('/maps/autoleveling/classes')).toBe(true);
    expect(notify('/maps/autoleveling/areas')).toBe(true);

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('keeps separate state per notifier', () => {
    const warnA = jest.fn();
    const warnB = jest.fn();
    createFallbackNotifier(warnA)('/x');
    createFallbackNotifier(warnB)('/x');
    expect(warnA).toHaveBeenCalledTimes(1);
    expect(warnB).toHaveBeenCalledTimes(1);
  });
});

describe('offline autoleveling snapshot is complete (E7)', () => {
  const dir = path.resolve(__dirname, 'offline', 'autoleveling');
  const classes = (JSON.parse(fs.readFileSync(path.join(dir, 'classes.json'), 'utf8')) as {
    classes: { name: string; isReclass: boolean; abilities: { name: string; durationTicks?: unknown; lagMs?: unknown }[] }[];
  }).classes;

  it('holds all 48 playable classes: 5 base and 43 reclasses', () => {
    expect(classes).toHaveLength(48);
    expect(classes.filter((c) => !c.isReclass)).toHaveLength(5);
    expect(classes.filter((c) => c.isReclass)).toHaveLength(43);
  });

  it('includes the newer classes the old snapshot lacked', () => {
    const names = classes.map((c) => c.name.toLowerCase());
    expect(names.some((n) => n.includes('avenger'))).toBe(true);
    expect(names.some((n) => n.includes('chaos'))).toBe(true);
  });

  it('carries the durations and the measured lags of the live feed, so the fallback is not poorer than the service (L38, FALLBACK-01)', () => {
    const abilities = classes.flatMap((c) => c.abilities);
    const withDuration = abilities.filter((a) => a.durationTicks !== undefined);
    const withLag = abilities.filter((a) => a.lagMs !== undefined);
    expect(withDuration.length).toBeGreaterThan(500);
    expect(withLag.length).toBeGreaterThan(10);
    // every value that is there is a whole number from 0 up: unknown abilities have no key at all, never a null or a 0 standing in
    for (const a of [...withDuration, ...withLag]) {
      for (const v of [a.durationTicks, a.lagMs].filter((x) => x !== undefined)) {
        expect(Number.isInteger(v) && (v as number) >= 0).toBe(true);
      }
    }
    expect(abilities.some((a) => a.durationTicks === undefined && a.lagMs === undefined)).toBe(true);
    expect(abilities.find((a) => a.name === 'Frenzy' && a.lagMs !== undefined)?.lagMs).toBeGreaterThan(1000);
  });

  it('has no class without abilities', () => {
    expect(classes.filter((c) => c.abilities.length === 0).map((c) => c.name)).toEqual([]);
  });

  it('has an areas snapshot with at least one area and recommended targets', () => {
    const areas = (JSON.parse(fs.readFileSync(path.join(dir, 'areas.json'), 'utf8')) as {
      areas: { recommendedTargets?: unknown[] }[];
    }).areas;
    expect(areas.length).toBeGreaterThan(0);
    expect(areas.some((a) => (a.recommendedTargets ?? []).length > 0)).toBe(true);
  });
});
