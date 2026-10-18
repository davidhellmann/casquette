/**
 * Demo streams at /streams/<id>.json – the same URL the real streams have in public/streams/.
 * Only generates files while the demo data is active; with real data there are no paths here
 * and public/streams/ is served as before.
 */
import { demoStreamIds, readStreams } from '../../lib/data.js';

export function getStaticPaths() {
  return demoStreamIds().map((id) => ({ params: { id } }));
}

export function GET({ params }) {
  const stream = readStreams(params.id);
  return new Response(JSON.stringify(stream), { status: stream ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
}
