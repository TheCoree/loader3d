import { describe, expect, it } from 'vitest';
import { RELEASES, releaseDate, shortReleaseDate, unseenReleases, visibleReleases, type Release } from './changelog';

/** The same pattern as `updates_seen` in backend/app/schemas/auth.py: the server refuses other ids. */
const ID = /^\d{4}-\d{2}-\d{2}(\.\d{1,2})?$/;

describe('the release history', () => {
  it('has valid ids, newest first, each a real date', () => {
    expect(RELEASES.length).toBeGreaterThan(0);
    const ids = RELEASES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(ID);
      const [y, m, d] = id.slice(0, 10).split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      expect(date.toISOString().slice(0, 10)).toBe(id.slice(0, 10));
    }
    expect([...ids].sort().reverse()).toEqual(ids);
  });

  it('has a title and complete sentences in every release', () => {
    for (const r of RELEASES) {
      expect(r.title.trim()).not.toBe('');
      expect(r.changes.length).toBeGreaterThan(0);
      const texts = r.changes.map((c) => c.text);
      expect(new Set(texts).size).toBe(texts.length);
      for (const text of texts) expect(text).toMatch(/[.!]$/);
    }
  });
});

const sample: Release[] = [
  { id: '2026-11-21.2', title: 'C', changes: [{ kind: 'fixed', text: 'c.' }] },
  { id: '2026-11-21', title: 'B', changes: [{ kind: 'new', text: 'b.', tiers: true }] },
  { id: '2026-11-07', title: 'A', changes: [{ kind: 'new', text: 'a.' }, { kind: 'improved', text: 'a2.', tiers: true }] },
];

describe('visibleReleases', () => {
  it('keeps everything with tiers on', () => {
    expect(visibleReleases(sample, true)).toEqual(sample);
  });

  it('drops the tier changes and the releases left empty with tiers off', () => {
    const shown = visibleReleases(sample, false);
    expect(shown.map((r) => r.id)).toEqual(['2026-11-21.2', '2026-11-07']);
    expect(shown[1].changes.map((c) => c.text)).toEqual(['a.']);
  });
});

describe('unseenReleases', () => {
  it('shows an old account everything after the day it was created', () => {
    expect(unseenReleases(sample, '', '2026-11-01T09:00:00Z').map((r) => r.id)).toEqual(['2026-11-21.2', '2026-11-21', '2026-11-07']);
    expect(unseenReleases(sample, '', '2026-11-10T09:00:00Z').map((r) => r.id)).toEqual(['2026-11-21.2', '2026-11-21']);
  });

  it('never shows a new account what came out before it', () => {
    expect(unseenReleases(sample, '', '2026-11-22T09:00:00Z')).toEqual([]);
  });

  it('shows only what is newer than the release seen last, a second one of the same day too', () => {
    expect(unseenReleases(sample, '2026-11-21', '2026-11-01T09:00:00Z').map((r) => r.id)).toEqual(['2026-11-21.2']);
    expect(unseenReleases(sample, '2026-11-21.2', '2026-11-01T09:00:00Z')).toEqual([]);
  });
});

describe('release dates', () => {
  it('are calendar days, whatever the time zone', () => {
    expect(releaseDate('2026-11-21')).toMatch(/^21 ноября 2026/);
    expect(releaseDate('2026-11-21.2')).toMatch(/^21 ноября 2026/);
    expect(shortReleaseDate('2026-01-05')).toBe('5 января');
  });
});
