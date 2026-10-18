// @ts-nocheck – typed in phase B of docs/adr/0004
import { describe, expect, it } from 'vitest';
import { patchRideMetrics, rideBody, rideFileName, rideFrontmatter, rideText, splitFrontmatter } from './ride-file.ts';

const rec = (extra = {}) => ({ id: '7', summary: { start_date: '2024-05-01T22:30:00Z', start_date_local: '2024-05-02T00:30:00', name: 'Late ride' }, ...extra });

describe('ride file', () => {
  it('lives under <year>/<ride date>_<id>.md, by the local start date', () => {
    expect(rideFileName(rec())).toBe('2024/2024-05-02_7.md');
    expect(rideFileName({ id: '8', summary: { start_date: '2023-12-31T10:00:00Z' } })).toBe('2023/2023-12-31_8.md');
  });

  it('splits frontmatter and body with LF or CRLF line endings, losslessly', () => {
    for (const text of ['---\nid: "7"\n---\n\nBody\n---\nmore', '---\r\nid: "7"\r\n---\r\n\r\nBody\r\n']) {
      const parts = splitFrontmatter(text);
      expect(parts.front).toBe('id: "7"');
      expect(parts.open + parts.front + parts.close + parts.body).toBe(text);
    }
    expect(splitFrontmatter('---\nid: "7"\n---').body).toBe('');
    expect(splitFrontmatter('No frontmatter')).toBeNull();
    expect(splitFrontmatter(null)).toBeNull();
  });

  it('renders the frontmatter as YAML followed by the body', () => {
    const text = rideText(rideFrontmatter(rec(), { gearName: 'Bike' }), '\nBody\n');
    expect(text).toMatch(/^---\nid: "7"\nname: "Late ride"\n/);
    expect(text).toContain('gear_name: "Bike"\n');
    expect(text.endsWith('---\n\nBody\n')).toBe(true);
    expect(splitFrontmatter(text).body).toBe('\nBody\n');
  });

  describe('ride body', () => {
    const described = rec({ detail: { description: ' From Strava ' } });
    it('takes the Strava description for a new or still empty file', () => {
      expect(rideBody(described)).toBe('\nFrom Strava\n');
      expect(rideBody(described, { existing: '---\nid: "7"\n---\n' })).toBe('\nFrom Strava\n');
      expect(rideBody(rec())).toBe('');
    });
    it('keeps own text and a deliberately emptied body', () => {
      expect(rideBody(described, { existing: '---\nid: "7"\n---\n\nOwn text\n' })).toBe('\nOwn text\n');
      expect(rideBody(described, { existing: '---\r\nid: "7"\r\n---\r\n\r\nOwn text\r\n' })).toBe('\r\nOwn text\r\n');
      expect(rideBody(described, { existing: '---\nid: "7"\n---\n\n', described: true })).toBe('\n');
    });
  });

  describe('metrics patch', () => {
    const text = '---\nid: "7"\ngeo: {custom: true}\nmetrics:\n  source: "streams"\n  time_in_power_zones: [10, 20]\n  time_in_power_zones_basis:\n    source: "legacy"\n    ftp: 300\n  power_curve:\n    60: 300\nlaps: []\n---\n\nOwn text\n';
    const add = { power_distribution: { version: 1, samples: [[200, 1]] } };

    it('removes the given metric keys with their nested lines, appends the new ones and keeps every other byte', () => {
      const patched = patchRideMetrics(text, { remove: ['time_in_power_zones', 'time_in_power_zones_basis'], add });
      expect(patched).toBe('---\nid: "7"\ngeo: {custom: true}\nmetrics:\n  source: "streams"\n  power_curve:\n    60: 300\n'
        + '  power_distribution:\n    version: 1\n    samples:\n      - [200, 1]\nlaps: []\n---\n\nOwn text\n');
    });

    it('patches CRLF files', () => {
      const patched = patchRideMetrics(text.replaceAll('\n', '\r\n'), { remove: ['time_in_power_zones'], add });
      expect(patched).not.toContain('time_in_power_zones: [10, 20]');
      expect(patched).toContain('  power_distribution:');
      expect(patched.endsWith('laps: []\r\n---\r\n\r\nOwn text\r\n')).toBe(true);
    });

    it('fails on files without frontmatter or metrics', () => {
      expect(() => patchRideMetrics('Text', { add })).toThrow('unknown Markdown format');
      expect(() => patchRideMetrics('---\nid: "7"\n---\n', { add })).toThrow('metrics missing');
    });
  });
});
