/**
 * In-browser TypeScript / JSX / TSX / React bundler powered by esbuild-wasm.
 * Lazy-loaded ONLY when a project contains .ts, .tsx, or .jsx files (zero cost for plain HTML/JS games).
 * Also injects the full Yulya Studio origin-pinned runtime bridge so screensharing, AI vision,
 * Cover Snapshots, Click-to-Edit, Perf HUD, REPL, and console logs work seamlessly on React/TS projects!
 */
import type * as EsbuildTypes from 'esbuild-wasm'

let esbuildInitPromise: Promise<typeof EsbuildTypes> | null = null

const ESBUILD_WASM_URL = 'https://cdn.jsdelivr.net/npm/esbuild-wasm@0.28.2/esbuild.wasm'

export function projectNeedsTranspile(files: Record<string, string>): boolean {
  return Object.keys(files).some((name) => /\.(tsx|ts|jsx)$/i.test(name))
}

async function getEsbuild(): Promise<typeof EsbuildTypes> {
  if (!esbuildInitPromise) {
    esbuildInitPromise = (async () => {
      const mod = await import('esbuild-wasm')
      await mod.initialize({ wasmURL: ESBUILD_WASM_URL, worker: true })
      return mod
    })().catch((err) => {
      esbuildInitPromise = null
      throw err
    })
  }
  return esbuildInitPromise
}

function resolveVirtualPath(fromFile: string, specifier: string, files: Record<string, string>): string | null {
  const baseDir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : ''
  const rawParts = `${baseDir ? baseDir + '/' : ''}${specifier}`.split('/')
  const resolved: string[] = []
  for (const part of rawParts) {
    if (!part || part === '.') continue
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  const base = resolved.join('/')
  const candidates = [base, `${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, `${base}/index.tsx`, `${base}/index.ts`, `${base}/index.js`]
  for (const cand of candidates) {
    if (cand in files) return cand
  }
  return null
}

function inferLoader(path: string): EsbuildTypes.Loader {
  if (path.endsWith('.tsx')) return 'tsx'
  if (path.endsWith('.ts')) return 'ts'
  if (path.endsWith('.jsx')) return 'jsx'
  if (path.endsWith('.css')) return 'css'
  if (path.endsWith('.json')) return 'json'
  return 'js'
}

function buildSrcdocBridgeScript(parentOrigin: string): string {
  const safeOrigin = JSON.stringify(parentOrigin || '*')
  return `
<script src="https://cdn.jsdelivr.net/npm/modern-screenshot@4.7.0/dist/index.js" defer></script>
<script>
(function() {
  var TARGET_ORIGIN = ${safeOrigin};
  function postToHost(payload) {
    if (!TARGET_ORIGIN || window.parent === window) return;
    try { window.parent.postMessage(payload, TARGET_ORIGIN); } catch (e) {}
  }
  window.YulyaSDK = {
    submitScore: function(score, meta) {
      var n = Number(score);
      if (!isFinite(n)) return;
      postToHost({ type: 'yulya:submit-score', score: n, meta: meta || {} });
    }
  };
  try {
    var _origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attribs) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        attribs = Object.assign({}, attribs, { preserveDrawingBuffer: true });
      }
      return _origGetContext.call(this, type, attribs);
    };
  } catch (e) {}
  var recentLogs = [];
  function pushLog(level, msg) {
    recentLogs.push({ level: level, message: String(msg).slice(0, 600), ts: Date.now() });
    if (recentLogs.length > 40) recentLogs.shift();
  }
  window.addEventListener('error', function(e) {
    var msg = (e.message || 'Script error') + (e.lineno ? ' (line ' + e.lineno + ')' : '');
    pushLog('error', msg);
    postToHost({ type: 'yulya:game-error', message: msg, filename: e.filename || '', lineno: e.lineno || 0, colno: e.colno || 0 });
  });
  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason && (e.reason.message || e.reason.stack || e.reason) || 'unknown error';
    var msg = 'Unhandled Promise Rejection: ' + reason;
    pushLog('error', msg);
    postToHost({ type: 'yulya:game-error', message: msg, filename: '', lineno: 0 });
  });
  try {
    var _fmt = function(args) {
      return Array.prototype.slice.call(args).map(function(a) {
        if (typeof a === 'object' && a !== null) { try { return JSON.stringify(a); } catch(_) { return String(a); } }
        return String(a);
      }).join(' ');
    };
    var _ol = console.log; console.log = function() { _ol.apply(console, arguments); var m = _fmt(arguments); pushLog('log', m); postToHost({ type: 'yulya:game-log', level: 'log', message: m }); };
    var _ow = console.warn; console.warn = function() { _ow.apply(console, arguments); var m = _fmt(arguments); pushLog('warn', m); postToHost({ type: 'yulya:game-log', level: 'warn', message: m }); };
    var _oe = console.error; console.error = function() { _oe.apply(console, arguments); var m = _fmt(arguments); pushLog('error', m); postToHost({ type: 'yulya:game-log', level: 'error', message: m }); };
  } catch (e) {}
  function collectInteractiveDom() {
    var items = [];
    try {
      var nodes = document.querySelectorAll('button, a, input, select, canvas, [role="button"]');
      for (var i = 0; i < nodes.length && items.length < 30; i++) {
        var el = nodes[i]; var r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        var sel = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '');
        items.push({ tag: el.tagName.toLowerCase(), selector: sel, text: (el.innerText || el.value || '').trim().slice(0, 60), x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), w: Math.round(r.width), h: Math.round(r.height) });
      }
    } catch (e) {}
    return items;
  }
  var pickerActive = false; var pickerBox = null;
  function ensurePickerBox() {
    if (pickerBox) return pickerBox;
    pickerBox = document.createElement('div');
    pickerBox.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #8b5cf6;background:rgba(139,92,246,0.16);border-radius:4px;display:none;transition:all 60ms ease;';
    document.documentElement.appendChild(pickerBox);
    return pickerBox;
  }
  document.addEventListener('mousemove', function(ev) {
    if (!pickerActive) return;
    var el = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!el || el === pickerBox) return;
    var r = el.getBoundingClientRect(); var box = ensurePickerBox();
    box.style.display = 'block'; box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
  }, true);
  document.addEventListener('click', function(ev) {
    if (!pickerActive) return;
    ev.preventDefault(); ev.stopPropagation();
    var el = document.elementFromPoint(ev.clientX, ev.clientY);
    pickerActive = false;
    if (pickerBox) pickerBox.style.display = 'none';
    if (el) {
      var cs = window.getComputedStyle(el);
      var sel = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0,3).join('.') : '');
      postToHost({ type: 'yulya:element-picked', element: { selector: sel, tag: el.tagName.toLowerCase(), text: (el.innerText || '').trim().slice(0, 120), styles: { color: cs.color, background: cs.backgroundColor, fontSize: cs.fontSize } } });
    }
  }, true);
  var perfRunning = false; var perfFrames = 0; var perfLast = performance.now();
  function perfTick(now) {
    if (!perfRunning) return;
    perfFrames++;
    if (now - perfLast >= 1000) {
      var fps = Math.round((perfFrames * 1000) / (now - perfLast));
      var memMb = (performance.memory && performance.memory.usedJSHeapSize) ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
      postToHost({ type: 'yulya:perf-stats', fps: fps, memMb: memMb, domNodes: document.getElementsByTagName('*').length });
      perfFrames = 0; perfLast = now;
    }
    requestAnimationFrame(perfTick);
  }
  window.addEventListener('message', function(e) {
    if (TARGET_ORIGIN !== '*' && e.origin !== TARGET_ORIGIN) return;
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'yulya:set-picker') { pickerActive = !!e.data.active; if (!pickerActive && pickerBox) pickerBox.style.display = 'none'; return; }
    if (e.data.type === 'yulya:set-perf') {
      var want = !!e.data.active;
      if (want && !perfRunning) { perfRunning = true; perfFrames = 0; perfLast = performance.now(); requestAnimationFrame(perfTick); }
      else if (!want) { perfRunning = false; }
      return;
    }
    if (e.data.type === 'yulya:eval-code') {
      var evalId = e.data.evalId;
      try {
        var res = (0, eval)(String(e.data.code || ''));
        var out = typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res);
        postToHost({ type: 'yulya:eval-result', evalId: evalId, ok: true, output: out });
      } catch (err) {
        postToHost({ type: 'yulya:eval-result', evalId: evalId, ok: false, output: String(err && err.message || err) });
      }
      return;
    }
    if (e.data.type === 'yulya:simulate-input') {
      var d = e.data; var kind = d.inputKind || 'click';
      var target = null;
      if (d.selector) { try { target = document.querySelector(d.selector); } catch (_) {} }
      if (!target && d.text) {
        var needle = String(d.text).toLowerCase().trim();
        var els = document.querySelectorAll('button, a, input, [role="button"]');
        for (var i = 0; i < els.length; i++) {
          if ((els[i].innerText || '').toLowerCase().indexOf(needle) !== -1) { target = els[i]; break; }
        }
      }
      if (target && kind === 'click') { try { target.click(); } catch (_) {} }
      return;
    }
    if (e.data.type === 'yulya:capture-screen') {
      var reqId = e.data.reqId;
      var domItems = collectInteractiveDom();
      var errors = recentLogs.filter(function(l) { return l.level === 'error' || l.level === 'warn'; }).slice(-15);
      var bg = '#0f172a';
      try { var comp = window.getComputedStyle(document.body).backgroundColor; if (comp && comp !== 'transparent' && comp !== 'rgba(0, 0, 0, 0)') bg = comp; } catch (_) {}
      function sendCap(du) {
        postToHost({ type: 'yulya:screen-captured', reqId: reqId, dataUrl: du || '', hasCanvas: !!(du && du.length > 500), width: window.innerWidth, height: window.innerHeight, domElements: domItems, consoleErrors: errors });
      }
      requestAnimationFrame(function() {
        var ms = window.modernScreenshot;
        if (ms && typeof ms.createContext === 'function' && typeof ms.domToDataUrl === 'function') {
          ms.createContext(document.body, { type: 'image/jpeg', quality: 0.82, scale: 0.75, backgroundColor: bg, width: window.innerWidth, height: window.innerHeight, autoDestruct: true })
            .then(function(ctx) {
              // Opaque-origin sandboxed srcDoc cannot access child iframe.contentWindow.document; disable dummy style sandbox cleanly
              ctx.sandbox = { contentWindow: null, remove: function() {} };
              return ms.domToDataUrl(ctx);
            })
            .then(function(du) { sendCap(du && du.length > 500 ? du : ''); })
            .catch(function() { sendCap(''); });
        } else if (ms && typeof ms.domToJpeg === 'function') {
          ms.domToJpeg(document.body, { quality: 0.82, scale: 0.75, backgroundColor: bg, width: window.innerWidth, height: window.innerHeight })
            .then(function(du) { sendCap(du && du.length > 500 ? du : ''); })
            .catch(function() { sendCap(''); });
        } else { sendCap(''); }
      });
    }
  });
})();
</script>`
}

export type BundleResult = {
  ok: true
  html: string
  buildMs: number
} | {
  ok: false
  error: string
}

/**
 * Compile a project containing .ts/.tsx/.jsx entrypoints into a self-contained HTML preview document
 * with bare npm imports resolved via esm.sh and the Yulya Studio runtime bridge injected.
 */
export async function bundleProjectToHtml(files: Record<string, string>, parentOrigin?: string): Promise<BundleResult> {
  const start = performance.now()
  const indexHtml = files['index.html'] || '<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div></body></html>'

  const scriptTagMatch = indexHtml.match(/<script\b[^>]*src=["']([^"']+\.(?:tsx|ts|jsx))["'][^>]*><\/script>/i)
  const entryPath =
    (scriptTagMatch && scriptTagMatch[1].replace(/^\.\//, '')) ||
    ['main.tsx', 'src/main.tsx', 'index.tsx', 'App.tsx', 'app.ts', 'main.ts'].find((k) => k in files)

  if (!entryPath || !(entryPath in files)) {
    return { ok: true, html: indexHtml, buildMs: 0 }
  }

  try {
    const esbuild = await getEsbuild()
    const virtualPlugin: EsbuildTypes.Plugin = {
      name: 'yulya-virtual-fs',
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.kind === 'entry-point') {
            return { path: args.path, namespace: 'yulya-vfs' }
          }
          if (args.path.startsWith('http://') || args.path.startsWith('https://')) {
            return { path: args.path, external: true }
          }
          if (args.path.startsWith('./') || args.path.startsWith('../') || args.path.startsWith('/')) {
            const found = resolveVirtualPath(args.importer, args.path.replace(/^\//, ''), files)
            if (found) return { path: found, namespace: 'yulya-vfs' }
            return { errors: [{ text: `Cannot resolve relative import '${args.path}' from '${args.importer}'` }] }
          }
          const mapped = args.path === 'react' || args.path.startsWith('react/') || args.path === 'react-dom' || args.path.startsWith('react-dom/')
            ? `https://esm.sh/${args.path.replace(/^react(?=\/|$)/, 'react@18.3.1').replace(/^react-dom(?=\/|$)/, 'react-dom@18.3.1')}`
            : `https://esm.sh/${args.path}`
          return { path: mapped, external: true }
        })

        build.onLoad({ filter: /.*/, namespace: 'yulya-vfs' }, (args) => {
          const contents = files[args.path] ?? ''
          return { contents, loader: inferLoader(args.path) }
        })
      },
    }

    const result = await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      format: 'esm',
      jsx: 'automatic',
      target: ['es2020'],
      write: false,
      plugins: [virtualPlugin],
    })

    const jsOut = result.outputFiles.find((f) => f.path.endsWith('.js') || !f.path.endsWith('.css'))?.text || ''
    const cssOut = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text || ''
    const safeJs = jsOut.replace(/<\/script>/gi, '<\\/script>')

    let outHtml = indexHtml.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (full, href) => {
      const cleanHref = href.replace(/^\.\//, '')
      if (cleanHref in files) {
        return `<style>\n${files[cleanHref]}\n</style>`
      }
      return full
    })

    const bridgeTag = buildSrcdocBridgeScript(parentOrigin || (typeof window !== 'undefined' ? window.location.origin : '*'))
    if (outHtml.includes('</head>')) {
      outHtml = outHtml.replace('</head>', `${cssOut ? `<style>\n${cssOut}\n</style>\n` : ''}${bridgeTag}\n</head>`)
    } else {
      outHtml = `${bridgeTag}\n${outHtml}`
    }

    const moduleTag = `<script type="module">\n${safeJs}\n</script>`
    if (scriptTagMatch) {
      outHtml = outHtml.replace(scriptTagMatch[0], moduleTag)
    } else if (outHtml.includes('</body>')) {
      outHtml = outHtml.replace('</body>', `${moduleTag}\n</body>`)
    } else {
      outHtml += `\n${moduleTag}`
    }

    return { ok: true, html: outHtml, buildMs: Math.round(performance.now() - start) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}
