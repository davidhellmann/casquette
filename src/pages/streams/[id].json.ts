/**
 * Demo streams at /streams/<id>.json – the same URL the real streams have in public/streams/.
 * Only generates files while the demo data is active; with real data there are no paths here
 * and public/streams/ is served as before.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getDataset } from '../../lib/data.ts';

export const getStaticPaths = (async () => (await getDataset()).streamIds().map((id) => ({ params: { id } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  // Every generated path has an id; without one there are no streams (404)
  const stream = params.id ? (await getDataset()).streams(params.id) : null;
  return new Response(JSON.stringify(stream), { status: stream ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
};
