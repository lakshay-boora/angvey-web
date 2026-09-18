/**
 * POST /api/subscribe
 * Env: RESEND_API_KEY, RESEND_FROM, DIGEST_WEBHOOK
 */
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body;
  try { body = await req.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !/^[\^\s@]+@[\^\s@]+\.[\^\s@]+$/.test(email)) {
    return json({ error: 'Valid email required' }, 400);
  }

  const cadence = body.cadence || 'daily';
  const topics = Array.isArray(body.topics) ? body.topics : [];
  const sample = !!body.sample;
  const headlines = Array.isArray(body.headlines) ? body.headlines : [];

  const webhook = process.env.DIGEST_WEBHOOK;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: sample ? 'sample' : 'subscribe',
          email, cadence, topics,
          enabled: cadence !== 'off',
          at: new Date().toISOString(),
        }),
      });
    } catch (_) {}
  }

  if (sample || process.env.RESEND_API_KEY) {
    const sent = await sendDigestEmail({ email, cadence, topics, headlines, sample });
    if (!sent.ok && sample) {
      return json({
        ok: false,
        error: sent.error || 'Email provider not configured',
        hint: 'Set RESEND_API_KEY and RESEND_FROM in Vercel env, or DIGEST_WEBHOOK.',
      }, 502);
    }
  }

  return json({
    ok: true,
    email,
    cadence,
    topics,
    sample,
    message: sample
      ? 'Sample digest dispatched (if email provider configured).'
      : 'Subscription recorded. Cron /api/cron/digest runs daily at 03:00 UTC.',
  });
}

async function sendDigestEmail({ email, cadence, topics, headlines, sample }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'ANGVEY <onboarding@resend.dev>';
  if (!key) return { ok: false, error: 'RESEND_API_KEY not set' };

  const rows = (headlines || []).slice(0, 8).map((h, i) => {
    const title = escapeHtml(h.title || 'Untitled');
    const summary = escapeHtml(h.summary || h.description || '');
    const url = h.url || h.link || '#';
    return `<tr><td style="padding:14px 0;border-bottom:1px solid #eee">
      <div style="font-weight:600;color:#111;font-size:15px">${i + 1}. ${title}</div>
      ${summary ? `<div style="font-size:13px;color:#555;margin-top:4px;line-height:1.45">${summary}</div>` : ''}
      <a href="${escapeAttr(url)}" style="font-size:13px;color:#7c3aed;display:inline-block;margin-top:6px">Continue reading →</a>
    </td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f6f6f8;font-family:Inter,system-ui,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px">
    <div style="background:#111;color:#fff;border-radius:14px 14px 0 0;padding:20px 22px">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7">ANGVEY</div>
      <h1 style="margin:6px 0 0;font-size:20px">${sample ? 'Sample digest' : escapeHtml(String(cadence)) + ' digest'}</h1>
    </div>
    <div style="background:#fff;border-radius:0 0 14px 14px;padding:8px 22px 22px;border:1px solid #e8e8ec;border-top:none">
      <p style="color:#666;font-size:13px">Topics: ${escapeHtml((topics || []).join(', ') || 'All')}</p>
      <table style="width:100%;border-collapse:collapse">${rows || '<tr><td style="color:#888;padding:12px 0">No headlines attached.</td></tr>'}</table>
      <p style="font-size:12px;color:#999;margin-top:20px">You receive this because you enabled digests in ANGVEY Library.</p>
    </div>
  </div></body></html>`;

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
        subject: sample ? 'ANGVEY \u00b7 sample digest' : `ANGVEY \u00b7 ${cadence} digest`,
        html,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: t.slice(0, 200) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
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
