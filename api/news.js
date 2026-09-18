/**
 * GET /api/news — server-side RSS (no browser CORS issues)
 */
export const config = { runtime: 'edge' };

const FEEDS = [
  { url: 'https://hnrss.org/frontpage', label: 'Hacker News', cat: 'AI News' },
  { url: 'https://techcrunch.com/feed/', label: 'TechCrunch', cat: 'AI News' },
  { url: 'https://www.theverge.com/rss/index.xml', label: 'The Verge', cat: 'AI News' },
  { url: 'https://www.wired.com/feed/rss', label: 'Wired', cat: 'Market Trends' },
  { url: 'https://news.google.com/rss/search?q=artificial+intelligence+when:2d&hl=en-US&gl=US&ceid=US:en', label: 'Google News AI', cat: 'AI News' },
];

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const seen = new Set();
  const articles = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const a of r.value) {
      const key = (a.title || '').slice(0, 60).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      articles.push(a);
    }
  }
  articles.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  return json({ articles: articles.slice(0, 40) });
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'ANGVEY-News/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml, feed);
  } catch {
    return [];
  }
}

function parseRss(xml, feed) {
  const items = [];
  const parts = xml.split(/<item[\s>]/i);
  for (let i = 1; i < parts.length && items.length < 10; i++) {
    const block = parts[i].split(/<\/item>/)[0] || '';
    const title = strip(tag(block, 'title'));
    let link = strip(tag(block, 'link')) || strip(tag(block, 'guid'));
    if (link.includes('url=')) {
      try {
        const u = new URL(link);
        const real = u.searchParams.get('url');
        if (real) link = real;
      } catch {}
    }
    const desc = strip(tag(block, 'description')).slice(0, 220);
    const pubDate = strip(tag(block, 'pubDate'));
    if (!title || !link) continue;
    items.push({
      title,
      description: desc,
      link,
      pubDate,
      source: feed.label,
      category: feed.cat,
      thumbnail: '',
    });
  }
  return items;
}

function tag(s, name) {
  const m = s.match(new RegExp(`<${name}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${name}>|<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return (m && (m[1] || m[2])) || '';
}
function strip(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json' },
  });
}
