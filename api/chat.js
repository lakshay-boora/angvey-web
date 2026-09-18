/**
 * POST /api/chat — Groq proxy. Env: GROQ_API_KEY, GROQ_MODEL
 */
export const config = { runtime: 'edge' };

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return json({
      error: 'GROQ_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.',
    }, 501);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const model = body.model || process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
  const payload = {
    model,
    messages: body.messages || [],
    temperature: body.temperature ?? 0.7,
    max_tokens: body.max_tokens ?? 4096,
    stream: body.stream !== false,
  };
  if (body.response_format) payload.response_format = body.response_format;

  const upstream = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => upstream.statusText);
    return json({ error: errText.slice(0, 500) }, upstream.status);
  }

  if (payload.stream && upstream.body) {
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...cors(),
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  }

  const data = await upstream.json();
  return json(data, 200);
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json' },
  });
}
