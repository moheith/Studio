const allowed = new Set(['html','css','js','mjs','json','png','jpg','jpeg','webp','gif','mp3','wav','ogg','mp4','webm','woff','woff2']);
const reserved = new Set(['api','auth','studio','profile','settings','assets','static','admin','health']);

function securityHeaders(appOrigin) {
  return {
    'Content-Security-Policy': `default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://cdn.skypack.dev https://esm.sh https://threejs.org; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' data: blob: https:; form-action 'none'; base-uri 'self'; frame-ancestors ${appOrigin}`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cache-Control': 'no-store',
  };
}

function mime(path) {
  const ext = path.split('.').pop().toLowerCase();
  return ({html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',json:'application/json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm',woff:'font/woff',woff2:'font/woff2'})[ext] || 'application/octet-stream';
}

function safePath(raw) {
  let path;
  try { path = decodeURIComponent(raw); } catch { return null; }
  if (!path || path.includes('\\') || path.includes('\0') || path.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.'))) return null;
  const ext = path.split('.').pop().toLowerCase();
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
  const object = await bucket.get(key);
  if (!object) return new Response('Game file not found', {status:404, headers:securityHeaders(appOrigin)});
  const headers = new Headers(securityHeaders(appOrigin));
  headers.set('Content-Type', mime(path));
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  return new Response(object.body, {headers});
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', {status:405, headers:{Allow:'GET, HEAD'}});
    const url = new URL(request.url);
    const raw = url.pathname.replace(/^\/+/, '');
    const appOrigin = env.APP_ORIGIN || 'https://app.example.com';
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
