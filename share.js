'use strict';

/* ═══════════════════════════════════════════════════════════
   AI SIGNAL — Sharing
   · ShareImage: draws branded share images on a <canvas>
     (Story 9:16, Post 1:1, and 1200×630 link-preview covers)
   · ShareSheet: the share dialog (native share, Facebook, X,
     LinkedIn, WhatsApp, Telegram, Reddit, copy link, download)
═══════════════════════════════════════════════════════════ */

const ShareImage = (() => {
  const { SITE, SECTIONS, listTitle } = window.ShareModel;
  const HOST = SITE.replace(/^https?:\/\//, '');

  const FORMATS = {
    story:  { w: 1080, h: 1920, pad: 88, k: 1    },
    square: { w: 1080, h: 1080, pad: 72, k: 0.78 },
    og:     { w: 1200, h: 630,  pad: 64, k: 0.62 },
  };

  const C = {
    bg1: '#0c0f0d', bg2: '#141c16',
    t1: '#f2f2f2', t2: '#b4b4b4', t3: '#7a7a7a', line: 'rgba(255,255,255,0.09)',
    accent: '#4caf50', accentBg: 'rgba(76,175,80,0.12)',
    gold: '#ffd54f', silver: '#b0bec5', bronze: '#d7a07a',
  };

  const SERIF = 'Lora, Georgia, serif';
  const SANS  = '"DM Sans", -apple-system, "Segoe UI", sans-serif';
  const MONO  = '"JetBrains Mono", Menlo, monospace';

  const font = (w, px, fam) => `${w} ${Math.round(px)}px ${fam}`;

  async function ensureFonts() {
    if (!document.fonts?.load) return;
    try {
      await Promise.all([
        '700 60px Lora', '400 40px Lora', '600 40px Lora',
        '600 40px "DM Sans"', '500 40px "DM Sans"', '400 40px "DM Sans"',
        '500 40px "JetBrains Mono"', '400 40px "JetBrains Mono"',
      ].map(f => document.fonts.load(f)));
    } catch { /* fall back to system fonts */ }
  }

  // ── Text helpers ─────────────────────────────────────────

  function spaced(ctx, text, x, y, spacing) {
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = `${spacing}px`;
      ctx.fillText(text, x, y);
      ctx.letterSpacing = '0px';
      return;
    }
    for (const ch of text) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + spacing; }
  }

  // Word-wrap with hard breaks for very long tokens (repo/model names, URLs).
  function wrap(ctx, text, maxW, maxLines) {
    const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines = [];
    let line = '';
    let truncated = false;

    const pushToken = tok => {
      // Break a single token that is wider than the line on its own.
      while (ctx.measureText(tok).width > maxW) {
        let i = tok.length - 1;
        while (i > 1 && ctx.measureText(tok.slice(0, i)).width > maxW) i--;
        lines.push(tok.slice(0, i));
        tok = tok.slice(i);
      }
      return tok;
    };

    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line) lines.push(line);
      line = pushToken(w);
      if (lines.length >= maxLines) break;
    }
    if (line) lines.push(line);

    if (lines.length > maxLines) { lines.length = maxLines; truncated = true; }
    if (truncated) {
      let last = lines[maxLines - 1];
      while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last.replace(/[\s,.;:–—-]+$/, '') + '…';
    }
    return lines;
  }

  function drawLines(ctx, lines, x, y, lh) {
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
    return lines.length * lh;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hexPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i - Math.PI / 2;
      const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  // ── Frame: background, header, footer ────────────────────

  function background(ctx, f, color) {
    const g = ctx.createLinearGradient(0, 0, f.w * 0.4, f.h);
    g.addColorStop(0, C.bg2);
    g.addColorStop(1, C.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, f.w, f.h);

    // Soft glow in the section colour, top-right.
    const r = Math.max(f.w, f.h) * 0.6;
    const glow = ctx.createRadialGradient(f.w, 0, 0, f.w, 0, r);
    glow.addColorStop(0, hexA(color, 0.22));
    glow.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, f.w, f.h);

    // Faint oversized hexagon motif.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 3;
    hexPath(ctx, f.w * 0.92, f.h * 0.1, f.w * 0.36); ctx.stroke();
    hexPath(ctx, f.w * 0.92, f.h * 0.1, f.w * 0.22); ctx.stroke();
    ctx.restore();

    // Accent rail on the left edge.
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, Math.round(10 * f.k), f.h);
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }

  function logo(ctx, x, y, s) {
    const cx = x + s / 2, cy = y + s / 2;
    ctx.save();
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = Math.max(2, s * 0.05);
    hexPath(ctx, cx, cy, s * 0.46); ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = Math.max(1, s * 0.018);
    hexPath(ctx, cx, cy, s * 0.26); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.accent;
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.125, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function header(ctx, f, when) {
    const k = f.k, s = 66 * k, x = f.pad, y = f.pad;
    logo(ctx, x, y, s);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.t1;
    ctx.font = font(600, 40 * k, SANS);
    ctx.fillText('AI Signal', x + s + 20 * k, y + s * 0.52);
    ctx.fillStyle = C.t3;
    ctx.font = font(500, 18 * k, SANS);
    spaced(ctx, 'DAILY INTELLIGENCE BRIEFING', x + s + 21 * k, y + s * 0.52 + 30 * k, 3 * k);

    if (when) {
      ctx.font = font(500, 26 * k, MONO);
      ctx.fillStyle = C.t2;
      const tw = ctx.measureText(when).width;
      ctx.fillText(when, f.w - f.pad - tw, y + s * 0.52 + 8 * k);
    }
    return y + s;
  }

  // Returns the y where the footer begins.
  function footer(ctx, f, cta) {
    const k = f.k, x = f.pad, w = f.w - f.pad * 2;
    const h = 132 * k;
    const y = f.h - f.pad - h;

    ctx.save();
    roundRect(ctx, x, y, w, h, 22 * k);
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = C.t3;
    ctx.font = font(500, 24 * k, SANS);
    ctx.fillText(cta, x + 36 * k, y + 52 * k);
    ctx.fillStyle = C.accent;
    ctx.font = font(600, 36 * k, SANS);
    ctx.fillText(HOST, x + 36 * k, y + 98 * k);

    // Arrow button
    const bs = 72 * k, bx = x + w - 30 * k - bs, by = y + (h - bs) / 2;
    roundRect(ctx, bx, by, bs, bs, bs / 2);
    ctx.fillStyle = C.accent;
    ctx.fill();
    ctx.strokeStyle = '#0c0f0d';
    ctx.lineWidth = 5 * k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const ax = bx + bs / 2, ay = by + bs / 2, a = 13 * k;
    ctx.beginPath();
    ctx.moveTo(ax - a, ay + a); ctx.lineTo(ax + a, ay - a);
    ctx.moveTo(ax - a * 0.4, ay - a); ctx.lineTo(ax + a, ay - a); ctx.lineTo(ax + a, ay + a * 0.4);
    ctx.stroke();
    ctx.restore();
    return y;
  }

  function sectionChip(ctx, f, section, y) {
    const k = f.k;
    ctx.fillStyle = section.color;
    roundRect(ctx, f.pad, y, 8 * k, 34 * k, 4 * k);
    ctx.fill();
    ctx.font = font(600, 26 * k, SANS);
    spaced(ctx, section.heading.toUpperCase(), f.pad + 26 * k, y + 27 * k, 4 * k);
    return y + 34 * k;
  }

  // ── Layout engine: measure-then-draw blocks, shrink until it fits ────────

  function fit(ctx, avail, variants) {
    for (const v of variants) {
      const blocks = v();
      const h = blocks.reduce((sum, b) => sum + b.h, 0);
      if (h <= avail) return { blocks, h };
    }
    const blocks = variants[variants.length - 1]();
    return { blocks, h: blocks.reduce((s, b) => s + b.h, 0) };
  }

  function textBlock(ctx, text, { size, weight = 400, fam = SANS, color = C.t1, lh = 1.3, maxW, lines = 3, gap = 0 }) {
    ctx.font = font(weight, size, fam);
    const L = text ? wrap(ctx, text, maxW, lines) : [];
    const lineH = size * lh;
    return {
      h: L.length ? L.length * lineH + gap : 0,
      draw(x, y) {
        ctx.font = font(weight, size, fam);
        ctx.fillStyle = color;
        drawLines(ctx, L, x, y + size, lineH);
      },
    };
  }

  function rankColor(r) { return r === 1 ? C.gold : r === 2 ? C.silver : r === 3 ? C.bronze : C.t3; }

  function listLayout(ctx, f, m, top, bottom) {
    const k = f.k, maxW = f.w - f.pad * 2;
    const isStory = f.h > f.w;
    const nameFam = (m.sec === 'hf' || m.sec === 'github') ? MONO : SANS;
    const nameWeight = nameFam === MONO ? 500 : 600;

    const variants = [];
    const descOpts = isStory ? [2, 1, 0] : [1, 0];
    const counts = [];
    for (let n = m.items.length; n >= Math.min(3, m.items.length); n--) counts.push(n);

    for (const n of counts) for (const dl of descOpts) for (const s of [1, 0.9, 0.82, 0.74]) {
      variants.push(() => {
        const blocks = [];
        // Title follows the number of rows that actually fit ("Top 4 …" on a tight post).
        blocks.push(textBlock(ctx, listTitle(m.sec, n), { size: 76 * k * s, weight: 700, fam: SERIF, lh: 1.16, maxW, lines: 3, gap: 46 * k * s }));
        const rankW = 92 * k * s;
        m.items.slice(0, n).forEach((it, i) => {
          const tb = textBlock(ctx, it.title, { size: 40 * k * s, weight: nameWeight, fam: nameFam, lh: 1.26, maxW: maxW - rankW, lines: 2 });
          const mb = textBlock(ctx, it.meta, { size: 25 * k * s, weight: 500, color: C.t3, lh: 1.3, maxW: maxW - rankW, lines: 1 });
          const db = dl ? textBlock(ctx, it.desc, { size: 28 * k * s, fam: SERIF, color: C.t2, lh: 1.4, maxW: maxW - rankW, lines: dl }) : { h: 0, draw() {} };
          const padY = 26 * k * s;
          const inner = tb.h + (mb.h ? mb.h + 6 * k : 0) + (db.h ? db.h + 8 * k : 0);
          blocks.push({
            h: inner + padY * 2,
            draw(x0, y0) {
              if (i > 0) { ctx.fillStyle = C.line; ctx.fillRect(x0, y0, maxW, 2); }
              ctx.font = font(500, 44 * k * s, MONO);
              ctx.fillStyle = rankColor(it.rank);
              ctx.fillText(`${it.rank}`.padStart(2, '0'), x0, y0 + padY + 40 * k * s);
              let yy = y0 + padY;
              tb.draw(x0 + rankW, yy); yy += tb.h;
              if (mb.h) { yy += 6 * k; mb.draw(x0 + rankW, yy); yy += mb.h; }
              if (db.h) { yy += 8 * k; db.draw(x0 + rankW, yy); }
            },
          });
        });
        if (n < m.total) {
          blocks.push(textBlock(ctx, `+ ${m.total - n} more in today's briefing`, { size: 26 * k * s, weight: 500, color: C.t3, maxW, lines: 1, gap: 14 * k }));
        }
        return blocks;
      });
    }
    return fit(ctx, bottom - top, variants);
  }

  function itemLayout(ctx, f, m, top, bottom) {
    const k = f.k, maxW = f.w - f.pad * 2;
    const it = m.item;
    const isStory = f.h > f.w;
    const titleFam = (m.sec === 'hf' || m.sec === 'github') ? MONO : SERIF;
    const variants = [];

    for (const s of [1, 0.92, 0.84, 0.76, 0.68, 0.6]) {
      variants.push(() => {
        const blocks = [];
        if (it.meta) blocks.push(textBlock(ctx, it.meta, { size: 28 * k * s, weight: 500, color: C.t2, maxW, lines: 1, gap: 22 * k * s }));
        blocks.push(textBlock(ctx, it.title, { size: (titleFam === MONO ? 64 : 78) * k * s, weight: titleFam === MONO ? 500 : 700, fam: titleFam, lh: 1.2, maxW, lines: isStory ? 6 : 4, gap: 34 * k * s }));
        if (it.desc) blocks.push(textBlock(ctx, it.desc, { size: 38 * k * s, fam: SERIF, color: C.t2, lh: 1.5, maxW, lines: isStory ? 7 : 4, gap: 30 * k * s }));
        if (it.why) {
          const padX = 32 * k * s, padY = 28 * k * s;
          const label = textBlock(ctx, 'WHY IT MATTERS', { size: 22 * k * s, weight: 700, color: C.accent, maxW, lines: 1, gap: 10 * k * s });
          const body = textBlock(ctx, it.why, { size: 34 * k * s, fam: SERIF, color: C.t1, lh: 1.5, maxW: maxW - padX * 2, lines: isStory ? 6 : 3 });
          const h = label.h + body.h + padY * 2;
          blocks.push({
            h,
            draw(x, y) {
              ctx.fillStyle = C.accentBg;
              roundRect(ctx, x, y, maxW, h, 14 * k); ctx.fill();
              ctx.fillStyle = C.accent;
              ctx.fillRect(x, y, 7 * k, h);
              label.draw(x + padX, y + padY);
              body.draw(x + padX, y + padY + label.h);
            },
          });
        }
        return blocks;
      });
    }
    return fit(ctx, bottom - top, variants);
  }

  // ── Audio briefing: title, top headlines and a player-style waveform ─────

  const WAVE_BARS = 56;

  // Stand-in waveform for the still image, stable per date.
  function fakePeaks(seedStr) {
    let seed = [...seedStr].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    return Array.from({ length: WAVE_BARS }, (_, i) => 0.3 + 0.7 * Math.abs(Math.sin(i * 0.45)) * (0.55 + 0.45 * rnd()));
  }

  function fmtClock(s) {
    s = Math.max(0, Math.floor(s || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // Play button + waveform + times; `progress` 0..1 colours the played part.
  function drawWave(ctx, r, m, progress) {
    const { x, y, w, h, k } = r;
    const peaks = m.peaks || fakePeaks(m.date);
    ctx.save();
    roundRect(ctx, x, y, w, h, 28 * k);
    ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fill();
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();

    const pad = 34 * k, bs = 96 * k;
    const bx = x + pad, by = y + (h - bs) / 2;
    ctx.fillStyle = C.accent;
    ctx.beginPath(); ctx.arc(bx + bs / 2, by + bs / 2, bs / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0c0f0d';
    ctx.beginPath();
    ctx.moveTo(bx + bs * 0.4, by + bs * 0.3);
    ctx.lineTo(bx + bs * 0.72, by + bs * 0.5);
    ctx.lineTo(bx + bs * 0.4, by + bs * 0.7);
    ctx.closePath(); ctx.fill();

    const wx = bx + bs + 30 * k, ww = x + w - pad - wx;
    const wh = h - 104 * k, wy = y + 30 * k;
    const step = ww / peaks.length, bw = Math.max(3, step * 0.55);
    const played = progress * peaks.length;
    peaks.forEach((p, i) => {
      const bh = Math.max(6 * k, p * wh);
      ctx.fillStyle = i < played ? C.accent : 'rgba(255,255,255,0.22)';
      roundRect(ctx, wx + i * step, wy + (wh - bh) / 2, bw, bh, bw / 2);
      ctx.fill();
    });

    ctx.font = font(500, 26 * k, MONO);
    ctx.fillStyle = C.t2;
    const ty = y + h - 30 * k;
    ctx.fillText(fmtClock(progress * m.duration), wx, ty);
    const total = m.duration ? fmtClock(m.duration) : '';
    ctx.fillText(total, wx + ww - ctx.measureText(total).width, ty);
    ctx.restore();
  }

  function audioLayout(ctx, f, m, top, bottom) {
    const k = f.k, maxW = f.w - f.pad * 2;
    const isStory = f.h > f.w;
    const variants = [];
    for (const n of isStory ? [3, 2, 1] : [2, 1, 0]) for (const s of [1, 0.9, 0.8, 0.7]) {
      variants.push(() => {
        const blocks = [];
        blocks.push(textBlock(ctx, m.title, { size: 84 * k * s, weight: 700, fam: SERIF, lh: 1.14, maxW, lines: 3, gap: 26 * k * s }));
        blocks.push(textBlock(ctx, 'The day’s top AI stories, read aloud. Tap the link to listen.', { size: 34 * k * s, fam: SERIF, color: C.t2, lh: 1.45, maxW, lines: 2, gap: 48 * k * s }));
        const waveH = 230 * k;
        blocks.push({ h: waveH + 48 * k * s, wave: true, draw() {} , waveH });
        if (n) blocks.push(textBlock(ctx, 'IN THIS EPISODE', { size: 22 * k * s, weight: 700, color: C.accent, maxW, lines: 1, gap: 16 * k * s }));
        m.items.slice(0, n).forEach((it, i) => {
          const tb = textBlock(ctx, it.title, { size: 34 * k * s, weight: 500, fam: SANS, lh: 1.3, maxW: maxW - 56 * k, lines: 2 });
          const padY = 18 * k * s;
          blocks.push({
            h: tb.h + padY * 2,
            draw(x0, y0) {
              if (i > 0) { ctx.fillStyle = C.line; ctx.fillRect(x0, y0, maxW, 2); }
              ctx.font = font(500, 30 * k * s, MONO);
              ctx.fillStyle = C.t3;
              ctx.fillText(String(i + 1).padStart(2, '0'), x0, y0 + padY + 32 * k * s);
              tb.draw(x0 + 56 * k, y0 + padY);
            },
          });
        });
        return blocks;
      });
    }
    return fit(ctx, bottom - top, variants);
  }

  // ── Public renderers ─────────────────────────────────────

  // opts.wave: false leaves the waveform area empty (the video draws it per frame).
  // The waveform's rectangle is returned on canvas.waveRect.
  async function render(model, format = 'story', opts = {}) {
    await ensureFonts();
    const f = FORMATS[format];
    const cv = document.createElement('canvas');
    cv.width = f.w; cv.height = f.h;
    const ctx = cv.getContext('2d');
    const color = model.section.color;

    background(ctx, f, color);
    const k = f.k;
    const hb = header(ctx, f, model.when);
    const cta = model.kind === 'list' ? 'See the full list & links'
      : model.kind === 'audio' ? 'Listen to the full briefing'
      : 'Read more in today\'s AI briefing';
    const ft = footer(ctx, f, cta);

    ctx.fillStyle = color;
    const chipBottom = sectionChip(ctx, f, model.section, hb + (f.h > f.w ? 110 : 56) * k);

    const top = chipBottom + 40 * k;
    const bottom = ft - 40 * k;
    const layout = model.kind === 'list' ? listLayout : model.kind === 'audio' ? audioLayout : itemLayout;
    const { blocks, h } = layout(ctx, f, model, top, bottom);

    // Stories: centre the content vertically in the free space; posts: top-align.
    let y = f.h > f.w ? top + Math.max(0, (bottom - top - h) * 0.35) : top;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, top - 4, f.w, bottom - top + 8); ctx.clip();
    for (const b of blocks) {
      if (b.wave) {
        cv.waveRect = { x: f.pad, y, w: f.w - f.pad * 2, h: b.waveH, k };
        if (opts.wave !== false) drawWave(ctx, cv.waveRect, model, opts.progress ?? 0.32);
      } else b.draw(f.pad, y);
      y += b.h;
    }
    ctx.restore();
    return cv;
  }

  // 1200×630 link-preview cover for a section (or the whole site when sec is null).
  async function renderCover(sec) {
    await ensureFonts();
    const f = FORMATS.og, x = f.pad;
    const section = sec ? SECTIONS[sec] : { heading: 'Daily Intelligence Briefing', color: C.accent };
    const cv = document.createElement('canvas');
    cv.width = f.w; cv.height = f.h;
    const ctx = cv.getContext('2d');

    background(ctx, { ...f, k: 1 }, section.color);

    const s = 64;
    logo(ctx, x, f.pad, s);
    ctx.fillStyle = C.t1;
    ctx.font = font(600, 38, SANS);
    ctx.fillText('AI Signal', x + s + 20, f.pad + 44);

    ctx.fillStyle = section.color;
    roundRect(ctx, x, 200, 8, 34, 4); ctx.fill();
    ctx.font = font(600, 24, SANS);
    spaced(ctx, sec ? 'TODAY ON AI SIGNAL' : 'EVERY DAY, IN ONE PLACE', x + 26, 226, 4);

    const heading = sec ? section.heading : 'What matters in AI today';
    ctx.fillStyle = C.t1;
    ctx.font = font(700, 76, SERIF);
    const L = wrap(ctx, heading, f.w - x * 2 - 160, 2);
    drawLines(ctx, L, x, 330, 90);

    ctx.fillStyle = C.t2;
    ctx.font = font(400, 30, SERIF);
    const sub = sec
      ? 'Handpicked daily by AI Signal — tap to open the full list.'
      : 'News, papers, repos, models, videos & jobs — curated daily.';
    ctx.fillText(sub, x, 330 + L.length * 90 + 10);

    ctx.fillStyle = C.accent;
    ctx.font = font(600, 30, SANS);
    ctx.fillText(HOST, x, f.h - f.pad);
    return cv;
  }

  function toBlob(cv) {
    return new Promise(res => cv.toBlob(res, 'image/jpeg', 0.92));
  }

  return { render, renderCover, toBlob, drawWave, WAVE_BARS, FORMATS };
})();

// ── Story video: the audio briefing as a 9:16 MP4 for Facebook / Instagram Stories ──
// Stories take images or video, not audio, so the clip is the story card with an
// animated waveform over the briefing's audio. Encoded on-device with WebCodecs.

const ShareVideo = (() => {
  const FPS = 15;
  const W = 1080, H = 1920;
  const MUXER_SRC = 'assets/vendor/mp4-muxer-5.1.3.js';

  // H.264 + AAC is what every story uploader accepts; VP9 + Opus is the fallback.
  const CODECS = [
    { video: 'avc1.640028', mux: 'avc', audio: 'mp4a.40.2', muxAudio: 'aac' },
    { video: 'vp09.00.40.08', mux: 'vp9', audio: 'opus', muxAudio: 'opus' },
  ];

  let codecPromise;
  function pickCodec(sampleRate = 44100, channels = 1) {
    if (codecPromise) return codecPromise;
    codecPromise = (async () => {
      if (!window.VideoEncoder || !window.AudioEncoder || !window.VideoFrame) return null;
      for (const c of CODECS) {
        try {
          const v = await VideoEncoder.isConfigSupported({ codec: c.video, width: W, height: H, bitrate: 1_500_000, framerate: FPS });
          const sr = c.audio === 'opus' ? 48000 : sampleRate;
          const a = await AudioEncoder.isConfigSupported({ codec: c.audio, sampleRate: sr, numberOfChannels: channels, bitrate: 96_000 });
          if (v.supported && a.supported) return { ...c, sampleRate: sr };
        } catch { /* try next */ }
      }
      return null;
    })();
    return codecPromise;
  }

  async function supported() { return !!(await pickCodec()); }

  let muxerPromise;
  function loadMuxer() {
    if (window.Mp4Muxer) return Promise.resolve(window.Mp4Muxer);
    muxerPromise ??= new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = MUXER_SRC;
      s.onload = () => res(window.Mp4Muxer);
      s.onerror = () => { muxerPromise = null; rej(new Error('muxer')); };
      document.head.appendChild(s);
    });
    return muxerPromise;
  }

  async function decode(src, sampleRate) {
    const buf = await (await fetch(src)).arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, sampleRate);
    return ctx.decodeAudioData(buf);
  }

  function peaksOf(audio, n) {
    const d = audio.getChannelData(0), size = Math.floor(d.length / n), out = [];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = i * size; j < (i + 1) * size; j += 16) sum += d[j] * d[j];
      out.push(Math.sqrt(sum / (size / 16)));
    }
    const max = Math.max(...out) || 1;
    return out.map(v => 0.18 + 0.82 * (v / max));
  }

  // Returns a Blob (video/mp4). `seconds` caps the length; onProgress gets 0..1.
  async function create(model, { seconds = Infinity, onProgress = () => {} } = {}) {
    const codec = await pickCodec();
    if (!codec) throw new Error('unsupported');
    const [Mux, audio] = await Promise.all([loadMuxer(), decode(model.src, codec.sampleRate)]);

    const duration = Math.min(audio.duration, seconds);
    const m = { ...model, duration, peaks: peaksOf(audio, ShareImage.WAVE_BARS) };
    // Waveform progress tracks the clip; the clock shows real time in the episode.
    const base = await ShareImage.render({ ...m, duration: audio.duration }, 'story', { wave: false });
    const rect = base.waveRect;

    const muxer = new Mux.Muxer({
      target: new Mux.ArrayBufferTarget(),
      video: { codec: codec.mux, width: W, height: H, frameRate: FPS },
      audio: { codec: codec.muxAudio, numberOfChannels: 1, sampleRate: codec.sampleRate },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });

    let failure = null;
    const ve = new VideoEncoder({ output: (c, meta) => muxer.addVideoChunk(c, meta), error: e => { failure = e; } });
    ve.configure({ codec: codec.video, width: W, height: H, bitrate: 1_500_000, framerate: FPS });
    const ae = new AudioEncoder({ output: (c, meta) => muxer.addAudioChunk(c, meta), error: e => { failure = e; } });
    ae.configure({ codec: codec.audio, sampleRate: codec.sampleRate, numberOfChannels: 1, bitrate: 96_000 });

    // Audio: feed the decoded PCM in ~1s chunks.
    const pcm = audio.getChannelData(0);
    const total = Math.floor(duration * codec.sampleRate);
    const CH = codec.sampleRate;
    for (let i = 0; i < total; i += CH) {
      const frames = Math.min(CH, total - i);
      const data = new AudioData({
        format: 'f32-planar', sampleRate: codec.sampleRate, numberOfFrames: frames, numberOfChannels: 1,
        timestamp: Math.round(i / codec.sampleRate * 1e6), data: pcm.slice(i, i + frames),
      });
      ae.encode(data);
      data.close();
    }

    // Video: the still card with the waveform filling up.
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const n = Math.ceil(duration * FPS);
    for (let i = 0; i < n; i++) {
      if (failure) throw failure;
      const t = i / FPS;
      ctx.drawImage(base, 0, 0);
      ShareImage.drawWave(ctx, rect, { ...m, duration: audio.duration }, t / audio.duration);
      const frame = new VideoFrame(cv, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / FPS) });
      ve.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();
      if (ve.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 0));
      if (i % FPS === 0) { onProgress(i / n); await new Promise(r => setTimeout(r, 0)); }
    }

    await Promise.all([ve.flush(), ae.flush()]);
    if (failure) throw failure;
    ve.close(); ae.close();
    muxer.finalize();
    onProgress(1);
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  }

  return { supported, create };
})();

// ── Share sheet ─────────────────────────────────────────────────────────────

const ShareSheet = (() => {
  const ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>`;

  const TARGETS = [
    { id: 'facebook', label: 'Facebook', color: '#1877f2',
      href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}`,
      svg: '<path fill="currentColor" d="M14 8.5V6.7c0-.8.2-1.2 1.4-1.2H17V2.2A21 21 0 0 0 14.6 2C12.2 2 10.6 3.5 10.6 6.2v2.3H8v3.3h2.6V22H14V11.8h2.7l.4-3.3H14Z"/>' },
    { id: 'x', label: 'X', color: '#000',
      href: (u, t) => `https://twitter.com/intent/tweet?text=${enc(t)}&url=${enc(u)}`,
      svg: '<path fill="currentColor" d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.3l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.7 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z"/>' },
    { id: 'linkedin', label: 'LinkedIn', color: '#0a66c2',
      href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(u)}`,
      svg: '<path fill="currentColor" d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11.5H3V9.75Zm6.5 0h3.8v1.6h.06c.53-1 1.84-2.05 3.8-2.05 4.05 0 4.8 2.66 4.8 6.12v5.83h-4v-5.17c0-1.23-.02-2.82-1.72-2.82-1.72 0-1.98 1.34-1.98 2.73v5.26h-4V9.75Z"/>' },
    { id: 'whatsapp', label: 'WhatsApp', color: '#25d366',
      href: (u, t) => `https://wa.me/?text=${enc(`${t} ${u}`)}`,
      svg: '<path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.2-.3-.2-.5-.3Z"/>' },
    { id: 'telegram', label: 'Telegram', color: '#229ed9',
      href: (u, t) => `https://t.me/share/url?url=${enc(u)}&text=${enc(t)}`,
      svg: '<path fill="currentColor" d="M21.5 3.5 2.7 10.9c-1.2.5-1.2 1.2-.2 1.5l4.8 1.5 1.9 5.8c.2.6.4.9.9.9.4 0 .6-.2.9-.5l2.2-2.1 4.6 3.4c.8.5 1.4.2 1.6-.8l3-14c.3-1.3-.4-1.8-1.3-1.4Z"/>' },
    { id: 'reddit', label: 'Reddit', color: '#ff4500',
      href: (u, t) => `https://www.reddit.com/submit?url=${enc(u)}&title=${enc(t)}`,
      svg: '<path fill="currentColor" d="M22 12.1a2.2 2.2 0 0 0-3.7-1.6 10.8 10.8 0 0 0-5.8-1.8l1-4.6 3.2.7a1.6 1.6 0 1 0 .2-1l-3.6-.8a.5.5 0 0 0-.6.4l-1.1 5.3a10.8 10.8 0 0 0-5.9 1.8A2.2 2.2 0 1 0 3.3 14a4.3 4.3 0 0 0 0 .7c0 3.4 3.9 6.1 8.7 6.1s8.7-2.7 8.7-6.1a4.3 4.3 0 0 0 0-.7 2.2 2.2 0 0 0 1.3-1.9ZM7 13.7a1.6 1.6 0 1 1 1.6 1.6A1.6 1.6 0 0 1 7 13.7Zm9 4.2a5.8 5.8 0 0 1-4 1.2 5.8 5.8 0 0 1-4-1.2.4.4 0 0 1 .6-.6 4.9 4.9 0 0 0 3.4 1 4.9 4.9 0 0 0 3.4-1 .4.4 0 1 1 .6.6Zm-.4-2.6a1.6 1.6 0 1 1 1.6-1.6 1.6 1.6 0 0 1-1.6 1.6Z"/>' },
  ];

  const enc = encodeURIComponent;
  const escH = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let $root, $img, $title, $sub, $link, $native, $nativeLbl, $hint, $toast;
  let $video, $videoBtn, $videoLbl, $videoBar, $videoHint, $videoDl;
  let video = null, videoLen = '60', videoSeq = 0; // video: { blob, len } once made
  let model = null, format = 'story', lastFocus = null, renderSeq = 0;
  const cache = {}; // format -> { blob, url }

  function build() {
    $root = document.createElement('div');
    $root.className = 'share-modal';
    $root.hidden = true;
    $root.innerHTML = `
      <div class="share-backdrop" data-close></div>
      <div class="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div class="share-top">
          <div class="share-heading">
            <span class="share-kicker" id="share-sub"></span>
            <span class="share-title" id="share-title"></span>
          </div>
          <button class="share-x" type="button" data-close aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
          </button>
        </div>

        <div class="share-body">
          <div class="share-preview">
            <div class="share-formats" role="tablist" aria-label="Image format">
              <button type="button" role="tab" data-format="story" aria-selected="true">Story <em>9:16</em></button>
              <button type="button" role="tab" data-format="square" aria-selected="false">Post <em>1:1</em></button>
            </div>
            <div class="share-frame"><img id="share-img" alt="Share image preview"></div>
          </div>

          <div class="share-actions">
            <div class="share-video" id="share-video" hidden>
              <div class="share-label">Story video with audio</div>
              <div class="share-formats share-lengths" role="radiogroup" aria-label="Video length">
                <button type="button" role="radio" data-len="60" aria-checked="true">First 60s</button>
                <button type="button" role="radio" data-len="full" aria-checked="false">Full episode</button>
              </div>
              <button type="button" class="share-primary" id="share-video-btn">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3"/></svg>
                <span id="share-video-lbl">Create story video</span>
                <span class="share-video-bar" id="share-video-bar"></span>
              </button>
              <button type="button" class="share-secondary" data-action="download-video" hidden>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>Download video</span>
              </button>
              <p class="share-hint" id="share-video-hint"></p>
              <div class="share-label">Or share an image</div>
            </div>

            <button type="button" class="share-primary" id="share-native">
              ${ICON}<span id="share-native-lbl">Share image</span>
            </button>
            <button type="button" class="share-secondary" data-action="download">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Download image</span>
            </button>
            <p class="share-hint" id="share-hint"></p>

            <div class="share-label">Share link</div>
            <div class="share-targets">
              ${TARGETS.map(t => `
                <a class="share-target" data-target="${t.id}" target="_blank" rel="noopener" style="--brand:${t.color}">
                  <span class="share-target-ico"><svg width="18" height="18" viewBox="0 0 24 24">${t.svg}</svg></span>
                  <span>${t.label}</span>
                </a>`).join('')}
            </div>

            <div class="share-linkrow">
              <input class="share-link" id="share-link" type="text" readonly aria-label="Share link">
              <button type="button" class="share-copy" data-action="copy">Copy</button>
            </div>
          </div>
        </div>
        <div class="share-toast" id="share-toast" role="status" aria-live="polite"></div>
      </div>`;
    document.body.appendChild($root);

    $img = $root.querySelector('#share-img');
    $title = $root.querySelector('#share-title');
    $sub = $root.querySelector('#share-sub');
    $link = $root.querySelector('#share-link');
    $native = $root.querySelector('#share-native');
    $nativeLbl = $root.querySelector('#share-native-lbl');
    $hint = $root.querySelector('#share-hint');
    $toast = $root.querySelector('#share-toast');
    $video = $root.querySelector('#share-video');
    $videoBtn = $root.querySelector('#share-video-btn');
    $videoLbl = $root.querySelector('#share-video-lbl');
    $videoBar = $root.querySelector('#share-video-bar');
    $videoHint = $root.querySelector('#share-video-hint');
    $videoDl = $root.querySelector('[data-action="download-video"]');
    $videoBtn.addEventListener('click', videoAction);

    $root.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) return close();
      const fmt = e.target.closest('[data-format]');
      if (fmt) return setFormat(fmt.dataset.format);
      const act = e.target.closest('[data-action]');
      if (act?.dataset.action === 'copy') return copyLink();
      if (act?.dataset.action === 'download') return download();
      if (act?.dataset.action === 'download-video') return downloadVideo();
      const len = e.target.closest('[data-len]');
      if (len) return setVideoLen(len.dataset.len);
    });
    $native.addEventListener('click', nativeShare);
    $link.addEventListener('focus', () => $link.select());
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$root.hidden) close(); });
  }

  function shareText() { return `${model.title} — via AI Signal`; }

  function canShareFiles() {
    try {
      const f = new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' });
      return !!(navigator.canShare && navigator.canShare({ files: [f] }));
    } catch { return false; }
  }

  function open(m) {
    if (!m) return;
    window.aisTrack?.('share');
    if (!$root) build();
    model = m;
    Object.keys(cache).forEach(k => { URL.revokeObjectURL(cache[k].url); delete cache[k]; });

    lastFocus = document.activeElement;
    $title.textContent = m.title;
    $sub.textContent = m.kind === 'list' ? `Share card · ${m.section.heading}` : `Share · ${m.section.heading}`;
    setupVideo(m);
    $link.value = m.url;
    $root.querySelectorAll('[data-target]').forEach(a => {
      const t = TARGETS.find(x => x.id === a.dataset.target);
      a.href = t.href(m.url, shareText());
    });

    const files = canShareFiles();
    $native.hidden = !files && !navigator.share;
    $nativeLbl.textContent = files ? 'Share to Story / apps' : 'Share…';
    $hint.textContent = files
      ? 'Pick Facebook or Instagram Stories in the share menu. We copy the link for you — paste it into a link sticker.'
      : 'For Facebook or Instagram Stories: download the image, add it to your story, then add the link as a sticker.';

    $root.hidden = false;
    document.body.classList.add('share-open');
    requestAnimationFrame(() => $root.classList.add('is-open'));
    setFormat(format);
    $root.querySelector('.share-x').focus();
  }

  function close() {
    if (!$root || $root.hidden) return;
    $root.classList.remove('is-open');
    document.body.classList.remove('share-open');
    setTimeout(() => { $root.hidden = true; }, 180);
    if (lastFocus?.focus) lastFocus.focus();
  }

  async function ensureImage(fmt) {
    if (cache[fmt]) return cache[fmt];
    const cv = await ShareImage.render(model, fmt);
    const blob = await ShareImage.toBlob(cv);
    cache[fmt] = { blob, url: URL.createObjectURL(blob) };
    return cache[fmt];
  }

  async function setFormat(fmt) {
    format = fmt;
    $root.querySelectorAll('[data-format]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.format === fmt)));
    $root.querySelector('.share-frame').dataset.format = fmt;
    const seq = ++renderSeq;
    $img.removeAttribute('src');
    $root.classList.add('is-rendering');
    const img = await ensureImage(fmt);
    if (seq !== renderSeq) return;
    $img.src = img.url;
    $root.classList.remove('is-rendering');
  }

  // ── Story video (audio briefing only) ──────────────────

  function canShareVideo() {
    try {
      const f = new File([new Blob(['x'], { type: 'video/mp4' })], 'x.mp4', { type: 'video/mp4' });
      return !!(navigator.canShare && navigator.canShare({ files: [f] }));
    } catch { return false; }
  }

  function dropVideo() {
    videoSeq++;
    if (video) URL.revokeObjectURL(video.url);
    video = null;
  }

  async function setupVideo(m) {
    dropVideo();
    $video.hidden = true;
    if (m.kind !== 'audio') return;
    resetVideoUi();
    const ok = await ShareVideo.supported();
    if (model !== m) return;
    $video.hidden = !ok;
    if (!ok) $hint.textContent = 'Your browser can’t make story videos. Download the image, add it to your Facebook story, then add the link as a sticker so people can listen.';
  }

  function resetVideoUi() {
    $videoLbl.textContent = 'Create story video';
    $videoBar.style.width = '0';
    $videoBtn.disabled = false;
    $videoDl.hidden = true;
    $videoHint.textContent = 'Makes a 9:16 video of this card with the audio playing — Facebook and Instagram Stories accept video, not audio files.';
  }

  function setVideoLen(len) {
    if (len === videoLen) return;
    videoLen = len;
    $root.querySelectorAll('[data-len]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.len === len)));
    dropVideo();
    resetVideoUi();
  }

  function videoName() { return `ai-signal-${model.date}-audio-story.mp4`; }

  async function videoAction() {
    if (video) return shareVideo();
    const seq = ++videoSeq;
    $videoBtn.disabled = true;
    $videoLbl.textContent = 'Making video… 0%';
    try {
      const blob = await ShareVideo.create(model, {
        seconds: videoLen === 'full' ? Infinity : 60,
        onProgress: p => {
          if (seq !== videoSeq) return;
          $videoLbl.textContent = `Making video… ${Math.round(p * 100)}%`;
          $videoBar.style.width = `${p * 100}%`;
        },
      });
      if (seq !== videoSeq) return;
      video = { blob, url: URL.createObjectURL(blob) };
      window.aisTrack?.('story_video');
      $videoBtn.disabled = false;
      $videoBar.style.width = '0';
      $videoDl.hidden = !canShareVideo();  // otherwise the main button already downloads
      if (canShareVideo()) {
        $videoLbl.textContent = 'Share video to Story';
        $videoHint.textContent = 'Pick Facebook → Story in the share menu. We copy the link for you — paste it into a link sticker so people can hear the rest.';
      } else {
        $videoLbl.textContent = 'Download video';
        $videoHint.textContent = 'Video ready. Upload it to your Facebook story from your phone, and add the link as a sticker.';
      }
    } catch (e) {
      if (seq !== videoSeq) return;
      console.error(e);
      resetVideoUi();
      $videoHint.textContent = 'Couldn’t make the video on this device — share the image below instead.';
    }
  }

  async function shareVideo() {
    if (!canShareVideo()) return downloadVideo();
    copyLink(true);
    try {
      const file = new File([video.blob], videoName(), { type: 'video/mp4' });
      await navigator.share({ files: [file], title: model.title, text: `${shareText()}\n${model.url}` });
    } catch (e) {
      if (e?.name !== 'AbortError') toast('Sharing isn’t available here — use Download video.');
    }
  }

  function downloadVideo() {
    if (!video) return;
    const a = document.createElement('a');
    a.href = video.url;
    a.download = videoName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('Video saved');
  }

  function fileName() {
    return `ai-signal-${model.date}-${model.sec}${model.key ? '-' + model.key : ''}-${format}.jpg`;
  }

  async function nativeShare() {
    const text = shareText();
    try {
      if (canShareFiles()) {
        copyLink(true);
        const { blob } = await ensureImage(format);
        const file = new File([blob], fileName(), { type: 'image/jpeg' });
        await navigator.share({ files: [file], title: model.title, text: `${text}\n${model.url}` });
      } else {
        await navigator.share({ title: model.title, text, url: model.url });
      }
    } catch (e) {
      if (e?.name !== 'AbortError') toast('Sharing isn’t available here — use Download or a link below.');
    }
  }

  async function download() {
    const { url } = await ensureImage(format);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('Image saved');
  }

  async function copyLink(quiet) {
    const v = model.url;
    let ok = false;
    try { await navigator.clipboard.writeText(v); ok = true; }
    catch {
      $link.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
    }
    if (!quiet || ok) toast(ok ? 'Link copied' : 'Copy the link from the box below');
  }

  let toastTimer;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2200);
  }

  return { open, close, ICON };
})();
