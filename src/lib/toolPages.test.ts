import { describe, expect, it } from 'vitest';
import { HUB_IDS, TOOL_CONTENT } from '@/pages/tools';
import { PUBLIC_PATHS, SECTION_NAMES, TRACK_NAMES } from './analytics';
import { FEATURED_TOOLS, TOOL_PAGES, TOOL_PATHS, TOOLS_HUB, documentTitle } from './toolPages';

describe('calculator pages', () => {
  it('have unique addresses under the hub', () => {
    const paths = TOOL_PAGES.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(TOOL_PAGES.map((p) => p.id)).size).toBe(TOOL_PAGES.length);
    for (const path of paths) expect(path).toMatch(new RegExp(`^${TOOLS_HUB.path}/[a-z0-9-]+$`));
  });

  it('have titles and descriptions search engines show whole', () => {
    for (const p of [...TOOL_PAGES, TOOLS_HUB]) {
      expect(p.title.length, p.title).toBeLessThanOrEqual(70);
      expect(p.description.length, p.description).toBeLessThanOrEqual(160);
      expect(p.description.length, p.description).toBeGreaterThanOrEqual(80);
      expect(p.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (const p of TOOL_PAGES) expect(documentTitle(p).length).toBeLessThanOrEqual(70);
  });

  it('each has content, a FAQ and links to pages that exist, and the hub lists every one', () => {
    const ids = new Set(TOOL_PAGES.map((p) => p.id));
    for (const p of TOOL_PAGES) {
      const content = TOOL_CONTENT[p.id];
      expect(content.faq.length).toBeGreaterThanOrEqual(3);
      for (const id of content.related) expect(ids.has(id)).toBe(true);
      expect(content.related).not.toContain(p.id);
    }
    expect([...HUB_IDS].sort()).toEqual([...ids].sort());
    for (const id of FEATURED_TOOLS) expect(ids.has(id)).toBe(true);
  });

  it('are counted by the visit statistics', () => {
    for (const path of TOOL_PATHS) expect(PUBLIC_PATHS).toContain(path);
    for (const name of ['tools', 'tool_calc', 'tool_guide', 'tool_faq', 'tool_related', 'tool_cta']) expect(SECTION_NAMES[name]).toBeTruthy();
    for (const name of ['tools_card', 'tools_all', 'tool_try3d', 'tool_cta_register']) expect(TRACK_NAMES[name]).toBeTruthy();
  });
});
