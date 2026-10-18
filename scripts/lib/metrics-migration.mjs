import { toYaml } from './yaml.mjs';
import { storedMetrics } from './metrics.mjs';

/** Targeted migration of the sync emitter's Markdown, not a general YAML reserializer.
 * Preserves every byte outside the affected metric lines (geo, custom fields, body).
 * Fail closed for unsupported legacy FTP encoding rather than dropping provenance.
 */
export function migrateRideMetrics(text) {
  const fm = text.match(/^(---\n)([\s\S]*?)(\n---\n?[\s\S]*)$/);
  if (!fm) throw new Error('Unsupported ride frontmatter format');
  const frontmatter = fm[2].replace(/^metrics:\n((?:[ \t].*(?:\n|$)|\n)*)/m, (block) => {
    const ftpLine = block.match(/^  ftp_used: (.*)$/m);
    let ftp = null;
    if (ftpLine) {
      ftp = JSON.parse(ftpLine[1]);
      if (ftp !== null && !Number.isFinite(ftp)) throw new Error('Unsupported legacy FTP');
    }
    let result = block.replace(/^  (?:intensity_factor|tss|avg_wkg|np_wkg|ftp_used):[^\n]*(?:\n|$)/gm, '');
    if (/^  time_in_power_zones: \[/m.test(block) && !/^  time_in_power_zones_basis:/m.test(block)) {
      const basis = storedMetrics({ ftp_used: ftp, time_in_power_zones: [] }).time_in_power_zones_basis;
      const metadata = toYaml({ time_in_power_zones_basis: basis }).trimEnd().split('\n').map((line) => '  ' + line).join('\n');
      result = result.trimEnd() + '\n' + metadata + (block.endsWith('\n') ? '\n' : '');
    }
    return result;
  });
  return fm[1] + frontmatter + fm[3];
}
