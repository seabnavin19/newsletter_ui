'use strict';

// ── Theme ─────────────────────────────────────────────────────────────────────

// Remove the no-transition class after two animation frames so the initial
// theme paint is instant, but user-triggered toggles animate smoothly.
requestAnimationFrame(() => requestAnimationFrame(() => {
  document.documentElement.classList.remove('no-transition');
}));

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ais-theme', next);
});

// ── Mobile sidebar ────────────────────────────────────────────────────────────

const $sidebar  = document.getElementById('sidebar');
const $overlay  = document.getElementById('sidebar-overlay');
const $menuBtn  = document.getElementById('menu-btn');

function closeSidebar() {
  $sidebar.classList.remove('open');
  $overlay.classList.remove('active');
  document.body.style.overflow = '';
}

$menuBtn.addEventListener('click', () => {
  const isOpen = $sidebar.classList.contains('open');
  if (isOpen) {
    closeSidebar();
  } else {
    $sidebar.classList.add('open');
    $overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
});

$overlay.addEventListener('click', closeSidebar);

document.addEventListener('click', e => {
  if (e.target.closest('.nav-item') && window.innerWidth <= 768) {
    setTimeout(closeSidebar, 120);
  }
});

// ── State ─────────────────────────────────────────────────────────────────────

let dates = [];
let idx   = 0;
let current = null;   // { date, data } currently rendered
let pendingFocus = null;  // { s, i } from a shared link (?d=&s=&i=)

const $content    = document.getElementById('content');
const $dateSelect = document.getElementById('date-select');
const $prevBtn    = document.getElementById('prev-btn');
const $nextBtn    = document.getElementById('next-btn');
const $sideDate   = document.getElementById('sidebar-date');
const $topDate    = document.getElementById('top-date');
const $topStats   = document.getElementById('top-stats');
const $sideNav    = document.getElementById('sidebar-nav');

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const r = await fetch('data/index.json');
    if (!r.ok) throw 0;
    const data = await r.json();
    dates = data.dates || [];
    if (!dates.length) { showMsg('No data available yet.'); return; }

    dates.forEach(d => {
      const o = document.createElement('option');
      o.value = d;
      o.textContent = shortDate(d);
      $dateSelect.appendChild(o);
    });

    const q = new URLSearchParams(location.search);
    const qd = q.get('d');
    idx = qd && dates.includes(qd) ? dates.indexOf(qd) : dates.length - 1;
    if (qd === dates[idx] && ShareModel.isValid(qd, q.get('s'), q.get('i'))) {
      pendingFocus = { s: q.get('s'), i: q.get('i') };
    }
    $dateSelect.value = dates[idx];
    syncNav();
    await load(dates[idx]);
  } catch { showMsg('Could not load newsletter index.'); }
}

async function load(date) {
  $content.innerHTML = `<div class="blank-state"><div class="blank-spinner">⬡</div><span>Acquiring signal…</span></div>`;
  $topStats.innerHTML  = '';
  $sideNav.innerHTML   = '';
  $sideDate.textContent = longDate(date);
  $topDate.textContent  = longDate(date);

  try {
    const r = await fetch(`data/${date}.json`);
    if (!r.ok) throw 0;
    const d = await r.json();
    current = { date, data: d };
    const { html, stats, nav } = buildAll(d);

    $content.innerHTML = `<div class="sections-grid">${html}</div>`;

    $topStats.innerHTML = stats.map(s =>
      `<div class="stat-pill"><span>${s.icon}</span><span class="stat-n">${s.n}</span><span>${s.lbl}</span></div>`
    ).join('');

    $sideNav.innerHTML = nav.map(n =>
      `<a class="nav-item" href="#sec-${n.id}" onclick="jumpTo('${n.id}');return false;">
         <span class="nav-ico">${n.icon}</span>
         <span class="nav-lbl">${n.label}</span>
         <span class="nav-cnt">${n.n}</span>
       </a>`
    ).join('');

    initExpandBtns();
    focusPending();
  } catch { showMsg('No data available for this date.'); }
}

// Keep the address bar shareable when browsing other days.
function setUrlDate(date) {
  const url = date === dates[dates.length - 1] ? location.pathname : `?d=${date}`;
  history.replaceState(null, '', url);
}

function showMsg(msg) {
  $content.innerHTML = `<div class="blank-state"><span>${esc(msg)}</span></div>`;
}

function syncNav() {
  $prevBtn.disabled = idx === 0;
  $nextBtn.disabled = idx === dates.length - 1;
}

$prevBtn.addEventListener('click', async () => {
  if (idx > 0) { idx--; $dateSelect.value = dates[idx]; syncNav(); setUrlDate(dates[idx]); await load(dates[idx]); }
});

$nextBtn.addEventListener('click', async () => {
  if (idx < dates.length - 1) { idx++; $dateSelect.value = dates[idx]; syncNav(); setUrlDate(dates[idx]); await load(dates[idx]); }
});

$dateSelect.addEventListener('change', async e => {
  idx = dates.indexOf(e.target.value); syncNav(); setUrlDate(e.target.value); await load(e.target.value);
});

function jumpTo(id) {
  const el = document.getElementById(`sec-${id}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function longDate(s) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US',
    { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

function shortDate(s) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', year: 'numeric' });
}

function ago(iso) {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cut(v, n) { const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; }

// ── Card wrapper ──────────────────────────────────────────────────────────────

function card(id, accent, icon, title, n, body, cls = '') {
  return `<div class="sec-card ${cls}" id="sec-${id}">
    <div class="sec-head">
      <div class="sec-accent ${accent}"></div>
      <span class="sec-icon">${icon}</span>
      <span class="sec-title">${title}</span>
      ${n ? `<span class="sec-count">${n}</span>` : ''}
      <button class="share-btn share-btn-card" type="button" data-share-sec="${id}" aria-label="Share ${esc(title)}" title="Share this card">${ShareSheet.ICON}<span>Share</span></button>
    </div>
    ${body}
  </div>`;
}

// Icon button that shares one item; `key` must match ShareModel.sectionItems().
function shareBtn(sec, key) {
  return `<button class="share-btn share-btn-item" type="button" data-share-sec="${sec}" data-share-key="${key}" aria-label="Share" title="Share">${ShareSheet.ICON}</button>`;
}

function itemAttrs(sec, key) {
  return `id="it-${sec}-${key}" data-share-item`;
}

// ── Build all ─────────────────────────────────────────────────────────────────

function buildAll(d) {
  const html = [], stats = [], nav = [];

  function push(id, accent, icon, label, heading, result, cls) {
    if (!result) return;
    html.push(card(id, accent, icon, heading, result.n, result.body, cls));
    stats.push({ icon, n: result.n, lbl: label });
    nav.push({ id, icon, label, n: result.n });
  }

  push('news',     'c-cyan',   '📰', 'News',            'Today in AI',         buildNews(d.news),              'sec-full');
  push('github',   'c-yellow', '⭐', 'GitHub',          'Trending Repos',      buildGithub(d.github_repos),    'sec-half');
  push('hf',       'c-green',  '🤗', 'HF Models',       'Hot on Hugging Face', buildHF(d.hf_models),           'sec-half');
  push('aiblogs',  'c-blue',   '🏢', 'Company Updates', 'AI Company Updates',  buildAIBlogs(d.ai_blogs),       'sec-half');
  push('papers',   'c-orange', '📄', 'Papers',          'Research Drop',       buildPapers(d.papers),          'sec-half');
  push('youtube',  'c-red',    '▶', 'YouTube',         'Worth Watching',      buildYoutube(d.youtube_videos),  'sec-half');
  push('jobs',     'c-purple', '💼', 'Jobs',            'Opportunities',       buildJobs(d.jobs),              'sec-half');

  return { html: html.join(''), stats, nav };
}

// ── Section builders ──────────────────────────────────────────────────────────

function renderHeadlineItem(a, i) {
  const featured = i === 0;
  const key = `h${i}`;
  const summary = a.summary ? `<div class="item-desc">${esc(a.summary)}</div>` : '';
  const why = a.why_it_matters
    ? `<div class="item-why"><span class="why-label">Why it matters</span><span class="why-text">${esc(a.why_it_matters)}</span></div>`
    : '';
  if (featured) return `
    <div class="item-featured" ${itemAttrs('news', key)}>
      ${shareBtn('news', key)}
      <div class="featured-label">Top Story</div>
      <div class="item-meta">
        <span class="meta-tag">${esc(a.source)}</span>
        <span class="meta-dot">·</span>
        <span class="meta-tag">${ago(a.published_at)}</span>
      </div>
      <a class="item-link" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>
      ${summary}${why}
    </div>`;
  return `
    <div class="item" ${itemAttrs('news', key)}>
      ${shareBtn('news', key)}
      <div class="item-meta">
        <span class="meta-tag">${esc(a.source)}</span>
        <span class="meta-dot">·</span>
        <span class="meta-tag">${ago(a.published_at)}</span>
      </div>
      <a class="item-link" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>
      ${summary}${why}
    </div>`;
}

function renderCommunityItem(p, i) {
  return `
    <div class="item" ${itemAttrs('news', `c${i}`)}>
      ${shareBtn('news', `c${i}`)}
      <a class="item-link" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>
      <div class="item-meta">
        <span class="meta-tag">▲ ${(p.points || 0).toLocaleString()}</span>
        <span class="meta-dot">·</span>
        <span class="meta-tag">💬 ${(p.comments_count || 0).toLocaleString()}</span>
      </div>
    </div>`;
}

function buildNewsCol(items, renderFn, emptyMsg, visibleCount = 3) {
  if (!items.length) return `<div class="empty-row">${emptyMsg}</div>`;
  const visible = items.slice(0, visibleCount).map((item, i) => renderFn(item, i)).join('');
  const rest    = items.slice(visibleCount);
  const more    = rest.length
    ? `<div class="news-more hidden">${rest.map((item, i) => renderFn(item, i + visibleCount)).join('')}</div>
       <button class="expand-btn">Show ${rest.length} more →</button>`
    : '';
  return visible + more;
}

function buildNews(news) {
  if (!news) return null;
  const hl    = news.headlines || [];
  const cm    = (news.community || []).slice(0, 10);
  const total = hl.length + cm.length;
  if (!total) return null;

  const hlBody = buildNewsCol(hl, (a, i) => renderHeadlineItem(a, i),  'No headlines today.');
  const cmBody = buildNewsCol(cm, (p, i) => renderCommunityItem(p, i), 'No community posts today.', Infinity);

  const body = `
    <div class="news-cols">
      <div class="news-col">
        <div class="news-col-head">Headlines <span class="news-col-count">${hl.length}</span></div>
        ${hlBody}
      </div>
      <div class="news-col">
        <div class="news-col-head">Community <span class="news-col-count">${cm.length}</span></div>
        ${cmBody}
      </div>
    </div>`;

  return { n: total, body };
}

function buildPapers(papers) {
  if (!papers?.length) return null;
  const body = papers.slice(0, 10).map((p, i) => {
    const auth = Array.isArray(p.authors)
      ? p.authors.slice(0, 2).join(', ') + (p.authors.length > 2 ? ' et al.' : '')
      : '';
    const desc = p.summary || cut(p.abstract, 180);
    return `
      <div class="item" ${itemAttrs('papers', i)}>
        ${shareBtn('papers', i)}
        ${auth ? `<div class="item-meta"><span class="meta-tag">${esc(auth)}</span></div>` : ''}
        <a class="item-link" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>
        ${desc ? `<div class="item-desc">${esc(desc)}</div>` : ''}
      </div>`;
  }).join('');
  return { n: papers.length, body };
}

function buildGithub(repos) {
  if (!repos?.length) return null;
  const body = repos.map((r, i) => `
    <div class="repo" ${itemAttrs('github', i)}>
      ${shareBtn('github', i)}
      <div class="repo-name">
        <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>
      </div>
      ${r.description ? `<div class="repo-desc">${esc(cut(r.description, 120))}</div>` : ''}
      <div class="repo-footer">
        ${r.stars ? `<span class="repo-stars">★ ${Number(r.stars).toLocaleString()}</span>` : ''}
        ${r.language ? `<span class="lang-pill">${esc(r.language)}</span>` : ''}
      </div>
    </div>`).join('');
  return { n: repos.length, body };
}

function buildYoutube(videos) {
  if (!videos?.length) return null;
  const body = videos.map((v, i) => `
    <div class="item" ${itemAttrs('youtube', i)}>
      ${shareBtn('youtube', i)}
      <div class="item-meta">
        <span class="meta-tag play-src">▶ ${esc(v.channel)}</span>
        <span class="meta-dot">·</span>
        <span class="meta-tag">${ago(v.published_at)}</span>
      </div>
      <a class="item-link" href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>
    </div>`).join('');
  return { n: videos.length, body };
}

function buildHF(models) {
  if (!models?.length) return null;
  const body = models.map((m, i) => {
    const rc = m.rank === 1 ? 'hf-rank-gold' : m.rank === 2 ? 'hf-rank-silver' : m.rank === 3 ? 'hf-rank-bronze' : '';
    const desc = m.description ? `<div class="item-desc">${esc(m.description)}</div>` : '';
    return `
      <div class="hf-row" ${itemAttrs('hf', i)}>
        ${shareBtn('hf', i)}
        <span class="hf-rank ${rc}">#${m.rank}</span>
        <span class="hf-name">
          <a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.name)}</a>
          ${desc}
        </span>
      </div>`;
  }).join('');
  return { n: models.length, body };
}

function buildAIBlogs(posts) {
  if (!posts?.length) return null;
  const body = posts.map((p, i) => {
    const desc = p.summary ? `<div class="item-desc">${esc(p.summary)}</div>` : '';
    const why = p.why_it_matters
      ? `<div class="item-why"><span class="why-label">Why it matters</span><span class="why-text">${esc(p.why_it_matters)}</span></div>`
      : '';
    return `
      <div class="item" ${itemAttrs('aiblogs', i)}>
        ${shareBtn('aiblogs', i)}
        <div class="item-meta">
          <span class="meta-tag">${esc(p.source)}</span>
          <span class="meta-dot">·</span>
          <span class="meta-tag">${ago(p.published_at)}</span>
        </div>
        <a class="item-link" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>
        ${desc}${why}
      </div>`;
  }).join('');
  return { n: posts.length, body };
}

function buildJobs(jobs) {
  if (!jobs?.length) return null;
  const body = jobs.map((j, i) => `
    <div class="job" ${itemAttrs('jobs', i)}>
      ${shareBtn('jobs', i)}
      <div class="job-title">
        <a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.title)}</a>
      </div>
      <div class="job-company">${esc(j.company)}</div>
      <div class="job-info">
        <span class="job-tag">📍 ${esc(j.location)}</span>
        ${j.employment_type ? `<span class="job-tag">· ${esc(j.employment_type)}</span>` : ''}
      </div>
    </div>`).join('');
  return { n: jobs.length, body };
}

function initExpandBtns() {
  document.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => revealMore(btn.previousElementSibling));
  });
}

function revealMore(more) {
  if (!more) return;
  more.classList.remove('hidden');
  const btn = more.nextElementSibling;
  if (btn?.classList.contains('expand-btn')) btn.style.display = 'none';
}

// ── Sharing ───────────────────────────────────────────────────────────────────

$content.addEventListener('click', e => {
  const btn = e.target.closest('[data-share-sec]');
  if (!btn || !current) return;
  e.preventDefault();
  const model = ShareModel.describe(current.data, current.date, btn.dataset.shareSec, btn.dataset.shareKey ?? null);
  ShareSheet.open(model);
});

// Scroll to and highlight the card / item a shared link points at.
function focusPending() {
  if (!pendingFocus) return;
  const { s, i } = pendingFocus;
  pendingFocus = null;
  const el = document.getElementById(i ? `it-${s}-${i}` : `sec-${s}`) || document.getElementById(`sec-${s}`);
  if (!el) return;
  revealMore(el.closest('.news-more'));
  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: 'smooth', block: i ? 'center' : 'start' });
    el.classList.add('share-focus');
    setTimeout(() => el.classList.remove('share-focus'), 2600);
  });
}

init();

// ── Telegram channel widget ──────────────────────────────────────────────────

(function () {
  const STORAGE_KEY = 'ais-tg-minimized';
  const SHOW_DELAY  = 1400;

  const $widget = document.getElementById('tg-widget');
  const $fab    = document.getElementById('tg-fab');
  const $close  = document.getElementById('tg-close');

  if (!$widget || !$fab || !$close) return;

  function minimize() {
    $widget.classList.remove('tg-card-open');
    $widget.classList.add('tg-fab-open');
    localStorage.setItem(STORAGE_KEY, '1');
  }

  function expand() {
    $widget.classList.remove('tg-fab-open');
    $widget.classList.add('tg-card-open');
    localStorage.removeItem(STORAGE_KEY);
  }

  if (localStorage.getItem(STORAGE_KEY) === '1') {
    $widget.classList.add('tg-fab-open');
  } else {
    setTimeout(expand, SHOW_DELAY);
  }

  $close.addEventListener('click', minimize);
  $fab.addEventListener('click', expand);
})();
