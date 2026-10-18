import { describe, expect, it, vi } from 'vitest';

vi.mock('./env.mjs', async (original) => ({ ...await original(), ROOT: `${process.cwd()}/logs/geo-config-fixture` }));
import { nominatimConfig } from './geo.mjs';

describe('nominatimConfig', () => {
  it('asks Nominatim for English place names by default', () => {
    expect(nominatimConfig({}).lang).toBe('en');
  });

  it('uses GEO_LANG from the environment when set', () => {
    expect(nominatimConfig({ GEO_LANG: 'de' }).lang).toBe('de');
  });
});
