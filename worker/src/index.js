const allowed = new Set([
  'html','htm','css','js','mjs','cjs','json','ts','tsx','jsx','md','glsl','vert','frag',
  'png','jpg','jpeg','webp','gif','svg','ico','mp3','wav','ogg','m4a','mp4','webm',
  'woff','woff2','ttf','otf','txt','csv','tsv','atlas','fnt','glb','gltf','obj','mtl'
]);
const reserved = new Set(['api','auth','studio','profile','settings','assets','static','admin','health','templates','arcade','docs','terms','privacy']);
const safeSegmentRe = /^[A-Za-z0-9._\- ()+\[\]]+$/;

function securityHeaders(appOrigin, isSvg = false) {
  const csp = isSvg
    ? `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; sandbox; frame-ancestors ${appOrigin}`
    : `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://cdn.skypack.dev https://esm.sh https://threejs.org; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; connect-src 'self' data: blob: https:; worker-src 'self' blob:; object-src 'none'; form-action 'none'; base-uri 'self'; frame-ancestors ${appOrigin}`;
  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Cache-Control': 'no-store',
  };
}

function mime(path) {
  const ext = path.split('.').pop().toLowerCase();
  return ({
    html:'text/html; charset=utf-8',htm:'text/html; charset=utf-8',css:'text/css; charset=utf-8',
    js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',cjs:'text/javascript; charset=utf-8',
    json:'application/json',ts:'text/plain; charset=utf-8',tsx:'text/plain; charset=utf-8',jsx:'text/plain; charset=utf-8',
    png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',ico:'image/x-icon',
    mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',m4a:'audio/mp4',mp4:'video/mp4',webm:'video/webm',
    woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',
    glb:'model/gltf-binary',gltf:'model/gltf+json',txt:'text/plain; charset=utf-8',csv:'text/csv; charset=utf-8',tsv:'text/tab-separated-values; charset=utf-8'
  })[ext] || 'application/octet-stream';
}

function safePath(raw) {
  let path;
  try { path = decodeURIComponent(raw); } catch { return null; }
  if (!path || path.length > 240 || path.includes('\\') || path.includes('\0')) return null;
  const parts = path.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || p.startsWith('.') || !safeSegmentRe.test(p))) return null;
  const ext = parts[parts.length - 1].split('.').pop().toLowerCase();
  return allowed.has(ext) ? path : null;
}

function base64urlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function verifyPreviewToken(token, secret) {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(payload)));
  const actual = Array.from(signed, byte => byte.toString(16).padStart(2,'0')).join('');
  if (actual.length !== signature.length) return null;
  let diff = 0; for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(base64urlToBytes(payload)));
    return data.exp >= Math.floor(Date.now()/1000) ? data : null;
  } catch { return null; }
}

async function serve(bucket, key, path, appOrigin) {
  const isSvg = path.toLowerCase().endsWith('.svg');
  const object = await bucket.get(key);
  if (!object) return new Response('Game file not found', {status:404, headers:securityHeaders(appOrigin, isSvg)});
  const headers = new Headers(securityHeaders(appOrigin, isSvg));
  headers.set('Content-Type', mime(path));
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  return new Response(object.body, {headers});
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', {status:405, headers:{Allow:'GET, HEAD'}});
    const url = new URL(request.url);
    const raw = url.pathname.replace(/^\/+/, '');
    const appOrigin = env.APP_ORIGIN || 'https://studio.yulya.me';
    if (raw === 'robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (raw.startsWith('__preview/')) {
      if (!env.PREVIEW_TOKEN_SECRET) return new Response('Private preview is not configured', {status:503, headers:securityHeaders(appOrigin)});
      const [, , token, ...parts] = raw.split('/');
      const claims = await verifyPreviewToken(token || '', env.PREVIEW_TOKEN_SECRET || '');
      const path = safePath(parts.join('/') || 'index.html');
      if (!claims || !claims.uid || !claims.pid || !path) return new Response('Preview unavailable', {status:403, headers:securityHeaders(appOrigin)});
      return serve(env.PRIVATE_GAMES, `${claims.uid}/${claims.pid}/${path}`, path, appOrigin);
    }
    const [username, slug, ...parts] = raw.split('/');
    if (!username || !slug || reserved.has(username.toLowerCase()) || !/^[a-z0-9_]{3,24}$/.test(username) || !/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug)) return new Response('Game not found', {status:404, headers:securityHeaders(appOrigin)});
    const path = safePath(parts.filter(Boolean).join('/') || 'index.html');
    if (!path) return new Response('File type not allowed', {status:404, headers:securityHeaders(appOrigin)});
    return serve(env.PUBLIC_GAMES, `${username}/${slug}/${path}`, path, appOrigin);
  },
};
