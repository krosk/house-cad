// Cloudflare Worker: a thin, article-only CORS proxy for IKEA "rotera" 3D models.
//
// WHY: IKEA's model host (web-api.ikea.com) origin-allowlists — a browser fetch from
// our app sends an Origin header and gets 403; only *.ikea.com origins (or no Origin,
// i.e. server-side) get 200. This Worker fetches server-side (no browser Origin → 200)
// and re-serves the GLB with permissive CORS so the app can load it on the fly. Nothing
// is bundled into the app/APK; models are never stored in our repo. See memory
// `ikea-3d-model-pipeline`.
//
// It is deliberately NOT a general proxy: it only accepts a bare article id, only ever
// hits the fixed rotera model URL, and only echoes CORS back to an allowlisted origin.
//
// Deploy: see README.md in this folder (wrangler deploy). Free tier is plenty.

// Origins allowed to read the response. Add your dev-server LAN origins as needed.
const ALLOWED_ORIGINS = [
  'https://krosk.github.io',          // GitHub Pages (and the TWA/APK, same origin)
  'https://localhost:5174',
  'https://127.0.0.1:5174',
  'https://192.168.1.154:5174',       // last-seen dev-server LAN IP (handoff)
];

// rotera locale segment. The static GLB is locale-pathed but locale-independent in
// content; fr/fr matches how the models were surveyed.
const LANG = 'fr/fr';

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin': allow,
    'vary': 'Origin',
    'access-control-allow-methods': 'GET, OPTIONS',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('method not allowed', { status: 405, headers: cors });

    // Path is exactly /<article> — a run of 6+ digits. Nothing else is proxied.
    const article = new URL(request.url).pathname.replace(/^\/+/, '');
    if (!/^\d{6,}$/.test(article)) {
      return new Response('expected /<article-id>', { status: 400, headers: cors });
    }

    const upstream = `https://web-api.ikea.com/${LANG}/rotera/static/models/${article}-mini.glb`;
    const res = await fetch(upstream, {
      // Edge-cache the upstream GLB so repeat pulls don't re-hit IKEA.
      cf: { cacheEverything: true, cacheTtl: 86400 },
    });
    if (!res.ok) {
      return new Response(`no model for ${article} (upstream ${res.status})`, { status: res.status, headers: cors });
    }

    return new Response(res.body, {
      status: 200,
      headers: {
        ...cors,
        'content-type': 'model/gltf-binary',
        'cache-control': 'public, max-age=86400',
      },
    });
  },
};
