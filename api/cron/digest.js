/**
 * GET /api/cron/digest — Vercel Cron daily 03:00 UTC
 * Env: CRON_SECRET, DIGEST_EMAILS, RESEND_API_KEY, RESEND_FROM, DIGEST_WEBHOOK
 */
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) {
      return json({ error: 'Unauthorized' }, 401);
    }
  }

  const emails = String(process.env.DIGEST_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!emails.length && !process.env.DIGEST_WEBHOOK) {
    return json({
      ok: false,
      error: 'Set DIGEST_EMAILS and/or DIGEST_WEBHOOK in Vercel env.',
    }, 200);
  }

  const headlines = await fetchHeadlines();
  const results = [];

  if (process.env.DIGEST_WEBHOOK) {
    try {
      const r = await fetch(process.env.DIGEST_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cron_digest',
          cadence: 'daily',
          headlines,
          at: new Date().toISOString(),
        }),
      });
      results.push({ webhook: r.status });
    } catch (err) {
      results.push({ webhook: String(err.message || err) });
    }
  }

  for (const email of emails) {
    const sent = await sendEmail(email, headlines);
    results.push({ email, ...sent });
  }

  return json({ ok: true, count: headlines.length, results });
}

async function fetchHeadlines() {
  const feeds = [
    'https://hnrss.org/frontpage',
    'https://techcrunch.com/feed/',
    'https://news.google.com/rss/search?q=artificial+intelligence+when:1d&hl=en-US&gl=US&ceid=US:en',
  ];
  const out = [];
  const seen = new Set();
  for (const url of feeds) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ANGVEY-Cron/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const parts = xml.split(/<item[\s>]/i);
      for (let i = 1; i < parts.length && out.length < 12; i++) {
        const block = parts[i].split(/<\/item>/)[0] || '';
        const title = strip(tag(block, 'title'));
        let link = strip(tag(block, 'link'));
        const description = strip(tag(block, 'description')).slice(0, 200);
        if (!title || seen.has(title.slice(0, 50))) continue;
        seen.add(title.slice(0, 50));
        out.push({ title, url: link, summary: description });
      }
    } catch (_) {}
  }
  return out.slice(0, 10);
}

async function sendEmail(email, headlines) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'ANGVEY <onboarding@resend.dev>';
  if (!key) return { ok: false, error: 'RESEND_API_KEY missing' };

  const rows = headlines.map((h, i) =>
    `<tr><td style="padding:12px 0;border-bottom:1px solid #eee">
      <div style="font-weight:600">${i + 1}. ${esc(h.title)}</div>
      <a href="${esc(h.url || '#')}" style="color:#7c3aed;font-size:13px">Read →</a>
    </td></tr>`
  ).join('');

  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
    <h1 style="font-size:18px">ANGVEY daily digest</h1>
    <table style="width:100%">${rows}</table>
  </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'ANGVEY \u00b7 daily digest',
        html,
      }),
    });
    if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 160) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

function tag(s, name) {
  const m = s.match(new RegExp(`<${name}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${name}>|<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return (m && (m[1] || m[2])) || '';
}
function strip(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
