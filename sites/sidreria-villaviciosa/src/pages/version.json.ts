import { BUILD_ID } from '../lib/build.ts';
export const GET = () => new Response(JSON.stringify({ v: BUILD_ID }), { headers: { 'Content-Type': 'application/json' } });
