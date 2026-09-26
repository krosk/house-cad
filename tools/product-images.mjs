#!/usr/bin/env node
// Product photo extractor for the retailers used in product modelling
// (docs/product-modelling.md step 3). One function, `extractImages(pageUrl, html)`,
// knows each site's pattern; it is self-contained so it also runs inside Chrome for
// sites that refuse scripted fetches.
//
//   node tools/product-images.mjs <product-url> [--out <dir>] [--filter <text>] [--list]
//       fetch the page (IKEA, Lapeyre, Castorama, leboncoin), list the product images, download them
//   node tools/product-images.mjs --snippet
//       print a JS snippet; run it in Chrome on the product page (javascript_tool):
//       it returns the image URLs, which you then download with --download
//   node tools/product-images.mjs --download --out <dir> <image-url>...
//
// --out defaults to ./product-images (use the session scratchpad; never the repo).
// --filter keeps leboncoin listings whose title contains <text> (default: words of the URL).

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Fetch with curl, not Node's fetch: leboncoin 403s Node's fetch but serves curl with the
// same headers (Proven 2026-09-26). Lapeyre is picky about headers: these pass; a
// different Accept header or Chrome version got "Access Denied".
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
function curl(url, outFile) {
  const args = ['-sL', '--compressed', '-A', UA, '-H', 'Accept-Language: fr',
    '-w', '\n%{http_code}\t%{content_type}\t%{url_effective}', ...(outFile ? ['-o', outFile] : []), url];
  const text = execFileSync('curl', args, { maxBuffer: 64 << 20 }).toString();
  const nl = text.lastIndexOf('\n');
  const [status, type, finalUrl] = text.slice(nl + 1).split('\t');
  return { status: +status, type, url: finalUrl, body: text.slice(0, nl) };
}

// Sites that 403 any scripted fetch: read them in Chrome with --snippet. Leroy Merlin runs
// DataDome (a JS challenge; x-datadome header): a real Chrome passes it, curl never does.
const BROWSER_ONLY = [/(^|\.)leroymerlin\.fr$/];

// → [{ url, note }] full-size product image URLs in page order, deduplicated.
// Must stay self-contained (no outer references): --snippet serialises it for Chrome.
function extractImages(pageUrl, html, filter = '') {
  const host = new URL(pageUrl).hostname.replace(/^www\./, '');
  const out = [], seen = new Set();
  const add = (url, note = '', key = url) => {
    if (seen.has(key)) return;
    seen.add(key); out.push({ url, note });
  };
  const all = (re) => [...html.matchAll(re)];

  if (host.endsWith('leroymerlin.fr')) {
    // media.adeo.com/media/<id>/media.jpg: the gallery photos are the .jpg ids (the
    // page lists them before the recommendations); .png/.jpeg ids are icons and ads.
    // The first few ids are this product; later .jpg ids can be other products: look.
    for (const m of all(/media\.adeo\.com\/media\/(\d+)\/media\.jpg/g)) {
      add(`https://media.adeo.com/media/${m[1]}/media.jpeg?width=1200`, `adeo ${m[1]}`, m[1]);
    }
  } else if (host.endsWith('lapeyre.fr')) {
    // statics-lapeyre.fr/img/catalogue/collMain/…/<ref>_<n>.jpg (pictos excluded).
    for (const m of all(/https?:\/\/www\.statics-lapeyre\.fr\/+img\/catalogue\/collMain\/[^"'\s?\\]+?\.(?:jpe?g|png|webp)/g)) {
      add(m[0].replace(/(\.fr)\/+/, '$1/'), 'lapeyre');
    }
  } else if (host.endsWith('ikea.com')) {
    // images/products/<slug>__<id>_<code>_<size>.jpg. Keep only this product's slug
    // (the page also shows accessories).
    const slug = (new URL(pageUrl).pathname.match(/\/p\/(.+?)-s?\d{8}\/?$/) || [])[1];
    for (const m of all(/https:\/\/www\.ikea\.com\/[a-z]{2}\/[a-z]{2}\/images\/products\/([^"?,\s]+?)__(\d+)_([a-z]{2}\d+)(?:_[a-z0-9]+)?\.(?:jpe?g|webp|avif)/g)) {
      if (slug && m[1] !== slug) continue;
      add(m[0], `ikea ${m[3]}`, m[2]); // one per image id; no query = 1400 px
    }
  } else if (host.endsWith('castorama.fr')) {
    // Scene7: media.castorama.fr/is/image/Castorama/<slug>~<EAN>_<code>; keep this
    // product's EAN (from …/<EAN>_CAFR.prd), one per code; `?wid=1400` is full size.
    const ean = (new URL(pageUrl).pathname.match(/\/(\d{8,14})_CAFR\.prd/) || [])[1];
    for (const m of all(/https?:\/\/media\.castorama\.fr\/is\/image\/Castorama\/[^"'\s?\\~]+~(\d{8,14})_([0-9A-Za-z_]+)/g)) {
      if (ean && m[1] !== ean) continue;
      add(`${m[0]}?wid=1400`, `casto ${m[2]}`, m[2]);
    }
  } else if (host.endsWith('leboncoin.fr')) {
    // __NEXT_DATA__ JSON: every object with `subject` + `images` is a listing (a search
    // page has many, an ad page one); keep titles matching the filter.
    const j = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (j) {
      const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (typeof o.subject === 'string' && o.images) {
          const t = o.subject.toLowerCase();
          if (words.every((w) => t.includes(w))) {
            for (const u of o.images.urls_large || o.images.urls || []) add(u, o.subject);
          }
        }
        for (const v of Object.values(o)) walk(v);
      };
      walk(JSON.parse(j[1]));
    }
  } else {
    // Unknown site: every absolute image URL, minus obvious icons/logos. Review by eye.
    for (const m of all(/https?:\/\/[^"'\s()<>\\]+?\.(?:jpe?g|png|webp)(?=[?"'\s)\\])/g)) {
      if (!/logo|icon|picto|sprite|favicon|avatar/i.test(m[0])) add(m[0], 'generic');
    }
  }
  return out;
}

function parseArgs(argv) {
  const a = { urls: [], out: 'product-images', filter: null };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--out') a.out = argv[++i];
    else if (v === '--filter') a.filter = argv[++i];
    else if (v.startsWith('--')) a[v.slice(2)] = true;
    else a.urls.push(v);
  }
  return a;
}

async function download(urls, dir) {
  await mkdir(dir, { recursive: true });
  let n = 0;
  for (const url of urls) {
    const ext = url.match(/\.(png|webp|avif)(?:\?|$)/)?.[1] || 'jpg';
    const file = join(dir, `${String(++n).padStart(2, '0')}.${ext}`);
    const r = curl(url, file);
    console.log(r.status === 200 ? `${file}  ${url}` : `${r.status}  ${url}`);
  }
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.snippet) {
    // Run on the product page in Chrome; it re-fetches its own HTML (same origin,
    // so the site's bot check is already passed) and applies the same extractor.
    console.log(`(async () => { const extractImages = ${extractImages.toString()};
  const html = await (await fetch(location.href)).text();
  return extractImages(location.href, html).map((x) => x.url).join(' '); })()`);
    return;
  }
  if (a.download) return download(a.urls, a.out);
  const [page] = a.urls;
  if (!page) { console.log('usage: see the header of tools/product-images.mjs'); process.exit(1); }
  const host = new URL(page).hostname.replace(/^www\./, '');
  if (BROWSER_ONLY.some((re) => re.test(host))) {
    console.log(`${host} refuses scripted fetches: open the page in Chrome, run the output of\n` +
      '  node tools/product-images.mjs --snippet\nwith javascript_tool, then pass the URLs to --download.');
    process.exit(2);
  }
  const r = curl(page);
  if (r.status !== 200) { console.log(`${r.status} fetching ${page}: try the Chrome route (--snippet).`); process.exit(2); }
  const filter = a.filter ?? decodeURIComponent(new URL(r.url).pathname.split('/').pop() || '').replace(/[-_]/g, ' ').replace(/\.\w+$/, '');
  const images = extractImages(r.url, r.body, host.endsWith('leboncoin.fr') ? filter : '');
  for (const x of images) console.log(`${x.url}  ${x.note}`);
  console.log(`${images.length} image(s)`);
  if (!a.list && images.length) await download(images.map((x) => x.url), a.out);
}

main();
