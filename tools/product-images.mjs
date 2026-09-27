#!/usr/bin/env node
// Product source extractor for the retailers used in product modelling
// (docs/product-modelling.md step 3): gallery photos, attached documents (installation
// manual, spec sheet: PDFs) and the spec table. One function, `extractProduct(pageUrl,
// html)`, knows each site's pattern; it is self-contained so it also runs inside Chrome
// for sites that refuse scripted fetches.
//
//   node tools/product-images.mjs <product-url> [--out <dir>] [--filter <text>] [--list] [--sheet]
//       fetch the page (IKEA, Lapeyre, Castorama, leboncoin), print the specs and the
//       image/document URLs, download them
//   node tools/product-images.mjs --snippet
//       print a JS snippet; run it in Chrome on the product page (javascript_tool):
//       it returns the same report, whose URLs you then download with --download
//   node tools/product-images.mjs --download [--sheet] --out <dir> <url>...
//
// --out defaults to ./product-images (use the session scratchpad; never the repo).
// Files are named <n>-<source id>.<ext> so a doc can cite the retailer's image id.
// --sheet also writes <out>/sheet-<k>.png: labelled contact sheets of 16 photos (ffmpeg).
// --filter keeps leboncoin listings whose title contains <text> (default: words of the URL).

import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
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

// → { images: [{ url, note }], docs: [{ url, name }], specs: [[name, value]], variants: [text] }
// Images are full-size product photos in page order, deduplicated.
// Must stay self-contained (no outer references): --snippet serialises it for Chrome.
function extractProduct(pageUrl, html, filter = '') {
  const host = new URL(pageUrl).hostname.replace(/^www\./, '');
  const out = [], seen = new Set(), docs = [], variants = [], specs = [];
  const add = (url, note = '', key = url) => {
    if (seen.has(key)) return;
    seen.add(key); out.push({ url, note });
  };
  const addDoc = (url, name = '') => {
    if (!docs.some((d) => d.url === url)) docs.push({ url, name });
  };
  const all = (re) => [...html.matchAll(re)];
  const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const spec = (k, v) => {
    const row = [text(k), text(v)];
    if (row[0] && row[1] && !specs.some((r) => r[0] === row[0])) specs.push(row);
  };
  // Spec table on any site: <th>name</th><td>value</td> rows (Leroy Merlin's
  // "Tableau de caractéristiques").
  for (const m of all(/<th[^>]*>([\s\S]{1,200}?)<\/th>\s*<td[^>]*>([\s\S]{1,300}?)<\/td>/g)) spec(m[1], m[2]);
  // Documents on any site: links to PDFs, named by their link text.
  for (const m of all(/<a[^>]*href="(https?:\/\/[^"]+?\.pdf)"[^>]*>([\s\S]{0,300}?)<\/a>/g)) addDoc(m[1], text(m[2]));

  if (host.endsWith('leroymerlin.fr')) {
    // media.adeo.com/media/<id>/media.<ext>: the gallery is the thumbnail strip
    // (`m-nav-thumbnails__image`, in order; the last may be a video's poster). Its ids
    // can be .png or .jpg (the NEO tray, 2026-09-27: 9 of 10 were .png), and the page's
    // other ids are menu icons, ads and recommendations. Sibling variants
    // (`product-variants__item__picture`, alt = the variant) are listed as notes.
    // No query string: the Chrome tool blocks output containing one; --download adds it.
    for (const m of all(/<img[^>]*m-nav-thumbnails__image[^>]*>/g)) {
      const id = m[0].match(/media\.adeo\.com\/media\/(\d+)\/media\.(\w+)/);
      if (id) add(`https://media.adeo.com/media/${id[1]}/media.${id[2]}`, `adeo ${id[1]}`, id[1]);
    }
    for (const m of all(/<img[^>]*product-variants__item__picture[^>]*>/g)) {
      const id = m[0].match(/media\.adeo\.com\/media\/(\d+)/), alt = m[0].match(/alt="([^"]*)"/);
      if (id) variants.push(`${alt ? alt[1] : '?'}: media ${id[1]}`);
    }
    for (const m of all(/<a[^>]*data-file-name="([^"]*)"[^>]*href="(https:\/\/media\.adeo\.com\/media\/\d+\/media\.pdf)"/g)) {
      addDoc(m[2], m[1].trim());
    }
  } else if (host.endsWith('lapeyre.fr')) {
    // statics-lapeyre.fr/img/catalogue/collMain/…/<ref>_<n>.jpg, or zoom1/…/<id>.jpg on
    // some product pages (the LINE door block, 2026-09-26); pictos excluded.
    for (const m of all(/https?:\/\/www\.statics-lapeyre\.fr\/+img\/catalogue\/(?:collMain|zoom1)\/[^"'\s?\\]+?\.(?:jpe?g|png|webp)/g)) {
      add(m[0].replace(/(\.fr)\/+/, '$1/'), 'lapeyre');
    }
    // Specs: MUI paragraph pairs, a body1 name then a body2 value (2026-09-27).
    for (const m of all(/<p class="MuiTypography-root MuiTypography-body1[^"]*">([^<]{1,120})<\/p><\/div><div[^>]*><p class="MuiTypography-root MuiTypography-body2[^"]*">([\s\S]{1,300}?)<\/p>/g)) spec(m[1], m[2]);
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
  return { images: out, docs, specs, variants };
}

// The report printed by the CLI and returned by the snippet: plain lines, URLs first so
// they can be pasted into --download.
function report(r) {
  return [
    ...r.images.map((x) => `${x.url}  ${x.note}`),
    `${r.images.length} image(s)`,
    ...r.docs.map((d) => `${d.url}  ${d.name}`),
    `${r.docs.length} document(s)`,
    ...(r.specs.length ? ['specs:', ...r.specs.map(([k, v]) => `  ${k}: ${v}`)] : []),
    ...(r.variants.length ? ['variants:', ...r.variants.map((v) => `  ${v}`)] : []),
  ].join('\n');
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

// Download to <n>-<source id>.<ext>; the id is the adeo media id, else the file's basename.
async function download(urls, dir) {
  await mkdir(dir, { recursive: true });
  const photos = [];
  let n = 0;
  for (let url of urls) {
    const adeo = url.match(/media\.adeo\.com\/media\/(\d+)\/media\.(\w+)/);
    if (adeo && adeo[2] !== 'pdf' && !url.includes('?')) url += '?width=1200'; // full size
    const ext = (url.match(/\.(png|webp|avif|pdf)(?:\?|$)/)?.[1]) || 'jpg';
    const id = (adeo ? adeo[1] : new URL(url).pathname.split('/').pop().replace(/\.\w+$/, ''))
      .replace(/[^\w.-]+/g, '_').slice(-40);
    const file = join(dir, `${String(++n).padStart(2, '0')}-${id}.${ext}`);
    const r = curl(url, file);
    console.log(r.status === 200 ? `${file}  ${url}` : `${r.status}  ${url}`);
    if (r.status === 200 && ext !== 'pdf') photos.push(file);
  }
  return photos;
}

// Labelled contact sheets, 4 × 4 tiles of 300 px, so every photo is looked at (step 3).
function contactSheets(files, dir) {
  for (let k = 0; k * 16 < files.length; k++) {
    const batch = files.slice(k * 16, k * 16 + 16);
    const tiles = batch.map((f, i) => `[${i}:v]scale=300:300:force_original_aspect_ratio=decrease,` +
      `pad=300:300:(ow-iw)/2:(oh-ih)/2:white,drawtext=text='${basename(f)}':x=5:y=5:fontsize=16:fontcolor=red[v${i}]`);
    const layout = batch.map((_, i) => `${(i % 4) * 300}_${Math.floor(i / 4) * 300}`).join('|');
    const out = join(dir, `sheet-${k + 1}.png`);
    const graph = batch.length > 1
      ? `${tiles.join(';')};${batch.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${batch.length}:layout=${layout}:fill=white`
      : tiles[0].replace(/\[v0\]$/, '');
    try {
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...batch.flatMap((f) => ['-i', f]),
        '-filter_complex', graph, '-frames:v', '1', out]);
      console.log(`sheet ${out}`);
    } catch (e) {
      console.log(`contact sheet failed (ffmpeg): ${String(e.message).split('\n')[0]}`);
    }
  }
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.snippet) {
    // Run on the product page in Chrome; it re-fetches its own HTML (same origin,
    // so the site's bot check is already passed) and applies the same extractor.
    // `await` first: the Chrome tool returns a bare async IIFE as {} (2026-09-27). The
    // tool also truncates long output: the result stays in window.__product (read
    // __product.specs in a second call).
    console.log(`await (async () => { const extractProduct = ${extractProduct.toString()};
  const report = ${report.toString()};
  const html = await (await fetch(location.href)).text();
  window.__product = extractProduct(location.href, html);
  return report(window.__product); })()`);
    return;
  }
  if (a.download) {
    const photos = await download(a.urls, a.out);
    if (a.sheet && photos.length) contactSheets(photos, a.out);
    return;
  }
  const [page] = a.urls;
  if (!page) { console.log('usage: see the header of tools/product-images.mjs'); process.exit(1); }
  const host = new URL(page).hostname.replace(/^www\./, '');
  if (BROWSER_ONLY.some((re) => re.test(host))) {
    console.log(`${host} refuses scripted fetches: open the page in Chrome, run the output of\n` +
      '  node tools/product-images.mjs --snippet\nwith javascript_tool, then pass the URLs to --download [--sheet].');
    process.exit(2);
  }
  const r = curl(page);
  if (r.status !== 200) { console.log(`${r.status} fetching ${page}: try the Chrome route (--snippet).`); process.exit(2); }
  const filter = a.filter ?? decodeURIComponent(new URL(r.url).pathname.split('/').pop() || '').replace(/[-_]/g, ' ').replace(/\.\w+$/, '');
  const found = extractProduct(r.url, r.body, host.endsWith('leboncoin.fr') ? filter : '');
  console.log(report(found));
  const urls = [...found.images, ...found.docs].map((x) => x.url);
  if (a.list || !urls.length) return;
  const photos = await download(urls, a.out);
  if (a.sheet && photos.length) contactSheets(photos, a.out);
}

main();
