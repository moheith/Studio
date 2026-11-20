/**
 * In-browser TypeScript / JSX / TSX / React bundler powered by esbuild-wasm.
 * Lazy-loaded ONLY when a project contains .ts, .tsx, or .jsx files (zero cost for plain HTML/JS games).
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
 * with bare npm imports resolved via esm.sh.
 */
export async function bundleProjectToHtml(files: Record<string, string>): Promise<BundleResult> {
  const start = performance.now()
  const indexHtml = files['index.html'] || '<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div></body></html>'

  // Find entrypoint referenced in <script type="module" src="...tsx|ts|jsx"> or default main.tsx/index.tsx/app.tsx
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
          // Bare npm specifier -> map to esm.sh with React 18 alignment
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

    // Inline project CSS files referenced by <link rel="stylesheet" href="...">
    let outHtml = indexHtml.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (full, href) => {
      const cleanHref = href.replace(/^\.\//, '')
      if (cleanHref in files) {
        return `<style>\n${files[cleanHref]}\n</style>`
      }
      return full
    })

    if (cssOut) {
      outHtml = outHtml.replace('</head>', `<style>\n${cssOut}\n</style>\n</head>`)
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
