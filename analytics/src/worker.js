// AI Signal — visitor analytics (Cloudflare Worker + D1)
//
//   POST /hit                  record a page view or event (sent by the site)
//   GET  /stats?days=30        daily totals as JSON, keyed by date
//   GET  /                     small dashboard of the same numbers
//
// Privacy: raw IPs are never stored. Each visitor is a SHA-256 of
// IP + user agent + a secret that changes every day, so the same person counts
// once per day but can't be followed across days or traced back.

const TYPES = new Set(['view', 'audio_play', 'share', 'story_video']);
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|curl|wget|python|headless/i;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/hit' && req.method === 'POST') return hit(req, env, cors);

    if (url.pathname === '/stats' || url.pathname === '/') {
      if (env.STATS_TOKEN && url.searchParams.get('key') !== env.STATS_TOKEN) {
        return new Response('Unauthorized — add ?key=YOUR_STATS_TOKEN', { status: 401 });
      }
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
      const data = await stats(env, days);
      if (url.pathname === '/stats') {
        return new Response(JSON.stringify(data, null, 2), {
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        });
      }
      return new Response(dashboard(data), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    return new Response('Not found', { status: 404 });
  },
};

function corsHeaders(req, env) {
  const origin = req.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return allowed.includes(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' }
    : {};
}

async function hit(req, env, cors) {
  const ok = new Response(null, { status: 204, headers: cors });
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(req.headers.get('origin') || '')) return ok;  // ignore other sites quietly
  const ua = req.headers.get('user-agent') || '';
  if (!ua || BOT_RE.test(ua)) return ok;

  let body = {};
  try { body = JSON.parse(await req.text()); } catch { return ok; }
  const type = TYPES.has(body.type) ? body.type : 'view';

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const ip = req.headers.get('cf-connecting-ip') || '';
  const visitor = await sha256(`${day}|${env.SALT_SECRET || 'change-me'}|${ip}|${ua}`);

  await env.DB.prepare(
    'INSERT INTO hits (day, ts, type, visitor, path, ref, country, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    day, now.getTime(), type, visitor.slice(0, 32),
    clip(body.path, 200), clip(body.ref, 100),
    req.cf?.country || null,
    /mobile|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop',
  ).run();
  return ok;
}

async function stats(env, days) {
  const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
  const q = (sql) => env.DB.prepare(sql).bind(since).all().then(r => r.results);

  const [totals, refs, countries, devices] = await Promise.all([
    q(`SELECT day,
              SUM(type = 'view')                         AS visits,
              COUNT(DISTINCT CASE WHEN type = 'view' THEN visitor END) AS unique_visitors,
              SUM(type = 'audio_play')                   AS audio_plays,
              SUM(type = 'share')                        AS shares,
              SUM(type = 'story_video')                  AS story_videos
         FROM hits WHERE day >= ? GROUP BY day ORDER BY day DESC`),
    q(`SELECT day, COALESCE(NULLIF(ref, ''), 'direct') AS k, COUNT(DISTINCT visitor) AS n
         FROM hits WHERE day >= ? AND type = 'view' GROUP BY day, k ORDER BY n DESC`),
    q(`SELECT day, COALESCE(country, '??') AS k, COUNT(DISTINCT visitor) AS n
         FROM hits WHERE day >= ? AND type = 'view' GROUP BY day, k ORDER BY n DESC`),
    q(`SELECT day, device AS k, COUNT(DISTINCT visitor) AS n
         FROM hits WHERE day >= ? AND type = 'view' GROUP BY day, k ORDER BY n DESC`),
  ]);

  const out = {};
  for (const t of totals) {
    out[t.day] = {
      visits: t.visits, unique: t.unique_visitors,
      audio_plays: t.audio_plays, shares: t.shares, story_videos: t.story_videos,
      referrers: {}, countries: {}, devices: {},
    };
  }
  const fill = (rows, field) => rows.forEach(r => { if (out[r.day]) out[r.day][field][r.k] = r.n; });
  fill(refs, 'referrers'); fill(countries, 'countries'); fill(devices, 'devices');
  return out;
}

function dashboard(data) {
  const days = Object.keys(data).sort();
  const max = Math.max(1, ...days.map(d => data[d].unique));
  const rows = days.slice().reverse().map(d => {
    const s = data[d];
    const top = (o) => Object.entries(o).slice(0, 3).map(([k, n]) => `${esc(k)} ${n}`).join(' · ');
    return `<tr><td>${d}</td>
      <td><div class="bar" style="width:${(s.unique / max) * 100}%"></div><b>${s.unique}</b></td>
      <td>${s.visits}</td><td>${s.audio_plays}</td><td>${s.shares + s.story_videos}</td>
      <td class="m">${top(s.referrers)}</td><td class="m">${top(s.countries)}</td></tr>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Signal visitors</title>
<style>
  body{font:14px system-ui,sans-serif;margin:24px;background:#111;color:#e8e8e8}
  h1{font-size:18px} table{border-collapse:collapse;width:100%} td,th{padding:6px 8px;border-bottom:1px solid #2b2b2b;text-align:left;white-space:nowrap}
  th{color:#999;font-weight:500;font-size:12px} td:nth-child(2){width:40%;position:relative}
  .bar{position:absolute;left:0;top:6px;bottom:6px;background:rgba(76,175,80,.35);border-radius:3px}
  b{position:relative;padding-left:6px} .m{color:#999;font-size:12px} a{color:#4caf50}
  @media(max-width:700px){.m{display:none}}
</style>
<h1>AI Signal — daily visitors</h1>
<p class="m">Raw JSON: <a id="json" href="stats">/stats</a></p>
<script>document.getElementById('json').href = 'stats' + location.search;</script>
<table><tr><th>Day (UTC)</th><th>Unique visitors</th><th>Views</th><th>Audio plays</th><th>Shares</th><th>Top sources</th><th>Top countries</th></tr>${rows || '<tr><td colspan=7>No visits yet.</td></tr>'}</table>`;
}

function clip(v, n) { return typeof v === 'string' ? v.slice(0, n) : null; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
