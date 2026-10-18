// @ts-nocheck – typed in phase B of docs/adr/0004
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../shared/env.ts';
import { toYaml } from '../../shared/yaml.ts';
import { splitFrontmatter } from '../../shared/ride-file.ts';

/* ---------------- Gear: one Markdown file per bike/shoe ----------------
 * The sync writes the Strava fields. The `custom:` block (purchase date, price, notes …)
 * and the Markdown body are yours – the sync keeps both unchanged. */
const DEFAULT_CUSTOM = 'custom:\n  purchase_date: null    # e.g. "2024-03-15"\n  price_eur: null        # purchase price → cost per km\n  components: []         # e.g. ["Shimano GRX 2x12", "Zipp 303 S"]\n  color: null\n  notes: null\n';

/** Writes `src/content/gear/<id>.md`; `rebuild` keeps the stored sync time instead of `now`. */
export function writeGear(g, { rebuild = false, root = ROOT, now = Date.now() } = {}) {
  const file = path.join(root, 'src', 'content', 'gear', `${g.id}.md`);
  let custom = DEFAULT_CUSTOM, body = '', syncedAt = null, hasBody = false;
  if (fs.existsSync(file)) {
    const m = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    if (m) {
      const stamp = m.front.match(/^synced_at: ("[^"\r\n]*"|null)\r?$/m);
      if (stamp) syncedAt = JSON.parse(stamp[1]);
      const lines = m.front.split(/\r?\n/);
      const i = lines.findIndex((l) => /^custom:/.test(l));
      if (i >= 0) {
        let j = i + 1;
        while (j < lines.length && (/^\s/.test(lines[j]) || lines[j] === '')) j++;
        custom = lines.slice(i, j).join('\n') + '\n';
      }
      body = m.body;
      hasBody = true;
    }
  }
  const fm = {
    id: g.id, name: g.name, type: g.type, brand: g.brand, model: g.model, frame_type: g.frame_type,
    description: g.description, weight: g.weight, distance: g.distance, retired: !!g.retired, primary: !!g.primary,
    strava_url: g.type === 'bike' ? `https://www.strava.com/bikes/${String(g.id).replace(/^b/, '')}` : `https://www.strava.com/shoes/${String(g.id).replace(/^g/, '')}`,
    synced_at: rebuild ? syncedAt : new Date(now).toISOString(),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\n${toYaml(fm)}${custom}---\n${hasBody ? body : '\n<!-- Write freely about your bike here: setup, stories, photos … -->\n'}`);
}
