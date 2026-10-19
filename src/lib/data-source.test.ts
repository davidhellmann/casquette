import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { selectDataSource } from './data-source.ts';

let root: string;
const put = (rel: string, text = '') => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-source-'));
  put('src/content/rides/.gitkeep');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('selectDataSource – real data wins, demo data otherwise', () => {
  it('uses the demo data on a fresh clone without synced rides', () => {
    const source = selectDataSource({ root });
    expect(source.demo).toBe(true);
    expect(source.ridesDir).toBe(path.join(root, 'demo/rides'));
    expect(source.gearDir).toBe(path.join(root, 'demo/gear'));
    expect(source.streamsDir).toBe(path.join(root, 'demo/streams'));
    expect(source.dataDir).toBe(path.join(root, 'demo/data'));
  });

  it('uses only the real data as soon as one synced ride exists', () => {
    put('src/content/rides/2025/2025-05-04_123.md', '---\nid: 123\n---\n');
    const source = selectDataSource({ root });
    expect(source.demo).toBe(false);
    expect(source.ridesDir).toBe(path.join(root, 'src/content/rides'));
    expect(source.gearDir).toBe(path.join(root, 'src/content/gear'));
    expect(source.streamsDir).toBe(path.join(root, 'public/streams'));
    expect(source.dataDir).toBe(path.join(root, 'src/data'));
  });

  it('switches back to the demo data when the real rides are removed', () => {
    put('src/content/rides/2025/2025-05-04_123.md');
    expect(selectDataSource({ root }).demo).toBe(false);
    fs.rmSync(path.join(root, 'src/content/rides/2025'), { recursive: true });
    expect(selectDataSource({ root }).demo).toBe(true);
  });

  it('uses the demo data when DATA_SOURCE=demo, even with synced rides (e2e tests, screenshots)', () => {
    put('src/content/rides/2025/2025-05-04_123.md');
    expect(selectDataSource({ root, env: { DATA_SOURCE: 'demo' } }).demo).toBe(true);
    expect(selectDataSource({ root, env: {} }).demo).toBe(false);
  });

  it('ignores non-ride files such as .gitkeep or leftover pending writes', () => {
    put('src/content/rides/2025/2025-05-04_123.md.pending');
    put('src/content/rides/notes.txt');
    expect(selectDataSource({ root }).demo).toBe(true);
  });

  it('treats a missing rides folder as no real data', () => {
    fs.rmSync(path.join(root, 'src'), { recursive: true });
    expect(selectDataSource({ root }).demo).toBe(true);
  });
});
