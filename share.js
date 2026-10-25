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

  // k scales the design system's 1080px-frame sizes to each canvas.
  const FORMATS = {
    story:  { w: 1080, h: 1920, pad: 64, k: 1    },
    square: { w: 1080, h: 1080, pad: 64, k: 0.78 },
    og:     { w: 1200, h: 630,  pad: 64, k: 0.62 },
  };

  // AI Signal design system: the studio palette.
  const C = {
    bg: '#f2f2f2', vigTop: '#cfcfcf', vigTop2: '#e9e9e9', vigBot: '#cdcdcd', vigBot2: '#e6e6e6',
    surface: '#ffffff', ink: '#1a1a1a', soft: '#555555', dim: '#8c8c8c',
    track: '#e6e6e6', muted: '#bdbdbd', teal: '#2fb3a0',
  };

  const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';

  const font = (w, px) => `${w} ${Math.round(px)}px ${SANS}`;

  async function ensureFonts() {
    if (!document.fonts?.load) return;
    try {
      await Promise.all([500, 600, 700, 800, 900].map(w => document.fonts.load(`${w} 40px Inter`)));
    } catch { /* fall back to system fonts */ }
  }

  // ── Text helpers ─────────────────────────────────────────

  // Tracking in em, as the type styles specify it (−0.045em captions, +0.14em labels).
  function track(ctx, size, em) {
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(size * em).toFixed(2)}px`;
  }

  function untrack(ctx) {
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  function label(ctx, text, x, y, size, color) {
    ctx.font = font(800, size);
    ctx.fillStyle = color;
    track(ctx, size, 0.14);
    ctx.fillText(text, x, y);
    const w = ctx.measureText(text).width;
    untrack(ctx);
    return w;
  }

  // Word-wrap with hard breaks for very long tokens (repo/model names, URLs).
  function wrap(ctx, text, maxW, maxLines) {
    const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines = [];
    let line = '';
    let truncated = false;

    const pushToken = tok => {
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

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // shadow-lg: light from the top-left, shadow falling down-right.
  const SHADOW_LG = [[20, 26, 36, 0.15], [4, 6, 10, 0.06]];
  const SHADOW_SM = [[8, 10, 14, 0.2]];

  function lifted(ctx, k, shadow, paint) {
    ctx.save();
    for (const [ox, oy, blur, a] of shadow) {
      ctx.shadowColor = `rgba(0,0,0,${a})`;
      ctx.shadowOffsetX = ox * k;
      ctx.shadowOffsetY = oy * k;
      ctx.shadowBlur = blur * k;
      paint();
    }
    ctx.restore();
  }

  // A floating white card (radius-card) or pill.
  function floatRect(ctx, k, x, y, w, h, r, fill = C.surface, shadow = SHADOW_LG) {
    lifted(ctx, k, shadow, () => { ctx.fillStyle = fill; roundRect(ctx, x, y, w, h, r); ctx.fill(); });
  }

  // ── Frame: studio, header, footer ────────────────────────

  function background(ctx, f) {
    const g = ctx.createLinearGradient(0, 0, 0, f.h);
    g.addColorStop(0, C.vigTop);
    g.addColorStop(200 / 1920, C.vigTop2);
    g.addColorStop(420 / 1920, C.bg);
    g.addColorStop(0.82, C.bg);
    g.addColorStop(1760 / 1920, C.vigBot2);
    g.addColorStop(1, C.vigBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, f.w, f.h);

    // Faint white glow behind the subject.
    const r = Math.max(f.w, f.h) * 0.55;
    const glow = ctx.createRadialGradient(f.w * 0.5, f.h * 0.45, 0, f.w * 0.5, f.h * 0.45, r);
    glow.addColorStop(0, 'rgba(255,255,255,0.6)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, f.w, f.h);
  }

  // AI Signal logo: Sig, the pixel robot (same mark as assets/logo.svg).
  const LOGO_PIX = ['.....yy.....', '.....nn.....', '.bbbbbbbbbb.', 'bbbbbbbbbbbb', 'bbwwwwwwwwbb', 'bbwwwwwwwwbb',
    'bbwwwwwwwwbb', 'bbwwwwwwwwbb', 'bbbbbbbbbbbb', '.bbbbbbbbbb.', '..bb....bb..'];
  const LOGO_PAL = { y: '#F4BF4A', n: '#1F7F72', b: '#2FB3A0', w: '#EFFBF9' };

  function drawMark(ctx, x, y, s) {
    const u = s / 13, ox = x + u * 0.5, oy = y + u;
    LOGO_PIX.forEach((row, r) => [...row].forEach((ch, c) => {
      if (!LOGO_PAL[ch]) return;
      ctx.fillStyle = LOGO_PAL[ch];
      ctx.fillRect(ox + c * u, oy + r * u, u + 0.5, u + 0.5);
    }));
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(ox + 3.1 * u, oy + 5.25 * u, 0.8 * u, 1.5 * u);
    ctx.fillRect(ox + 8.1 * u, oy + 5.25 * u, 0.8 * u, 1.5 * u);
  }

  // The mark floats like every other object: drawn once with a soft shadow.
  function logo(ctx, x, y, s, k) {
    const off = document.createElement('canvas');
    off.width = Math.ceil(s); off.height = Math.ceil(s);
    drawMark(off.getContext('2d'), 0, 0, s);
    lifted(ctx, k, SHADOW_SM, () => ctx.drawImage(off, x, y));
  }

  // Lockup: mark + "AI Signal" (wordmark) + "DAILY BRIEFING" (label).
  function lockup(ctx, x, y, s, k) {
    logo(ctx, x, y, s, k);
    const tx = x + s + 20 * k;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.ink;
    ctx.font = font(900, 44 * k);
    track(ctx, 44 * k, -0.025);
    ctx.fillText('AI Signal', tx, y + s * 0.56);
    untrack(ctx);
    label(ctx, 'DAILY BRIEFING', tx + 2 * k, y + s * 0.56 + 30 * k, 17 * k, C.soft);
  }

  function header(ctx, f, when) {
    const k = f.k, s = 72 * k, x = f.pad, y = f.pad + 32 * k;
    lockup(ctx, x, y, s, k);
    if (when) {
      ctx.font = font(600, 26 * k);
      ctx.fillStyle = C.soft;
      track(ctx, 26 * k, 0.02);
      const tw = ctx.measureText(when).width;
      ctx.fillText(when, f.w - f.pad - tw, y + s * 0.56);
      untrack(ctx);
    }
    return y + s;
  }

  // A floating pill: call to action and the site address, black arrow button. Returns its top.
  function footer(ctx, f, cta) {
    const k = f.k, x = f.pad, w = f.w - f.pad * 2;
    const h = 136 * k;
    const y = f.h - f.pad - h;

    floatRect(ctx, k, x, y, w, h, h / 2);

    ctx.fillStyle = C.soft;
    ctx.font = font(600, 24 * k);
    ctx.fillText(cta, x + 52 * k, y + 56 * k);
    ctx.fillStyle = C.ink;
    ctx.font = font(800, 36 * k);
    track(ctx, 36 * k, -0.03);
    ctx.fillText(HOST, x + 52 * k, y + 100 * k);
    untrack(ctx);

    const bs = 88 * k, bx = x + w - 24 * k - bs, by = y + (h - bs) / 2;
    ctx.save();
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(bx + bs / 2, by + bs / 2, bs / 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.surface;
    ctx.lineWidth = 5.5 * k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const ax = bx + bs / 2, ay = by + bs / 2, a = 14 * k;
    ctx.beginPath();
    ctx.moveTo(ax - a, ay + a); ctx.lineTo(ax + a, ay - a);
    ctx.moveTo(ax - a * 0.4, ay - a); ctx.lineTo(ax + a, ay - a); ctx.lineTo(ax + a, ay + a * 0.4);
    ctx.stroke();
    ctx.restore();
    return y;
  }

  // Category pill: surface pill, a dot in the section colour, uppercase label.
  function categoryPill(ctx, k, x, y, text, color) {
    const size = 24 * k, h = 62 * k, dot = 16 * k, padL = 24 * k, gap = 14 * k, padR = 28 * k;
    ctx.font = font(800, size);
    track(ctx, size, 0.14);
    const tw = ctx.measureText(text).width;
    untrack(ctx);
    const w = padL + dot + gap + tw + padR;
    floatRect(ctx, k, x, y, w, h, h / 2);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x + padL + dot / 2, y + h / 2, dot / 2, 0, Math.PI * 2); ctx.fill();
    label(ctx, text, x + padL + dot + gap, y + h / 2 + size * 0.36, size, C.ink);
    return y + h;
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

  function textBlock(ctx, text, { size, weight = 500, color = C.ink, lh = 1.3, trackEm = 0, maxW, lines = 3, gap = 0 }) {
    ctx.font = font(weight, size);
    track(ctx, size, trackEm);
    const L = text ? wrap(ctx, text, maxW, lines) : [];
    untrack(ctx);
    const lineH = size * lh;
    return {
      h: L.length ? L.length * lineH + gap : 0,
      draw(x, y) {
        ctx.font = font(weight, size);
        ctx.fillStyle = color;
        track(ctx, size, trackEm);
        L.forEach((l, i) => ctx.fillText(l, x, y + size + i * lineH));
        untrack(ctx);
      },
    };
  }

  // The signature line: regular 500 words, numbers in black 900, and the
  // trailing word in heavy grey (ink-dim, 800). Short titles stay one weight.
  function headlineBlock(ctx, text, { size, lh = 1.1, maxW, lines = 3, gap = 0, base = 500 }) {
    const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const styleOf = (w, i) => {
      if (words.length >= 3 && i === words.length - 1) return { weight: 800, color: C.dim };
      if (/^[$€£]?\d[\d.,]*[%kKmMbBxX+]*$/.test(w)) return { weight: 900, color: C.ink };
      return { weight: base, color: C.ink };
    };
    const measure = (w, st) => { ctx.font = font(st.weight, size); return ctx.measureText(w).width; };

    track(ctx, size, -0.045);
    ctx.font = font(base, size);
    const space = ctx.measureText(' ').width;
    const out = [[]];
    let lineW = 0, truncated = false;
    for (let i = 0; i < words.length; i++) {
      const st = styleOf(words[i], i);
      let w = words[i], ww = measure(w, st);
      // A single token wider than the line (a repo name): fall back to plain wrapping.
      if (ww > maxW) { untrack(ctx); return textBlock(ctx, text, { size, weight: 700, lh, trackEm: -0.03, maxW, lines, gap }); }
      const line = out[out.length - 1];
      if (line.length && lineW + space + ww > maxW) {
        if (out.length === lines) { truncated = true; break; }
        out.push([]); lineW = 0;
      }
      const cur = out[out.length - 1];
      lineW += (cur.length ? space : 0) + ww;
      cur.push({ w, st, ww });
    }
    if (truncated) {
      const last = out[out.length - 1];
      const tail = last[last.length - 1];
      tail.w = tail.w.replace(/[,.;:–—-]+$/, '') + '…';
    }
    untrack(ctx);
    const lineH = size * lh;
    return {
      h: out.length * lineH + gap,
      draw(x, y) {
        track(ctx, size, -0.045);
        out.forEach((line, li) => {
          let xx = x;
          line.forEach(({ w, st }) => {
            ctx.font = font(st.weight, size);
            ctx.fillStyle = st.color;
            ctx.fillText(w, xx, y + size * 0.92 + li * lineH);
            xx += ctx.measureText(w).width + space;
          });
        });
        untrack(ctx);
      },
    };
  }

  // A floating white card around inner blocks (card-pad inside).
  function cardBlock(ctx, k, maxW, inner, { pad = 48 * k, gap = 0 } = {}) {
    const ih = inner.reduce((s, b) => s + b.h, 0);
    const h = ih + pad * 2;
    return {
      h: h + gap,
      draw(x, y) {
        floatRect(ctx, k, x, y, maxW, h, 40 * k);
        let yy = y + pad;
        for (const b of inner) { b.draw(x + pad, yy); yy += b.h; }
      },
    };
  }

  function spacer(h) { return { h, draw() {} }; }

  function listLayout(ctx, f, m, top, bottom) {
    const k = f.k, maxW = f.w - f.pad * 2;
    const isStory = f.h > f.w;
    const color = m.section.color;

    const variants = [];
    const descOpts = isStory ? [2, 1, 0] : [1, 0];
    const counts = [];
    for (let n = m.items.length; n >= Math.min(3, m.items.length); n--) counts.push(n);

    for (const n of counts) for (const dl of descOpts) for (const s of [1, 0.9, 0.82, 0.74]) {
      variants.push(() => {
        const blocks = [];
        // Title follows the number of rows that actually fit ("Top 4 …" on a tight post).
        blocks.push(headlineBlock(ctx, listTitle(m.sec, n), { size: 84 * k * s, lh: 1.08, maxW, lines: 3, gap: 46 * k * s }));
        const pad = 44 * k * s, innerW = maxW - pad * 2;
        const rankW = 96 * k * s;
        const rows = m.items.slice(0, n).map((it, i) => {
          const tb = textBlock(ctx, it.title, { size: 40 * k * s, weight: 800, lh: 1.2, trackEm: -0.025, maxW: innerW - rankW, lines: 2 });
          const mb = textBlock(ctx, it.meta, { size: 25 * k * s, weight: 600, color: C.soft, lh: 1.3, maxW: innerW - rankW, lines: 1 });
          const db = dl ? textBlock(ctx, it.desc, { size: 28 * k * s, weight: 500, color: C.soft, lh: 1.38, maxW: innerW - rankW, lines: dl }) : { h: 0, draw() {} };
          const padY = (i === 0 ? 0 : 24) * k * s, padB = (i === n - 1 ? 0 : 24) * k * s;
          const inner = tb.h + (mb.h ? mb.h + 6 * k : 0) + (db.h ? db.h + 8 * k : 0);
          return {
            h: inner + padY + padB,
            draw(x0, y0) {
              if (i > 0) { ctx.fillStyle = C.track; ctx.fillRect(x0, y0, innerW, 2); }
              // Story-number style; the top row takes the section colour.
              ctx.font = font(900, 50 * k * s);
              ctx.fillStyle = i === 0 ? color : C.ink;
              track(ctx, 50 * k * s, -0.06);
              ctx.fillText(`${it.rank}`.padStart(2, '0'), x0, y0 + padY + 42 * k * s);
              untrack(ctx);
              let yy = y0 + padY;
              tb.draw(x0 + rankW, yy); yy += tb.h;
              if (mb.h) { yy += 6 * k; mb.draw(x0 + rankW, yy); yy += mb.h; }
              if (db.h) { yy += 8 * k; db.draw(x0 + rankW, yy); }
            },
          };
        });
        blocks.push(cardBlock(ctx, k, maxW, rows, { pad, gap: 30 * k * s }));
        if (n < m.total) {
          blocks.push(textBlock(ctx, `+ ${m.total - n} more in today's briefing`, { size: 26 * k * s, weight: 600, color: C.soft, maxW, lines: 1, gap: 14 * k }));
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
    const variants = [];

    for (const s of [1, 0.92, 0.84, 0.76, 0.68, 0.6]) {
      variants.push(() => {
        const blocks = [];
        if (it.meta) blocks.push(textBlock(ctx, it.meta, { size: 26 * k * s, weight: 600, color: C.soft, trackEm: 0.02, maxW, lines: 1, gap: 20 * k * s }));
        blocks.push(headlineBlock(ctx, it.title, { size: 84 * k * s, lh: 1.1, maxW, lines: isStory ? 5 : 4, gap: 46 * k * s }));

        const pad = 48 * k * s, innerW = maxW - pad * 2;
        const inner = [];
        if (it.desc) inner.push(textBlock(ctx, it.desc, { size: 36 * k * s, weight: 500, color: C.ink, lh: 1.42, trackEm: -0.01, maxW: innerW, lines: isStory ? 7 : 4 }));
        if (it.why) {
          const lab = { h: 52 * k * s, draw(x, y) {
            ctx.fillStyle = m.section.color;
            ctx.beginPath(); ctx.arc(x + 7 * k * s, y + 14 * k * s, 7 * k * s, 0, Math.PI * 2); ctx.fill();
            label(ctx, 'WHY IT MATTERS', x + 26 * k * s, y + 22 * k * s, 22 * k * s, C.ink);
          } };
          if (inner.length) {
            const sep = 34 * k * s;
            inner.push({ h: sep * 2, draw(x, y) { ctx.fillStyle = C.track; ctx.fillRect(x, y + sep, innerW, 2); } });
          }
          inner.push(lab);
          inner.push(textBlock(ctx, it.why, { size: 34 * k * s, weight: 600, color: C.ink, lh: 1.42, trackEm: -0.015, maxW: innerW, lines: isStory ? 6 : 3 }));
        }
        if (inner.length) blocks.push(cardBlock(ctx, k, maxW, inner, { pad }));
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
    floatRect(ctx, k, x, y, w, h, 40 * k);

    ctx.save();
    const pad = 36 * k, bs = 104 * k;
    const bx = x + pad, by = y + (h - bs) / 2;
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(bx + bs / 2, by + bs / 2, bs / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.surface;
    ctx.beginPath();
    ctx.moveTo(bx + bs * 0.41, by + bs * 0.3);
    ctx.lineTo(bx + bs * 0.72, by + bs * 0.5);
    ctx.lineTo(bx + bs * 0.41, by + bs * 0.7);
    ctx.closePath(); ctx.fill();

    const wx = bx + bs + 32 * k, ww = x + w - pad - wx;
    const wh = h - 104 * k, wy = y + 30 * k;
    const step = ww / peaks.length, bw = Math.max(3, step * 0.55);
    const played = progress * peaks.length;
    peaks.forEach((p, i) => {
      const bh = Math.max(6 * k, p * wh);
      ctx.fillStyle = i < played ? C.teal : C.muted;
      roundRect(ctx, wx + i * step, wy + (wh - bh) / 2, bw, bh, bw / 2);
      ctx.fill();
    });

    ctx.font = font(700, 26 * k);
    ctx.fillStyle = C.soft;
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
        blocks.push(headlineBlock(ctx, m.title, { size: 96 * k * s, lh: 1.02, maxW, lines: 3, gap: 26 * k * s }));
        blocks.push(textBlock(ctx, 'The day’s top AI stories, read aloud. Tap the link to listen.', { size: 34 * k * s, weight: 500, color: C.soft, lh: 1.4, trackEm: -0.01, maxW, lines: 2, gap: 48 * k * s }));
        const waveH = 230 * k;
        blocks.push({ h: waveH + 56 * k * s, wave: true, draw() {}, waveH });
        if (n) {
          blocks.push({ h: 48 * k * s, draw(x, y) { label(ctx, 'IN THIS EPISODE', x, y + 22 * k * s, 22 * k * s, C.soft); } });
        }
        m.items.slice(0, n).forEach((it, i) => {
          const tb = textBlock(ctx, it.title, { size: 36 * k * s, weight: 600, lh: 1.25, trackEm: -0.025, maxW: maxW - 72 * k, lines: 2 });
          const padY = 18 * k * s;
          blocks.push({
            h: tb.h + padY * 2,
            draw(x0, y0) {
              if (i > 0) { ctx.fillStyle = C.track; ctx.fillRect(x0, y0, maxW, 2); }
              ctx.font = font(900, 36 * k * s);
              ctx.fillStyle = C.dim;
              track(ctx, 36 * k * s, -0.06);
              ctx.fillText(String(i + 1).padStart(2, '0'), x0, y0 + padY + 34 * k * s);
              untrack(ctx);
              tb.draw(x0 + 72 * k, y0 + padY);
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

    background(ctx, f);
    const k = f.k;
    const hb = header(ctx, f, model.when);
    const cta = model.kind === 'list' ? 'See the full list & links'
      : model.kind === 'audio' ? 'Listen to the full briefing'
      : 'Read more in today\'s AI briefing';
    const ft = footer(ctx, f, cta);

    const chipBottom = categoryPill(ctx, k, f.pad, hb + (f.h > f.w ? 96 : 48) * k, model.section.heading.toUpperCase(), color);

    // Room for the floating card shadows below the content.
    const top = chipBottom + 44 * k;
    const bottom = ft - 56 * k;
    const layout = model.kind === 'list' ? listLayout : model.kind === 'audio' ? audioLayout : itemLayout;
    const { blocks, h } = layout(ctx, f, model, top, bottom);

    // Stories: centre the content vertically in the free space; posts: top-align.
    let y = f.h > f.w ? top + Math.max(0, (bottom - top - h) * 0.35) : top;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, top - 4, f.w, bottom - top + 48 * k); ctx.clip();
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
    const f = FORMATS.og, x = f.pad, k = 0.62;
    const section = sec ? SECTIONS[sec] : { heading: 'Daily Briefing', color: C.teal };
    const cv = document.createElement('canvas');
    cv.width = f.w; cv.height = f.h;
    const ctx = cv.getContext('2d');

    background(ctx, f);

    // Sig as the one hero object, floating on the right.
    const hs = 300;
    logo(ctx, f.w - f.pad - hs + 10, (f.h - hs) / 2 - 6, hs, 2.2);

    lockup(ctx, x, f.pad - 4, 72 * k * 1.25, k * 1.25);

    categoryPill(ctx, k * 1.1, x, 182, sec ? 'TODAY ON AI SIGNAL' : 'EVERY DAY, IN ONE PLACE', section.color);

    const heading = sec ? section.heading : 'What matters in AI today';
    const hb = headlineBlock(ctx, heading, { size: 78, lh: 1.02, maxW: f.w - x * 2 - hs - 20, lines: 2, base: 900 });
    hb.draw(x, 290);

    const sub = sec
      ? 'Handpicked daily by AI Signal. Tap to open the full list.'
      : 'News, papers, repos, models, videos and jobs, daily.';
    const sb = textBlock(ctx, sub, { size: 27, weight: 500, color: C.soft, lh: 1.35, trackEm: -0.01, maxW: f.w - x * 2 - hs - 20, lines: 1 });
    sb.draw(x, 290 + hb.h + 14);

    ctx.fillStyle = C.ink;
    ctx.font = font(800, 30);
    track(ctx, 30, -0.03);
    ctx.fillText(HOST, x, f.h - f.pad + 4);
    untrack(ctx);
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
