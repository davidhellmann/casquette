// @ts-nocheck – typed in phase B of docs/adr/0004
/**
 * Demo streams at /streams/<id>.json – the same URL the real streams have in public/streams/.
 * Only generates files while the demo data is active; with real data there are no paths here
 * and public/streams/ is served as before.
 */
import { getDataset } from '../../lib/data.ts';

export async function getStaticPaths() {
  return (await getDataset()).streamIds().map((id) => ({ params: { id } }));
}

export async function GET({ params }) {
  const stream = (await getDataset()).streams(params.id);
  return new Response(JSON.stringify(stream), { status: stream ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
}
