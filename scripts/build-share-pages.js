#!/usr/bin/env node
/*
 * Builds static share pages under s/<date>/<section>/[<item>/]index.html.
 *
 * Social networks (Facebook, X, LinkedIn, WhatsApp, Telegram…) don't run
 * JavaScript, so the link preview for a shared card or item has to come from
 * static Open Graph tags. Each page carries those tags and immediately sends
 * human visitors on to the matching spot in the app (/?d=…&s=…&i=…).
 *
 * Usage: node scripts/build-share-pages.js   (no dependencies)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const M = require('../share-model.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 's');

const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function page(model) {
  const { date, sec, key } = model;
  const target = M.appPath(date, sec, key);
  const title = model.kind === 'list' ? `${model.title} · ${model.when}` : model.title;
  const image = `${M.SITE}/assets/og/${sec}.jpg`;
  const alt = `${model.section.heading} — AI Signal`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — AI Signal</title>
<meta name="description" content="${esc(model.description)}">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${esc(model.url)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="AI Signal">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(model.description)}">
<meta property="og:url" content="${esc(model.url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(alt)}">
<meta property="article:published_time" content="${esc(date)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(model.description)}">
<meta name="twitter:image" content="${esc(image)}">
<script>location.replace(${JSON.stringify(target)});</script>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f2f2f2 linear-gradient(#cfcfcf,#e9e9e9 10%,#f2f2f2 22%,#f2f2f2 82%,#e6e6e6 92%,#cdcdcd);color:#1a1a1a;font:500 15px/1.5 Inter,'Helvetica Neue',Arial,sans-serif;text-align:center;padding:24px;box-sizing:border-box}p{background:#fff;border-radius:24px;padding:28px 32px;box-shadow:10px 13px 18px rgba(0,0,0,.15),2px 3px 5px rgba(0,0,0,.06);max-width:520px}a{display:inline-block;margin-top:14px;padding:10px 18px;border-radius:999px;background:#1a1a1a;color:#fff;font-weight:700;text-decoration:none}</style>
</head>
<body>
<p>${esc(model.section.heading)} · ${esc(model.when)}<br><strong>${esc(model.title)}</strong><br><a href="${esc(target)}">Open in AI Signal →</a></p>
</body>
</html>
`;
}

function write(rel, html) {
  const file = path.join(OUT, rel, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === html) return false;
  fs.writeFileSync(file, html);
  return true;
}

function main() {
  const { dates = [] } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'), 'utf8'));
  let pages = 0, changed = 0;

  for (const date of dates) {
    const file = path.join(ROOT, 'data', `${date}.json`);
    if (!fs.existsSync(file)) continue;
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));

    for (const sec of Object.keys(M.SECTIONS)) {
      const card = M.describe(d, date, sec, null);
      if (card) { pages++; if (write(path.join(date, sec), page(card))) changed++; }

      for (const it of M.sectionItems(d, sec)) {
        const m = M.describe(d, date, sec, it.key);
        if (m) { pages++; if (write(path.join(date, sec, it.key), page(m))) changed++; }
      }
    }
  }
  console.log(`share pages: ${pages} total, ${changed} written`);
}

main();
