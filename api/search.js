/**
 * POST /api/search
 * Optional Tavily web search. Set TAVILY_API_KEY in Vercel env.
 * Body: { query, max_results? }
 */
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    return json({ error: 'TAVILY_API_KEY not set', results: [] }, 200);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const query = (body.query || '').trim();
  if (!query) return json({ results: [] });

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: body.max_results || 6,
        include_answer: false,
      }),
    });
    const data = await res.json();
    return json({ results: data.results || data || [] });
  } catch (err) {
    return json({ error: String(err.message || err), results: [] }, 200);
  }
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json' },
  });
}
