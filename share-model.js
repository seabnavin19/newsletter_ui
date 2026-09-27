/* ═══════════════════════════════════════════════════════════
   AI SIGNAL — Share model
   Shared by the browser (share.js / app.js) and by
   scripts/build-share-pages.js, so share URLs, item keys and
   preview text are defined in exactly one place.
═══════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const SITE = 'https://aisignal.builtbynavin.com';

  // Order matches the on-page card order in app.js buildAll().
  const SECTIONS = {
    news:    { label: 'News',            heading: 'Today in AI',         icon: '📰', color: '#4caf50' },
    github:  { label: 'GitHub',          heading: 'Trending Repos',      icon: '⭐', color: '#ff9800' },
    hf:      { label: 'HF Models',       heading: 'Hot on Hugging Face', icon: '🤗', color: '#ffb300' },
    aiblogs: { label: 'Company Updates', heading: 'AI Company Updates',  icon: '🏢', color: '#64b5f6' },
    papers:  { label: 'Papers',          heading: 'Research Drop',       icon: '📄', color: '#ba68c8' },
    youtube: { label: 'YouTube',         heading: 'Worth Watching',      icon: '▶',  color: '#ef5350' },
    jobs:    { label: 'Jobs',            heading: 'Opportunities',       icon: '💼', color: '#64b5f6' },
  };

  // Headline used when a whole card is shared ("Top 5 models on Hugging Face").
  const LIST_TITLES = {
    news:    n => `Top ${n} AI headlines today`,
    github:  n => `Top ${n} trending AI repos on GitHub`,
    hf:      n => `Top ${n} models on Hugging Face`,
    aiblogs: n => `${n} updates from AI companies`,
    papers:  n => `${n} AI research papers worth reading`,
    youtube: n => `${n} AI videos worth watching`,
    jobs:    n => `${n} new AI job openings`,
  };

  // Plain text: some feeds (e.g. Hugging Face model cards) include raw HTML/markdown.
  function str(v) {
    return String(v ?? '')
      .replace(/<[^>]*>?/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cut(v, n) {
    const s = str(v).replace(/\s+/g, ' ');
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  }

  function num(v) { return Number(v || 0).toLocaleString('en-US'); }

  function authors(a) {
    if (!Array.isArray(a) || !a.length) return '';
    return a.slice(0, 2).join(', ') + (a.length > 2 ? ' et al.' : '');
  }

  function joinMeta(parts) { return parts.filter(Boolean).join(' · '); }

  // Normalised, shareable items for a section. `key` is stable per date and is
  // what the item's DOM id and share URL are built from.
  function sectionItems(d, sec) {
    if (!d) return [];
    switch (sec) {
      case 'news': {
        const hl = (d.news?.headlines || []).map((a, i) => ({
          key: `h${i}`, title: str(a.title), url: a.url,
          meta: str(a.source), desc: str(a.summary || a.description), why: str(a.why_it_matters),
        }));
        const cm = (d.news?.community || []).slice(0, 10).map((p, i) => ({
          key: `c${i}`, title: str(p.title), url: p.url,
          meta: joinMeta([p.source || 'Community', `▲ ${num(p.points)} points`, `${num(p.comments_count)} comments`]),
          desc: '', why: '', community: true,
        }));
        return hl.concat(cm);
      }
      case 'github':
        return (d.github_repos || []).map((r, i) => ({
          key: String(i), title: str(r.name), url: r.url,
          meta: joinMeta([r.stars ? `★ ${num(r.stars)}` : '', r.stars_today ? `+${num(r.stars_today)} today` : '', str(r.language)]),
          desc: str(r.description), why: '',
        }));
      case 'hf':
        return (d.hf_models || []).map((m, i) => ({
          key: String(i), rank: m.rank || i + 1, title: str(m.name), url: m.url,
          meta: joinMeta([str(m.task), m.downloads ? `${num(m.downloads)} downloads` : '', m.likes ? `♥ ${num(m.likes)}` : '']),
          desc: str(m.description), why: '',
        }));
      case 'aiblogs':
        return (d.ai_blogs || []).map((p, i) => ({
          key: String(i), title: str(p.title), url: p.url,
          meta: str(p.source), desc: str(p.summary), why: str(p.why_it_matters),
        }));
      case 'papers':
        return (d.papers || []).slice(0, 10).map((p, i) => ({
          key: String(i), title: str(p.title), url: p.url,
          meta: authors(p.authors), desc: str(p.summary) || cut(p.abstract, 220), why: '',
        }));
      case 'youtube':
        return (d.youtube_videos || []).map((v, i) => ({
          key: String(i), title: str(v.title), url: v.url,
          meta: str(v.channel), desc: '', why: '',
        }));
      case 'jobs':
        return (d.jobs || []).map((j, i) => ({
          key: String(i), title: str(j.title), url: j.url,
          meta: joinMeta([str(j.company), str(j.location), str(j.employment_type)]), desc: '', why: '',
        }));
      default:
        return [];
    }
  }

  // Items shown when the whole card is shared. News uses headlines only.
  function listItems(d, sec) {
    const all = sectionItems(d, sec);
    const main = sec === 'news' ? all.filter(it => !it.community) : all;
    return main.map((it, i) => ({ ...it, rank: it.rank || i + 1 }));
  }

  function listTitle(sec, n) { return LIST_TITLES[sec](n); }

  function prettyDate(date) {
    return new Date(date + 'T00:00:00Z').toLocaleDateString('en-US',
      { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const KEY_RE  = /^[hc]?\d{1,3}$/;

  function isValid(date, sec, key) {
    return DATE_RE.test(date || '') && Object.prototype.hasOwnProperty.call(SECTIONS, sec)
      && (key == null || key === '' || KEY_RE.test(key));
  }

  // Static page with Open Graph tags (built by scripts/build-share-pages.js).
  function sharePath(date, sec, key) {
    return `/s/${date}/${sec}/` + (key != null && key !== '' ? `${key}/` : '');
  }

  // Where a visitor actually lands in the app.
  function appPath(date, sec, key) {
    const q = new URLSearchParams({ d: date, s: sec });
    if (key != null && key !== '') q.set('i', key);
    return `/?${q.toString()}`;
  }

  // Everything needed to render a share preview / share sheet for one target.
  function describe(d, date, sec, key) {
    const s = SECTIONS[sec];
    if (!s || !d) return null;
    const when = prettyDate(date);
    const url  = SITE + sharePath(date, sec, key);

    if (key == null || key === '') {
      const items = listItems(d, sec);
      if (!items.length) return null;
      const top   = items.slice(0, 5);
      const title = listTitle(sec, top.length);
      const description = cut(top.map(it => `${it.rank}. ${it.title}`).join('  ·  '), 290);
      return { kind: 'list', date, when, sec, section: s, key: null, title, description, items: top, total: items.length, url };
    }

    const item = sectionItems(d, sec).find(it => it.key === key);
    if (!item) return null;
    const description = cut(item.desc || item.why || item.meta || `${s.heading} — AI Signal daily briefing`, 290);
    return { kind: 'item', date, when, sec, section: s, key, title: item.title, description, item, url };
  }

  const api = { SITE, SECTIONS, sectionItems, listItems, listTitle, describe, sharePath, appPath, isValid, prettyDate, cut };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShareModel = api;
})(typeof self !== 'undefined' ? self : this);
