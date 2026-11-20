import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Code2, Layers, Rocket, Sparkles } from 'lucide-react'
import { fetchTemplates } from '../api'
import type { Page, TemplateItem, User } from '../types'

type TemplatesPageProps = {
  user: User | null
  setPage: (page: Page) => void
  onCreateFromTemplate: (templateId: string, title: string) => Promise<void>
  notify: (msg: string) => void
}

export default function TemplatesPage({ user, setPage, onCreateFromTemplate, notify }: TemplatesPageProps) {
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [category, setCategory] = useState('ALL')
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [customTitles, setCustomTitles] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchTemplates()
      .then((res) => setTemplates(res.templates || []))
      .catch(() => {})
  }, [])

  const categories = useMemo(() => ['ALL', ...Array.from(new Set(templates.map((t) => t.category)))], [templates])
  const filtered = useMemo(() => (category === 'ALL' ? templates : templates.filter((t) => t.category === category)), [templates, category])

  const launch = async (tpl: TemplateItem) => {
    if (!user) {
      notify('Sign in to launch a project from a template')
      setPage('login')
      return
    }
    const title = (customTitles[tpl.id] || `${tpl.title.split('(')[0].trim()} ${Math.floor(Math.random() * 90 + 10)}`).slice(0, 58)
    setCreatingId(tpl.id)
    try {
      await onCreateFromTemplate(tpl.id, title)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create project from template')
    } finally {
      setCreatingId(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#070910', color: '#f8fafc' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 28px', borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="button" className="button button-outline button-small" onClick={() => setPage('home')}>
            <ArrowLeft size={14} /> Home
          </button>
          <span style={{ fontWeight: 700, fontSize: 16, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Layers size={18} color="#a78bfa" /> Starter Templates
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="button button-outline button-small" onClick={() => setPage('arcade')}>Arcade</button>
          <button type="button" className="button button-primary button-small" onClick={() => setPage(user ? 'profile' : 'login')}>
            {user ? 'My Studio' : 'Sign In'}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 24px 80px' }}>
        <div style={{ marginBottom: 28 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#c4b5fd', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', padding: '5px 12px', borderRadius: 999, marginBottom: 14 }}>
            <Sparkles size={13} /> Zero-Config Browser Runtimes
          </span>
          <h1 style={{ fontSize: 'clamp(28px, 4vw, 42px)', margin: '0 0 10px' }}>Start Building in One Click</h1>
          <p style={{ color: '#94a3b8', fontSize: 16, maxWidth: 640, margin: 0 }}>
            Launch React + TypeScript (compiled live via in-browser <code>esbuild-wasm</code>), 60fps Canvas 2D arcade games, Three.js 3D worlds, WebGL2 shaders, or sleek web tools.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`button button-small ${category === cat ? 'button-primary' : 'button-outline'}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 18 }}>
          {filtered.map((tpl) => (
            <article
              key={tpl.id}
              style={{
                background: '#0f121b',
                border: '1px solid rgba(148,163,184,0.16)',
                borderRadius: 16,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ width: 34, height: 34, borderRadius: 10, background: `${tpl.accent}22`, border: `1px solid ${tpl.accent}55`, display: 'grid', placeItems: 'center', color: tpl.accent }}>
                  <Code2 size={17} />
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: '#cbd5e1' }}>
                  {tpl.badge}
                </span>
              </div>
              <div>
                <h2 style={{ margin: '0 0 6px', fontSize: 17 }}>{tpl.title}</h2>
                <p style={{ margin: 0, fontSize: 13.5, color: '#94a3b8', lineHeight: 1.55 }}>{tpl.description}</p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {tpl.stack.map((tech) => (
                  <span key={tech} style={{ fontSize: 11, color: '#94a3b8', background: 'rgba(148,163,184,0.1)', padding: '3px 8px', borderRadius: 6 }}>
                    {tech}
                  </span>
                ))}
              </div>
              <input
                value={customTitles[tpl.id] || ''}
                onChange={(e) => setCustomTitles((prev) => ({ ...prev, [tpl.id]: e.target.value }))}
                placeholder="Optional custom project name…"
                maxLength={58}
                style={{ marginTop: 'auto', background: '#080a10', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 9, padding: '8px 12px', color: '#f8fafc', fontSize: 13 }}
              />
              <button
                type="button"
                className="button button-primary"
                disabled={creatingId === tpl.id}
                onClick={() => launch(tpl)}
              >
                <Rocket size={15} /> <span>{creatingId === tpl.id ? 'Creating Workspace…' : 'Use Template'}</span>
              </button>
            </article>
          ))}
        </div>
      </main>
    </div>
  )
}
