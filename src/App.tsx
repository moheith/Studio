import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import {
  ArrowRight, ArrowUpRight, Check, Gamepad2,
  Globe2, LockKeyhole, Mail, Menu,
  Play, Sparkles,
  X, Zap,
} from 'lucide-react'
import {
  api, deleteFile, downloadProjectZip, getFile, saveFile,
  saveProjectThumbnail, setCsrfToken, streamSse, trackGamePlay,
  updateProjectDetails, uploadAsset
} from './api'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ProfilePage from './pages/ProfilePage'
import PublicProfilePage from './pages/PublicProfilePage'
import StudioPage from './pages/StudioPage'
import ArcadePage from './pages/ArcadePage'
import PlayGamePage from './pages/PlayGamePage'
import TemplatesPage from './pages/TemplatesPage'
import SettingsPage from './pages/SettingsPage'
import DocsPage from './pages/DocsPage'
import TermsPage from './pages/TermsPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import SetupProfilePage from './pages/SetupProfilePage'
import StudioBootLoader from './components/StudioBootLoader'
import StudioShowcase from './components/StudioShowcase'
import ProfileMenu from './components/ProfileMenu'
import type { Game, FileEntry, Page, User, ChatMessage } from './types'

const Hero3DCanvas = lazy(() => import('./components/Hero3DCanvas'))
function projectToGame(value: Record<string, unknown>): Game {
  const id = String(value.slug ?? value.id ?? 'project')
  const username = String(value.username ?? 'creator')
  return {
    id,
    projectId: String(value.id ?? ''),
    title: String(value.title ?? id),
    creator: username,
    genre: String(value.genre ?? 'ARCADE'),
    color: '#c7a6ff',
    art: String(value.art ?? '✦'),
    plays: String(value.plays ?? 0),
    description: String(value.description ?? 'A game made in Yulya Studio.'),
    visibility: value.visibility === 'public' ? 'public' : 'private',
    thumbnail: value.thumbnail ? String(value.thumbnail) : undefined,
    allow_remix: Boolean(value.allow_remix),
    likes_count: Number(value.likes_count ?? 0),
    play_url: value.play_url ? String(value.play_url) : undefined,
    share_url: value.share_url ? String(value.share_url) : undefined,
  }
}
function publicGameUrl(username: string, slug: string) {
  const origin = window.location.origin.replace(/\/$/, '')
  return `${origin}/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`
}

function inferMonacoLanguage(path: string): string {
  const low = path.toLowerCase()
  if (low.endsWith('.html') || low.endsWith('.htm')) return 'html'
  if (low.endsWith('.css')) return 'css'
  if (low.endsWith('.json')) return 'json'
  if (low.endsWith('.ts') || low.endsWith('.tsx')) return 'typescript'
  if (low.endsWith('.md')) return 'markdown'
  return 'javascript'
}

const RESERVED_TOP_ROUTES = new Set([
  'api', 'arcade', 'templates', 'settings', 'docs', 'terms', 'privacy',
  'login', 'register', 'verify-email', 'setup-profile', 'profile', 'studio', 'not-found',
])

function editorPath(username: string, slug: string) {
  return `/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/edit`
}

function editorRoute() {
  const parts = window.location.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  return parts.length === 3 && parts[2] === 'edit' ? { username: parts[0].toLowerCase(), slug: parts[1].toLowerCase() } : null
}

const starterFiles: Record<string, string> = {
  'index.html': `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Little Star Game</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <main class="game">\n    <div class="eyebrow">A LITTLE GAME BY YOU</div>\n    <h1>Little Star</h1>\n    <p>Make something wonderful.</p>\n    <button id="play">Start playing <span>→</span></button>\n    <div class="stars" aria-hidden="true">✦　·　✧　·　✦</div>\n  </main>\n  <script src="app.js"></script>\n</body>\n</html>`,
  'style.css': `* { box-sizing: border-box; }\nbody { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101114; color: #f7f5f1; font-family: system-ui, sans-serif; }\n.game { width: min(92vw, 440px); padding: 56px 34px; text-align: center; border: 1px solid #292a30; border-radius: 24px; background: radial-gradient(ellipse at 50% 0%, #272136, #17171c 60%); }\n.eyebrow { color: #b5a3ed; font-size: 10px; letter-spacing: .2em; font-weight: 700; }\nh1 { margin: 20px 0 8px; font-size: clamp(42px, 9vw, 64px); letter-spacing: -.06em; }\np { margin: 0; color: #a5a4ad; }\nbutton { margin: 30px 0 10px; padding: 13px 19px; border: 0; border-radius: 10px; background: #c8a9ff; color: #1c1528; font-weight: 700; cursor: pointer; }\nbutton span { margin-left: 14px; }\n.stars { margin-top: 35px; color: #e8d8ff; font-size: 22px; }`,
  'app.js': `const button = document.querySelector('#play');\nbutton.addEventListener('click', () => {\n  button.innerHTML = 'You are the star ✦';\n  document.querySelector('h1').textContent = 'Let’s go!';\n});`,
}

// Start with an empty explorer while the requested project is being loaded.
// Hard-coded placeholder folders used to flash before the server data arrived.
const initialTree: FileEntry[] = []



export default function App() {
  const pageFromPath = (): Page => {
    const route = window.location.pathname
    const fixed = ({
      '/': 'home',
      '/arcade': 'arcade',
      '/templates': 'templates',
      '/settings': 'settings',
      '/docs': 'docs',
      '/terms': 'terms',
      '/privacy': 'privacy',
      '/login': 'login',
      '/register': 'register',
      '/verify-email': 'verify-email',
      '/setup-profile': 'setup-profile',
      '/profile': 'profile',
      '/studio': 'studio',
      '/not-found': 'not-found',
    }[route] as Page | undefined)
    if (fixed) return fixed
    const parts = route.split('/').filter(Boolean)
    if (parts.length === 3 && parts[2] === 'edit') return 'studio'
    if (parts.length === 2 && !RESERVED_TOP_ROUTES.has(parts[0].toLowerCase())) return 'play'
    if (parts.length === 1) return 'profile'
    return 'home'
  }
  const [page, setPageState] = useState<Page>(pageFromPath)
  const setPage = (next: Page, pathOverride?: string) => {
    const route: Record<Page, string> = {
      home: '/',
      arcade: '/arcade',
      templates: '/templates',
      play: '/arcade',
      settings: '/settings',
      docs: '/docs',
      terms: '/terms',
      privacy: '/privacy',
      login: '/login',
      register: '/register',
      'verify-email': '/verify-email',
      'setup-profile': '/setup-profile',
      profile: '/profile',
      studio: '/studio',
      'not-found': '/not-found',
    }
    const path = pathOverride ?? (next === 'profile' && user?.username ? `/${encodeURIComponent(user.username)}` : next === 'studio' && currentGame && user?.username ? editorPath(user.username, currentGame.id) : route[next])
    setModal(null)
    if (`${window.location.pathname}${window.location.hash}` !== path) window.history.pushState({}, '', path)
    setPageState(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const [verificationEmail, setVerificationEmail] = useState(() => sessionStorage.getItem('yulya-verification-email') ?? '')
  const [user, setUser] = useState<User | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [games, setGames] = useState<Game[]>([])
  const [projects, setProjects] = useState<Game[]>([])
  const [currentGame, setCurrentGame] = useState<Game | null>(null)
  const [currentProjectId, setCurrentProjectId] = useState('')
  const [code, setCode] = useState<Record<string, string>>(starterFiles)
  const [activeFile, setActiveFile] = useState('app.js')
  const [openFiles, setOpenFiles] = useState<string[]>(['index.html', 'style.css', 'app.js'])
  const [tree, setTree] = useState(initialTree)
  const [terminalOpen, setTerminalOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1200 : true))
  const [chat, setChat] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [modal, setModal] = useState<'new-project' | 'api-key' | 'new-file' | 'game' | null>(null)
  const [toast, setToast] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [models, setModels] = useState<Array<{ id: string; display_name: string; input_token_limit?: number | null; dynamic?: boolean; resolved_model?: string | null }>>([
    { id: 'antigravity-auto', display_name: '✦ Antigravity Auto (Best Model)', dynamic: true },
  ])
  const [selectedModel, setSelectedModel] = useState<string>(() => localStorage.getItem('yulya:selected-model') || 'antigravity-auto')
  const [isAntigravityMode, setIsAntigravityMode] = useState<boolean>(true)
  const [aiMode, setAiMode] = useState<'build' | 'plan'>('build')
  const [playOrigin, setPlayOrigin] = useState<string>('')
  const [useWaterfall, setUseWaterfall] = useState<boolean>(() => {
    const saved = localStorage.getItem('yulya:use-waterfall')
    return saved !== null ? saved === 'true' : true
  })
  const [projectName, setProjectName] = useState('little-star')
  const [projectTemplate, setProjectTemplate] = useState('blank')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [saveState, setSaveState] = useState('Saved')
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set())
  const [previewKey, setPreviewKey] = useState(0)
  const [newFileName, setNewFileName] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [selectedGenre, setSelectedGenre] = useState('ALL')
  const [previewUrl, setPreviewUrl] = useState('')
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const aiAbortController = useRef<AbortController | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)

  const stopAiGeneration = () => {
    if (aiAbortController.current) {
      aiAbortController.current.abort()
      aiAbortController.current = null
      setIsAiGenerating(false)
      notify('AI generation cancelled')
    }
  }

  useEffect(() => {
    const onRouteChange = () => setPageState(pageFromPath())
    window.addEventListener('popstate', onRouteChange)
    window.addEventListener('hashchange', onRouteChange)
    return () => { window.removeEventListener('popstate', onRouteChange); window.removeEventListener('hashchange', onRouteChange) }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (page === 'arcade') {
      document.title = 'Community Arcade — Play Free Online Web Games | Yulya Studio'
    } else if (page === 'studio') {
      document.title = currentGame?.title
        ? `${currentGame.title} — Yulya Studio IDE & Game Engine`
        : 'Studio IDE — Next-Gen Web Game Engine'
    } else if (page === 'profile') {
      document.title = user?.username
        ? `@${user.username} — Creator Profile | Yulya Studio`
        : 'My Studio Profile — Yulya Studio'
    } else if (page === 'terms') {
      document.title = 'Terms of Service & Conditions — Yulya Studio'
    } else if (page === 'privacy') {
      document.title = 'Privacy Policy & Data Transparency — Yulya Studio'
    } else if (page === 'login') {
      document.title = 'Sign In — Yulya Studio Game Maker'
    } else if (page === 'register') {
      document.title = 'Create Account — Yulya Studio Game Maker'
    } else {
      document.title = 'Yulya Studio — Next-Gen Game Maker, Browser IDE & Online Arcade'
    }
  }, [page, currentGame?.title, user?.username])

  const selectModelPersisted = (nextId: string) => {
    setSelectedModel(nextId)
    if (nextId && nextId !== 'connect-key') localStorage.setItem('yulya:selected-model', nextId)
  }

  const refreshModels = async (silent = true, preferredModel?: string) => {
    try {
      const result = await api<{ models: Array<{ id: string; display_name: string; input_token_limit?: number | null; dynamic?: boolean; resolved_model?: string | null }>; total_chat_models?: number }>('/api/models')
      setModels(result.models)
      setSelectedModel((curr) => {
        const saved = preferredModel || curr || localStorage.getItem('yulya:selected-model') || ''
        if (saved && result.models.some((m) => m.id === saved)) return saved
        return result.models[0]?.id ?? ''
      })
      if (!silent) notify(`Synced ${result.total_chat_models ?? Math.max(0, result.models.length - 1)} live chat models from Google AI`)
    } catch (err) {
      if (!silent) notify(err instanceof Error ? err.message : 'Could not refresh Gemini models')
    }
  }

  useEffect(() => {
    api<{ play_origin?: string }>('/api/health').then((h) => { if (h.play_origin) setPlayOrigin(h.play_origin) }).catch(() => {})
    api<{ user: User; csrf_token: string; needs_username: boolean; play_origin?: string }>('/api/auth/me').then(async (session) => {
      if (session.play_origin) setPlayOrigin(session.play_origin)
      setCsrfToken(session.csrf_token); setUser(session.user); setHasKey(Boolean((session.user as User & { has_api_key?: boolean }).has_api_key))
      if ((session.user as User & { has_api_key?: boolean }).has_api_key) void refreshModels(true)
      if (session.needs_username || !session.user?.username) setPage('setup-profile')
      else { const data = await api<{ projects: Array<Record<string, unknown>> }>('/api/projects').catch(() => ({ projects: [] })); setProjects(data.projects.map(projectToGame)) }
    }).catch(() => {}).finally(() => setSessionReady(true))
    api<{ projects: Array<Record<string, unknown>> }>('/api/gallery').then((data) => setGames(data.projects.map(projectToGame))).catch(() => {})
  }, [])

  useEffect(() => {
    if (page === 'studio' && hasKey) {
      void refreshModels(true)
    }
  }, [page, hasKey])

  useEffect(() => {
    // Keep the old profile route as a compatible entry point, but expose the
    // creator's username as the single canonical profile URL.
    if (sessionReady && page === 'profile' && window.location.pathname === '/profile' && user?.username) {
      window.history.replaceState({}, '', `/${encodeURIComponent(user.username)}`)
    }
  }, [sessionReady, page, user?.username])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (!currentProjectId || !activeFile) { setToast('Open a project file before saving'); return }
        window.clearTimeout(saveTimer.current)
        setSaveState('Saving…')
        saveFile(currentProjectId, activeFile, code[activeFile] ?? '').then(() => { setSaveState('Saved'); setDirtyFiles(prev => { const next = new Set(prev); next.delete(activeFile); return next }); setPreviewKey(value => value + 1); setToast('Project saved') }).catch(error => { setSaveState('Save failed'); setToast(error instanceof Error ? error.message : 'Could not save project') })
      }
      if (event.key === 'Escape') { setModal(null); setMobileNav(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentProjectId, activeFile, code])

  useEffect(() => {
    if (!currentProjectId || !activeFile) return
    if (code[activeFile] === undefined && /\.(html|htm|css|js|mjs|cjs|ts|tsx|jsx|json|md|glsl|vert|frag|txt|csv|tsv)$/i.test(activeFile)) {
      getFile(currentProjectId, activeFile).then(res => {
        setCode(prev => ({ ...prev, [activeFile]: res.content }))
      }).catch(() => {})
    }
  }, [currentProjectId, activeFile, code])

  const language = useMemo(() => inferMonacoLanguage(activeFile), [activeFile])
  const openStudio = async (game?: Game) => {
    if (game) { setCurrentGame(game); setCurrentProjectId('') }
    const project = game ?? currentGame
    if (project && user?.username) setPage('studio', editorPath(user.username, project.id))
    else setPage('studio')
    setModal(null)
    if (game?.projectId) await loadProject(game.projectId, game)
  }
  const notify = (message: string) => setToast(message)
  const handleEditor = (value?: string) => {
    const content = value ?? ''
    setCode((previous) => ({ ...previous, [activeFile]: content }))
    setDirtyFiles((prev) => new Set(prev).add(activeFile))
    setSaveState('Unsaved')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      if (currentProjectId) {
        saveFile(currentProjectId, activeFile, content).then(() => {
          setSaveState('Saved')
          setDirtyFiles((prev) => {
            const next = new Set(prev)
            next.delete(activeFile)
            return next
          })
          setPreviewKey((v) => v + 1)
        }).catch((error) => {
          setSaveState('Save failed')
          notify(error.message)
        })
      } else {
        setSaveState('Local preview')
      }
    }, 600)
  }
  const createProjectWithTemplate = async (title: string, vis: 'private' | 'public', tplId = 'blank') => {
    if (!user) { setPage('login'); setModal(null); return }
    const result = await api<{ project: Record<string, unknown> }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ title, visibility: vis, template_id: tplId }),
    })
    const project = projectToGame(result.project)
    setProjects((items) => [project, ...items])
    setCurrentGame(project)
    setCurrentProjectId(project.projectId ?? '')
    setCode(starterFiles)
    setTree(initialTree)
    setPage('studio', editorPath(user.username, project.id))
    setModal(null)
    if (project.projectId) await loadProject(project.projectId, project)
  }

  const handleNewProject = async () => {
    try {
      await createProjectWithTemplate(projectName, visibility, projectTemplate)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not create project')
    }
  }
  const submitPrompt = async (attachedImages?: string[]) => {
    const cleanImgs = (attachedImages || []).filter((u) => typeof u === 'string' && u.startsWith('data:image/')).slice(0, 4)
    if (!chat.trim() && cleanImgs.length === 0) return
    if (!hasKey) { setModal('api-key'); notify('Connect your Google Gemini API key to use AI Copilot'); return }
    if (!selectedModel) { notify('Choose an available Gemini model first'); return }
    const prompt = chat.trim() || 'Inspect the attached image(s) and help me with this.'
    setChat('')
    const userMsgId = Date.now().toString()
    const aiMsgId = (Date.now() + 1).toString()
    const modelTag = isAntigravityMode
      ? (selectedModel.toLowerCase().includes('antigravity') ? selectedModel : `✦ Antigravity (${selectedModel})`)
      : selectedModel
    setChatMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user', text: prompt, images: cleanImgs.length ? cleanImgs : undefined, time: Date.now() },
      { id: aiMsgId, role: 'ai', text: 'Thinking…', time: Date.now(), tools: [], media: [], model: modelTag }
    ])
    if (!currentProjectId) {
      setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: 'Studio AI: Open a project to start an AI coding session.' } : m))
      return
    }
    const controller = new AbortController()
    aiAbortController.current = controller
    setIsAiGenerating(true)

    // Cooldown / inactivity timeout: automatically aborts if no output arrives within 3000s
    let activityTimer: number | undefined
    const resetActivityTimer = () => {
      if (activityTimer) window.clearTimeout(activityTimer)
      activityTimer = window.setTimeout(() => {
        controller.abort()
        setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: 'Studio AI: Request timed out after 3000 seconds with no response from the model.' } : m))
        notify('AI request timed out')
      }, 3000 * 1000)
    }
    resetActivityTimer()

    try {
      let answer = ''
      const toolsUsed: string[] = []
      for await (const event of streamSse(
        `/api/projects/${currentProjectId}/ai/stream`,
        { prompt, model: selectedModel, antigravity: isAntigravityMode, waterfall: useWaterfall, mode: aiMode, images: cleanImgs },
        controller.signal,
      )) {
        resetActivityTimer()
        if (event.type === 'thought') {
          const chunk = event.data.text || ''
          setChatMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            thought: (m.thought || '') + chunk
          } : m))
        }
        if (event.type === 'token') {
          answer += event.data.text
          setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: answer, tools: [...toolsUsed] } : m))
        }
        if (event.type === 'media' && event.data?.url) {
          const mediaItem = event.data
          setChatMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            media: [...(m.media || []), mediaItem]
          } : m))
        }
        if (event.type === 'tool') {
          const actionName = event.data.name || 'write_file'
          const label = actionName === 'create_folder'
            ? `Created folder ${event.data.path}`
            : actionName === 'create_file'
            ? `Created ${event.data.path}`
            : actionName === 'rename_file'
            ? `Renamed ${event.data.old_path || ''} → ${event.data.path}`
            : actionName === 'generate_image_asset'
            ? `Generated image ${event.data.path}`
            : actionName === 'generate_audio_asset'
            ? `Generated voice audio ${event.data.path}`
            : actionName === 'capture_cover_snapshot'
            ? `Updated Arcade cover snapshot`
            : actionName === 'update_project_metadata'
            ? `Updated project details`
            : actionName === 'url_fetch'
            ? `Fetched ${event.data.path}`
            : actionName === 'search_grounding'
            ? `Grounded with Google Search: "${event.data.query || event.data.path || ''}"`
            : `Updated ${event.data.path}`
          if (actionName !== 'search_grounding' && actionName !== 'url_fetch') {
            toolsUsed.push(event.data.path)
            setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, tools: [...toolsUsed] } : m))
          }
          notify(label)
        }
        if (event.type === 'grounding') {
          const gData = event.data
          setChatMessages(prev => prev.map(m => {
            if (m.id !== aiMsgId) return m
            const existingQueries = m.grounding?.queries || []
            const existingSources = m.grounding?.sources || []
            const newQueries: string[] = gData.queries ? gData.queries : (gData.query ? [gData.query] : [])
            const mergedQueries = Array.from(new Set([...existingQueries, ...newQueries]))

            const seenUrls = new Set(existingSources.map(s => s.url))
            const mergedSources = [...existingSources]
            for (const s of (gData.sources || [])) {
              if (s && s.url && !seenUrls.has(s.url)) {
                seenUrls.add(s.url)
                mergedSources.push(s)
              }
            }
            return {
              ...m,
              grounding: {
                queries: mergedQueries,
                sources: mergedSources
              }
            }
          }))
        }
        if (event.type === 'waterfall_transition') {
          const trans = event.data
          setChatMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            waterfallTransitions: [...(m.waterfallTransitions || []), trans]
          } : m))
          notify(`⚡ Cascaded from ${trans.from_alias} to ${trans.to_alias} (${trans.to_model})`)
        }
        if (event.type === 'telemetry') {
          const telem = event.data
          setChatMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            telemetry: telem
          } : m))
          setUser(curr => {
            if (!curr) return curr
            const prevTok = curr.tokens || { total_tokens: 0, input_tokens: 0, output_tokens: 0, max_single_turn_tokens: 0, turns_count: 0 }
            const inTok = telem.models?.reduce((acc: number, m: any) => acc + (m.input_tokens || 0), 0) || 0
            const outTok = telem.models?.reduce((acc: number, m: any) => acc + (m.output_tokens || 0), 0) || 0
            const totTok = telem.total_tokens || (inTok + outTok)
            return {
              ...curr,
              tokens: {
                total_tokens: prevTok.total_tokens + totTok,
                input_tokens: prevTok.input_tokens + inTok,
                output_tokens: prevTok.output_tokens + outTok,
                max_single_turn_tokens: Math.max(prevTok.max_single_turn_tokens || 0, totTok),
                turns_count: (prevTok.turns_count || 0) + 1
              }
            }
          })
        }
        if (event.type === 'reload_preview') setPreviewKey(v => v + 1)
        if (
          event.type === 'inspect_game_screen' ||
          event.type === 'get_preview_state' ||
          event.type === 'evaluate_in_preview' ||
          event.type === 'send_game_input' ||
          event.type === 'set_game_device' ||
          event.type === 'stop_game_playtest'
        ) {
          window.dispatchEvent(new CustomEvent('yulya:ai-game-action', { detail: event }))
        }
        if (event.type === 'error') {
          const errMsg = event.data.message || event.data.text || (typeof event.data === 'string' ? event.data : JSON.stringify(event.data))
          setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: `Error: ${errMsg}` } : m))
          notify(`AI Error: ${errMsg}`)
          return
        }
      }
      if (toolsUsed.length > 0) {
        const current = await api<{ files: Array<{ path: string }> }>(`/api/projects/${currentProjectId}/files`)
        const nextCode: Record<string, string> = {}
        for (const file of current.files) {
          if (/\.(html|htm|css|js|mjs|cjs|ts|tsx|jsx|json|md|glsl|vert|frag|txt|csv|tsv)$/i.test(file.path)) {
            nextCode[file.path] = (await getFile(currentProjectId, file.path)).content
          }
        }
        setCode(nextCode)
        setTree(current.files.map(file => ({
          name: file.path,
          kind: 'file',
          language: inferMonacoLanguage(file.path)
        })))
        setPreviewKey(v => v + 1)
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        notify('AI generation stopped')
      } else {
        const errorMsg = error instanceof Error ? error.message : String(error)
        setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: `Error: ${errorMsg}` } : m))
        notify(`Error: ${errorMsg}`)
      }
    } finally {
      if (activityTimer) window.clearTimeout(activityTimer)
      setIsAiGenerating(false)
      aiAbortController.current = null
    }
  }
  const shareLink = async () => {
    if (!currentGame) return
    if (currentGame.visibility === 'public') {
      navigator.clipboard?.writeText(publicGameUrl(user?.username ?? currentGame.creator, currentGame.id)).catch(() => {})
      notify('Public game link copied!')
      return
    }
    // For private WIP projects, copy the exact isolated 24h live preview URL so others can view the live game preview safely (read-only, zero IDE access)
    let liveUrl = previewUrl
    if (!liveUrl && currentProjectId) {
      try {
        const token = await api<{ url: string; play_origin?: string }>(`/api/projects/${currentProjectId}/preview-token`, { method: 'POST', body: '{}' })
        if (token.play_origin) setPlayOrigin(token.play_origin)
        liveUrl = token.url
        setPreviewUrl(token.url)
      } catch {}
    }
    if (liveUrl) {
      navigator.clipboard?.writeText(liveUrl).catch(() => {})
      notify('Copied 24h isolated live preview link (read-only)')
    } else {
      notify('Save or publish the project to copy a live preview link')
    }
  }
  const refreshPreviewToken = async () => {
    if (!currentProjectId || !currentGame) return
    if (currentGame.visibility === 'public') {
      const origin = (playOrigin || window.location.origin).replace(/\/$/, '')
      setPreviewUrl(`${origin}/api/games/${encodeURIComponent(user?.username ?? currentGame.creator)}/${encodeURIComponent(currentGame.id)}/index.html`)
      setPreviewKey((v) => v + 1)
      return
    }
    try {
      const token = await api<{ url: string; play_origin?: string }>(`/api/projects/${currentProjectId}/preview-token`, { method: 'POST', body: '{}' })
      if (token.play_origin) setPlayOrigin(token.play_origin)
      if (token.url) setPreviewUrl(token.url)
      setPreviewKey((v) => v + 1)
    } catch {}
  }
  const toggleVisibility = async () => {
    if (!currentProjectId || !currentGame) return
    const next = currentGame.visibility === 'public' ? 'private' : 'public'
    try {
      const visRes = await api<{ visibility: string; url?: string | null; play_url?: string | null }>(`/api/projects/${currentProjectId}/visibility`, { method: 'PATCH', body: JSON.stringify({ visibility: next }) })
      const updated = { ...currentGame, visibility: next as 'public' | 'private', play_url: visRes.play_url || undefined }
      setCurrentGame(updated); setProjects(items => items.map(item => item.projectId === currentProjectId ? updated : item))
      if (next === 'public') setPreviewUrl(visRes.play_url || `${(playOrigin || window.location.origin).replace(/\/$/, '')}/${encodeURIComponent(user?.username ?? currentGame.creator)}/${encodeURIComponent(updated.id)}/`)
      else { const token = await api<{url:string; play_origin?: string}>(`/api/projects/${currentProjectId}/preview-token`, { method: 'POST', body: '{}' }); if (token.play_origin) setPlayOrigin(token.play_origin); setPreviewUrl(token.url) }
      setPreviewKey(v => v + 1); notify(next === 'public' ? 'Project is now public in the Arcade' : 'Project is now private')
    }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not change visibility') }
  }
  const toggleProjectVisibility = async (project: Game) => {
    const id = project.projectId || project.id
    if (!id) return
    const next = project.visibility === 'public' ? 'private' : 'public'
    try {
      await api(`/api/projects/${id}/visibility`, { method: 'PATCH', body: JSON.stringify({ visibility: next }) })
      const updated = { ...project, visibility: next as 'public' | 'private' }
      setProjects(items => items.map(item => (item.projectId === id || item.id === id) ? updated : item))
      notify(next === 'public' ? `"${project.title}" is now public in the arcade` : `"${project.title}" is now private`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not change visibility')
    }
  }

  const handleUpdateProjectDetails = async (projectId: string, details: { title: string; description: string; genre: string; allow_remix?: boolean }) => {
    try {
      const res = await updateProjectDetails(projectId, details)
      const updated = projectToGame(res.project)
      setProjects(prev => prev.map(p => (p.projectId === projectId || p.id === projectId) ? updated : p))
      setGames(prev => prev.map(g => (g.projectId === projectId || g.id === projectId) ? updated : g))
      if (currentGame && (currentGame.projectId === projectId || currentGame.id === projectId)) {
        setCurrentGame(updated)
      }
      notify('Game details updated')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update project details')
      throw err
    }
  }

  const handleUpdateThumbnail = async (projectId: string, thumbnailDataUrl: string) => {
    try {
      await saveProjectThumbnail(projectId, thumbnailDataUrl)
      const pIdLow = projectId.toLowerCase()
      setProjects(prev => prev.map(p => (p.projectId === projectId || p.id === projectId || p.id.toLowerCase() === pIdLow || (p.projectId && p.projectId.toLowerCase() === pIdLow)) ? { ...p, thumbnail: thumbnailDataUrl } : p))
      setGames(prev => prev.map(g => (g.projectId === projectId || g.id === projectId || g.id.toLowerCase() === pIdLow || (g.projectId && g.projectId.toLowerCase() === pIdLow)) ? { ...g, thumbnail: thumbnailDataUrl } : g))
      if (currentGame && (currentGame.projectId === projectId || currentGame.id === projectId || currentGame.id.toLowerCase() === pIdLow || (currentGame.projectId && currentGame.projectId.toLowerCase() === pIdLow))) {
        setCurrentGame(prev => prev ? { ...prev, thumbnail: thumbnailDataUrl } : prev)
      }
      notify('📸 Cover snapshot saved')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save cover snapshot')
      throw err
    }
  }

  const handleTrackPlay = (username: string, slug: string) => {
    trackGamePlay(username, slug).then(newPlays => {
      if (newPlays > 0) {
        setGames(prev => prev.map(g => (g.creator.toLowerCase() === username.toLowerCase() && g.id.toLowerCase() === slug.toLowerCase()) ? { ...g, plays: String(newPlays) } : g))
        setProjects(prev => prev.map(p => (p.creator.toLowerCase() === username.toLowerCase() && p.id.toLowerCase() === slug.toLowerCase()) ? { ...p, plays: String(newPlays) } : p))
      }
    }).catch(() => {})
  }

  const handleDownloadZip = async (project: Game) => {
    const id = project.projectId || project.id
    if (!id) return
    try {
      notify('Packaging project into .zip…')
      await downloadProjectZip(id, project.title || project.id)
      notify('Game .zip downloaded')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not download ZIP archive')
    }
  }
  const deleteProject = async (projectId: string) => {
    try {
      await api(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' })
      setProjects((current) => current.filter((p) => p.projectId !== projectId && p.id !== projectId))
      if (currentProjectId === projectId) {
        setCurrentProjectId('')
        setCurrentGame(null)
      }
      notify('Project and all associated code & AI chat history were permanently deleted')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete project')
      throw err
    }
  }
  const saveKey = async () => {
    if (apiKey.trim().length < 12) throw new Error('Enter a valid Gemini API key')
    // The POST validates and stores the key, returning the model that passed.
    const verified = await api<{ verified_model?: string; fallback_used?: boolean }>('/api/keys/gemini', { method: 'POST', body: JSON.stringify({ api_key: apiKey.trim() }) })
    setHasKey(true); setApiKey(''); setModal(null); notify(verified.fallback_used ? `Key connected with ${verified.verified_model ?? 'Gemma'} fallback` : 'Gemini key verified and connected')
    try {
      await refreshModels(true, verified.verified_model || 'antigravity-auto')
    } catch {
      notify('Key connected. Models could not be loaded yet; try again shortly.')
    }
  }
  const removeKey = async () => {
    try { await api('/api/keys/gemini', { method: 'DELETE' }); setHasKey(false); setModels([]); setSelectedModel(''); setModal(null); notify('Gemini key removed') }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not remove key') }
  }
  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }) } catch { /* clear the local view even if the API is offline */ }
    setCsrfToken(''); setUser(null); setProjects([]); setHasKey(false); setModels([]); setSelectedModel(''); setPage('home'); notify('Signed out')
  }
  const completeLogin = (nextUser: User, csrf: string, needsUsername?: boolean) => {
    setCsrfToken(csrf)
    setUser(nextUser)
    setHasKey(Boolean((nextUser as User & { has_api_key?: boolean }).has_api_key))
    api<{ projects: Array<Record<string, unknown>> }>('/api/projects').then(result => setProjects(result.projects.map(projectToGame))).catch(() => {})
    if ((nextUser as User & { has_api_key?: boolean }).has_api_key) void refreshModels(true)
    if (needsUsername || !nextUser.username) { setPage('setup-profile'); return }
    const returnTo = sessionStorage.getItem('yulya:return-to')
    if (returnTo) { sessionStorage.removeItem('yulya:return-to'); setPage('studio', returnTo) }
    else setPage('profile', nextUser.username ? `/${encodeURIComponent(nextUser.username)}` : '/profile')
  }
  const addFile = (explicitName?: string) => {
    const raw = typeof explicitName === 'string' ? explicitName : newFileName
    const name = raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim()
    if (!name || name.includes('..') || !/\.(html|htm|css|js|mjs|cjs|ts|tsx|jsx|json|md|glsl|vert|frag|txt|csv|tsv|svg|png|jpe?g|webp|gif|mp3|wav|ogg|mp4|webm|woff2?)$/i.test(name)) { notify('Use a supported browser file name'); return }
    setTree((items) => items.some((file) => file.name === name) ? items : [...items, { name, kind: 'file', language: inferMonacoLanguage(name) }])
    setCode((files) => ({ ...files, [name]: files[name] ?? '' }))
    setActiveFile(name)
    setOpenFiles((tabs) => tabs.includes(name) ? tabs : [...tabs, name])
    setNewFileName('')
    setModal(null)
    if (currentProjectId) saveFile(currentProjectId, name, '').catch((error) => notify(error.message))
  }
  const renameProjectFile = async (oldPath: string, newPath: string) => {
    if (!currentProjectId || oldPath === newPath) return
    if (oldPath === 'index.html') {
      notify('index.html is required and cannot be renamed')
      return
    }
    const clean = newPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim()
    if (!clean || clean.includes('..') || !/\.(html|htm|css|js|mjs|cjs|ts|tsx|jsx|json|md|glsl|vert|frag|txt|csv|tsv|svg|png|jpe?g|webp|gif|mp3|wav|ogg|mp4|webm|woff2?)$/i.test(clean)) {
      notify('Please enter a valid file name with supported extension')
      return
    }
    if (code[clean] !== undefined) {
      notify(`File "${clean}" already exists`)
      return
    }
    try {
      const content = code[oldPath] ?? ''
      await saveFile(currentProjectId, clean, content)
      await deleteFile(currentProjectId, oldPath)
      setCode((files) => {
        const copy = { ...files }
        copy[clean] = copy[oldPath] ?? ''
        delete copy[oldPath]
        return copy
      })
      setTree((items) => items.map(f => f.name === oldPath ? {
        ...f,
        name: clean,
        language: clean.endsWith('.css') ? 'css' : clean.endsWith('.html') ? 'html' : clean.endsWith('.json') ? 'json' : 'javascript'
      } : f))
      setOpenFiles((tabs) => tabs.map(t => t === oldPath ? clean : t))
      if (activeFile === oldPath) setActiveFile(clean)
      setPreviewKey((v) => v + 1)
      notify(`Renamed to ${clean}`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not rename file')
      throw error
    }
  }
  const deleteProjectFile = async (filePath: string) => {
    if (!currentProjectId) return
    if (filePath === 'index.html') {
      notify('index.html is required for every game project and cannot be deleted')
      return
    }
    try {
      await deleteFile(currentProjectId, filePath)
      setTree((items) => items.filter((f) => f.name !== filePath))
      setCode((files) => {
        const copy = { ...files }
        delete copy[filePath]
        return copy
      })
      setOpenFiles((tabs) => {
        const next = tabs.filter((t) => t !== filePath)
        return next.length > 0 ? next : ['index.html']
      })
      setActiveFile((curr) => (curr === filePath ? 'index.html' : curr))
      setPreviewKey((v) => v + 1)
      notify(`Deleted ${filePath}`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not delete file')
    }
  }
  const uploadProjectAsset = async (file: File) => {
    if (!currentProjectId) { notify('Open a saved project before uploading assets'); return }
    try {
      const result = await uploadAsset(currentProjectId, file)
      setTree(items => items.some(item => item.name === result.path) ? items : [...items, { name: result.path, kind: 'file', language: 'javascript' }])
      setPreviewKey(value => value + 1); notify(`Uploaded ${result.path}`)
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not upload asset') }
  }

  const loadProject = async (id: string, meta: Game) => {
    try {
      // 1. Concurrently fetch AI chat history in the background so it never stalls editor booting
      const historyPromise = api<{ conversations: Array<{ id: string; prompt: string; response: string; error?: string; status?: string; thought?: string; model?: string; created_at: number; telemetry?: any; grounding?: any; media?: any[] }> }>(`/api/projects/${id}/ai/history`).catch(() => ({ conversations: [] }))

      let loaded: Record<string, string> = {}
      let treeList: FileEntry[] = []
      let precomputedPreview = ''

      // 2. Try fetching the entire project bundle in one fast database query
      try {
        const bundle = await api<{
          project: Record<string, unknown>
          files: Array<{ path: string; size: number; etag: string; content: string | null }>
          preview_url: string
          play_origin?: string
        }>(`/api/projects/${id}/bundle`)

        if (bundle.play_origin) setPlayOrigin(bundle.play_origin)
        precomputedPreview = bundle.preview_url || ''
        for (const file of bundle.files) {
          if (file.content !== null && file.content !== undefined) {
            loaded[file.path] = file.content
          }
          treeList.push({
            name: file.path,
            kind: 'file',
            language: inferMonacoLanguage(file.path)
          })
        }
      } catch {
        // Fallback: parallel fetch if bundle endpoint is unavailable
        const result = await api<{ files: Array<{ path: string }> }>(`/api/projects/${id}/files`)
        treeList = result.files.map(file => ({
          name: file.path,
          kind: 'file',
          language: file.path.endsWith('.css') ? 'css' : file.path.endsWith('.html') ? 'html' : file.path.endsWith('.json') ? 'json' : 'javascript'
        }))
        const textFiles = result.files.filter(f => /\.(html|css|js|mjs|json|svg|txt)$/i.test(f.path))
        const fetched = await Promise.all(textFiles.map(f => getFile(id, f.path).then(res => ({ path: f.path, content: res.content })).catch(() => ({ path: f.path, content: '' }))))
        for (const f of fetched) {
          loaded[f.path] = f.content
        }
      }

      // Immediately activate project state
      setCurrentProjectId(id)
      setCurrentGame(meta)
      setCode(loaded)
      setTree(treeList)
      const firstFile = Object.keys(loaded)[0] || 'index.html'
      setActiveFile(prev => loaded[prev] !== undefined ? prev : firstFile)
      setOpenFiles(prev => {
        const valid = prev.filter(f => loaded[f] !== undefined)
        return valid.length ? valid : Object.keys(loaded).slice(0, 5)
      })

      // Resolve isolated sandbox preview URL (NEVER point preview iframe at studio APP_ORIGIN which sets X-Frame-Options: DENY!)
      if (precomputedPreview) {
        setPreviewUrl(precomputedPreview)
      } else if (meta.visibility === 'public') {
        const origin = (playOrigin || window.location.origin).replace(/\/$/, '')
        setPreviewUrl(`${origin}/api/games/${encodeURIComponent(meta.creator)}/${encodeURIComponent(meta.id)}/index.html`)
      } else {
        api<{ url: string; play_origin?: string }>(`/api/projects/${id}/preview-token`, { method: 'POST', body: '{}' })
          .then(res => { if (res.play_origin) setPlayOrigin(res.play_origin); setPreviewUrl(res.url) })
          .catch(() => {})
      }

      // Populate AI history when the concurrent request finishes
      historyPromise.then(historyData => {
        if (historyData?.conversations) {
          const msgs: ChatMessage[] = []
          for (const conv of historyData.conversations) {
            if (conv.prompt) {
              msgs.push({ id: `${conv.id}-user`, role: 'user', text: conv.prompt, time: conv.created_at })
            }
            const aiText = conv.response || (conv.error ? (conv.error.startsWith('Error:') ? conv.error : `Error: ${conv.error}`) : (conv.status === 'error' ? 'Error: AI generation failed.' : ''))
            if (aiText || conv.thought || conv.telemetry || conv.status === 'error') {
              msgs.push({
                id: `${conv.id}-ai`,
                role: 'ai',
                text: aiText || 'Error: Generation failed',
                thought: conv.thought,
                time: conv.created_at,
                model: conv.model,
                telemetry: conv.telemetry,
                grounding: conv.grounding,
                media: conv.media || [],
                waterfallTransitions: conv.telemetry?.waterfallTransitions || []
              })
            }
          }
          setChatMessages(msgs)
        }
      }).catch(() => {})
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not open project') }
  }

  const clearChatHistory = async () => {
    if (!currentProjectId) return
    try {
      await api(`/api/projects/${currentProjectId}/ai/history`, { method: 'DELETE', body: '{}' })
      setChatMessages([])
      notify('This project’s AI chat history was cleared')
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not clear chat history') }
  }

  const reloadProjectFiles = async () => {
    if (!currentProjectId || !currentGame) return
    await loadProject(currentProjectId, currentGame)
    notify('Project files refreshed')
  }

  const updateWaterfall = async (models: string[]) => {
    try {
      const res = await api<{ waterfall: string[] }>('/api/profile/waterfall', {
        method: 'PUT',
        body: JSON.stringify({ models })
      })
      setUser(curr => curr ? { ...curr, waterfall: res.waterfall } : curr)
      notify('Waterfall cascade models saved to your profile')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save waterfall')
      throw err
    }
  }

  useEffect(() => {
    if (page !== 'studio' || !sessionReady || currentProjectId || currentGame) return
    const route = editorRoute()
    if (!route) { setPage(user ? 'profile' : 'home'); return }
    if (!user) {
      sessionStorage.setItem('yulya:return-to', window.location.pathname)
      setPage('login')
      return
    }
    if (user.username.toLowerCase() !== route.username) { setPageState('not-found'); return }
    api<{ projects: Array<Record<string, unknown>> }>('/api/projects')
      .then((result) => {
        const match = result.projects.find((project) => String(project.slug ?? '').toLowerCase() === route.slug)
        if (!match) { setPageState('not-found'); return }
        const game = projectToGame(match)
        setProjects(result.projects.map(projectToGame))
        return loadProject(game.projectId ?? '', game)
      })
      .catch(() => setPageState('not-found'))
  }, [page, sessionReady, user, currentProjectId, currentGame])

  if (page === 'studio' && !currentProjectId) {
    if (sessionReady && !editorRoute()) { setPage(user ? 'profile' : 'home'); return null }
    return (
      <StudioBootLoader
        game={currentGame}
        onCancel={() => setPage(user ? 'profile' : 'home')}
      />
    )
  }
  if (page === 'setup-profile' && user) return <>
    <SetupProfilePage user={user} onComplete={(updatedUser) => { setUser(updatedUser); setPage('profile', `/${encodeURIComponent(updatedUser.username)}`) }} notify={notify} />
    {toast && <div className="toast" role="status" aria-live="polite"><Check size={15}/>{toast}</div>}
  </>
  if (page === 'login') return <>
    <LoginPage onBack={() => setPage('home')} onRegister={() => setPage('register')} onLogin={completeLogin} notify={notify} />
    {toast && <div className="toast" role="status" aria-live="polite"><Check size={15}/>{toast}</div>}
  </>
  if (page === 'register') return <>
    <RegisterPage onBack={() => setPage('home')} onLogin={() => setPage('login')} onGoogleSuccess={completeLogin} onRegistered={(email) => { setVerificationEmail(email); sessionStorage.setItem('yulya-verification-email', email); setPage('verify-email') }} notify={notify} />
    {toast && <div className="toast" role="status" aria-live="polite"><Check size={15}/>{toast}</div>}
  </>
  if (page === 'verify-email') return <>
    <VerifyEmailPage email={verificationEmail} onBack={() => setPage('register')} onLogin={(nextUser, csrf) => { sessionStorage.removeItem('yulya-verification-email'); completeLogin(nextUser, csrf) }} notify={notify} />
    {toast && <div className="toast" role="status" aria-live="polite"><Check size={15}/>{toast}</div>}
  </>
  if (page === 'play') {
    const parts = window.location.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const targetUser = (parts[0] || currentGame?.creator || '').replace(/^@/, '')
    const targetSlug = parts[1] || currentGame?.id || ''
    return (
      <>
        <PlayGamePage
          username={targetUser}
          slug={targetSlug}
          user={user}
          playOrigin={playOrigin}
          setPage={setPage}
          onOpenCreatorProfile={(u) => setPage('profile', `/@${encodeURIComponent(u)}`)}
          onOpenRemixedProject={async (proj) => {
            const game = projectToGame(proj)
            setProjects((items) => [game, ...items])
            await openStudio(game)
          }}
          notify={notify}
        />
        {toast && <div className="toast" role="status" aria-live="polite"><Check size={15}/>{toast}</div>}
      </>
    )
  }
  if (page === 'templates') {
    return (
      <>
        <TemplatesPage
          user={user}
          setPage={setPage}
          onCreateFromTemplate={async (tplId, title) => {
            await createProjectWithTemplate(title, 'private', tplId)
          }}
          notify={notify}
        />
        {modal === 'api-key' && <KeyModal value={apiKey} setValue={setApiKey} close={() => setModal(null)} save={saveKey} remove={removeKey} hasKey={hasKey}/>}
        {toast && <div className="toast" role="status" aria-live="polite"><Check size={15}/>{toast}</div>}
      </>
    )
  }
  if (page === 'settings') {
    return (
      <>
        <SettingsPage
          user={user}
          hasKey={hasKey}
          setPage={setPage}
          onOpenKeyModal={() => setModal('api-key')}
          onAccountDeleted={() => {
            setCsrfToken(''); setUser(null); setProjects([]); setHasKey(false); setModels([]); setSelectedModel(''); setPage('home')
          }}
          notify={notify}
        />
        {modal === 'api-key' && <KeyModal value={apiKey} setValue={setApiKey} close={() => setModal(null)} save={saveKey} remove={removeKey} hasKey={hasKey}/>}
        {toast && <div className="toast" role="status" aria-live="polite"><Check size={15}/>{toast}</div>}
      </>
    )
  }
  if (page === 'profile') {
    // Strip leading '@' so /@username links resolve cleanly (BUG-02)
    const routeUsername = decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[0] ?? '').replace(/^@/, '')
    const isOwnProfile = window.location.pathname === '/profile' || Boolean(user?.username && routeUsername.toLowerCase() === user.username.toLowerCase())
    if (!isOwnProfile && routeUsername) {
      if (!sessionReady) return <main className="public-profile-shell"><div className="public-profile-loading">Loading creator profile…</div></main>
      return <PublicProfilePage username={routeUsername} onHome={() => setPage('home')}/>
    }
    return <>
    <ProfilePage
    user={user} hasKey={hasKey} projects={projects}
    onHome={() => setPage('home')} onArcade={() => setPage('arcade')}
    onTemplates={() => setPage('templates')}
    onSettings={() => setPage('settings')}
    onCreate={() => {
      if (!user?.username) {
        notify('Claim your unique username before creating a project')
        document.getElementById('username-setup')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      setModal('new-project')
    }} onOpen={(game) => openStudio(game)} onKey={() => setModal('api-key')} onLogout={logout}
    onUsername={async (name) => {
      try {
        const saved = await api<{ username: string }>('/api/profile/username', { method: 'PUT', body: JSON.stringify({ username: name }) })
        setUser((current) => current ? { ...current, username: saved.username } : current)
        const result = await api<{projects: Array<Record<string, unknown>>}>('/api/projects')
        setProjects(result.projects.map(projectToGame))
        notify('Username saved')
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Could not save username')
        throw error
      }
    }}
    onUpdateUser={(updated) => setUser(updated)}
    onToggleVisibility={toggleProjectVisibility}
    onDeleteProject={deleteProject}
    onUpdateProjectDetails={handleUpdateProjectDetails}
    onDownloadZip={handleDownloadZip}
    onTrackPlay={handleTrackPlay}
    notify={notify}
    />
    {modal === 'new-project' && <NewProjectModal name={projectName} setName={setProjectName} visibility={visibility} setVisibility={setVisibility} templateId={projectTemplate} setTemplateId={setProjectTemplate} close={() => setModal(null)} create={handleNewProject}/>}
    {modal === 'api-key' && <KeyModal value={apiKey} setValue={setApiKey} close={() => setModal(null)} save={saveKey} remove={removeKey} hasKey={hasKey}/>}
    {toast && <div className="toast" role="status" aria-live="polite"><Check size={15}/>{toast}</div>}
    </>
  }
  if (page === 'not-found') return <main className="route-not-found"><span>404</span><h1>This page isn’t available</h1><p>The editor is private to its owner, or this link is incorrect.</p><button className="button button-primary" onClick={() => setPage(user ? 'profile' : 'home')}>Return to Yulya Studio</button></main>
  if (page === 'terms') {
    return (
      <>
        <TermsPage
          user={user}
          setPage={setPage}
          onOpenStudio={() => openStudio()}
          onLogin={completeLogin}
          onLogout={logout}
          notify={notify}
        />
        {toast && <div className="toast" role="status" aria-live="polite"><Check size={15}/>{toast}</div>}
      </>
    )
  }
  if (page === 'privacy') {
    return (
      <>
        <PrivacyPolicyPage
          user={user}
          setPage={setPage}
          onOpenStudio={() => openStudio()}
          onLogin={completeLogin}
          onLogout={logout}
          notify={notify}
        />
        {toast && <div className="toast" role="status" aria-live="polite"><Check size={15}/>{toast}</div>}
      </>
    )
  }
  if (page === 'docs') {
    return (
      <DocsPage
        user={user}
        setPage={setPage}
        onOpenStudio={() => openStudio()}
        onLogin={completeLogin}
        onLogout={logout}
        notify={notify}
      />
    )
  }
  if (page === 'arcade') {
    return (
      <>
        <ArcadePage
          user={user}
          games={games}
          onSelectGame={(game) => {
            setCurrentGame(game)
            setPage('play', `/${encodeURIComponent(game.creator)}/${encodeURIComponent(game.id)}`)
          }}
          onTrackPlay={handleTrackPlay}
          onOpenStudio={(game) => openStudio(game)}
          onLogout={logout}
          setPage={setPage}
          onLogin={completeLogin}
          notify={notify}
          modal={modal}
          currentGame={currentGame}
          setModal={setModal}
          toast={toast}
        />
        {modal === 'game' && currentGame && (
          <GameModal
            game={currentGame}
            close={() => setModal(null)}
            play={() => {
              if (currentGame.visibility === 'public') {
                setPage('play', `/${encodeURIComponent(currentGame.creator)}/${encodeURIComponent(currentGame.id)}`)
              } else notify('This project is private')
              setModal(null)
            }}
          />
        )}
        {modal === 'new-project' && <NewProjectModal name={projectName} setName={setProjectName} visibility={visibility} setVisibility={setVisibility} templateId={projectTemplate} setTemplateId={setProjectTemplate} close={() => setModal(null)} create={handleNewProject}/>}
        {modal === 'api-key' && <KeyModal value={apiKey} setValue={setApiKey} close={() => setModal(null)} save={saveKey} remove={removeKey} hasKey={hasKey}/>}
        {toast && <div className="toast"><Check size={15}/>{toast}</div>}
      </>
    )
  }
  if (page === 'studio') return <><StudioPage {...{
    user, currentGame, activeFile, openFiles, setOpenFiles, code, language, tree, sidebarOpen, terminalOpen, chat, chatMessages, saveState, previewKey, currentProjectId, previewUrl, newFileName, modal, models, selectedModel, dirtyFiles, setDirtyFiles,
    isAntigravityMode, setIsAntigravityMode, playOrigin, aiMode, setAiMode,
    useWaterfall, setUseWaterfall: (v: boolean) => {
      setUseWaterfall(v)
      localStorage.setItem('yulya:use-waterfall', String(v))
    },
    setPage, setModal, setActiveFile, setSidebarOpen, setTerminalOpen, setChat, handleEditor, submitPrompt, shareLink,
    notify, setPreviewKey, setMobileNav, mobileNav, setTree, setNewFileName, addFile, deleteProjectFile, renameProjectFile, toggleVisibility, setSelectedModel: selectModelPersisted, onRefreshModels: () => refreshModels(false), uploadProjectAsset,
    isAiGenerating, stopAiGeneration, onClearChat: clearChatHistory, onReloadFiles: reloadProjectFiles, updateWaterfall,
    onUpdateThumbnail: handleUpdateThumbnail,
    onDownloadZip: () => { if (currentGame) void handleDownloadZip(currentGame) },
    onUpdateProjectDetails: handleUpdateProjectDetails,
    onRefreshPreviewToken: refreshPreviewToken,
  }} />{modal === 'new-file' && <Modal close={() => setModal(null)}><div className="eyebrow">PROJECT FILE</div><h2>Create a browser asset</h2><label>File path<input autoFocus value={newFileName} onChange={e => setNewFileName(e.target.value)} placeholder="assets/scene.js" /></label><button className="button button-primary modal-submit" onClick={() => addFile()}>Create file</button></Modal>}{modal === 'api-key' && <KeyModal value={apiKey} setValue={setApiKey} close={() => setModal(null)} save={saveKey} remove={removeKey} hasKey={hasKey}/>} {toast && <div className="toast" role="status" aria-live="polite"><Check size={15}/>{toast}</div>}</>

  const filteredGames = selectedGenre === 'ALL' ? games : games.filter(g => g.genre.toUpperCase() === selectedGenre.toUpperCase())

  return <div className="site-shell editorial-shell">
    <header className="topbar home-topbar">
      <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
        <span className="brand-mark">✳</span>
        <span>yulya<span className="brand-light">studio</span></span>
      </a>
      <nav className={`main-nav ${mobileNav ? 'nav-open' : ''}`}>
        <a href="#showcase" onClick={(e) => { e.preventDefault(); setMobileNav(false); document.getElementById('showcase')?.scrollIntoView({ behavior: 'smooth' }) }}>Workspace</a>
        <a href="/arcade" onClick={(e) => { e.preventDefault(); setMobileNav(false); setPage('arcade') }}>Arcade</a>
        <a href="/templates" onClick={(e) => { e.preventDefault(); setMobileNav(false); setPage('templates') }}>Templates</a>
        <a href="/docs" onClick={(e) => { e.preventDefault(); setMobileNav(false); setPage('docs') }}>Docs</a>
      </nav>
      <div className="top-actions">
        {user ? (
          <button className="button button-alabaster button-small" onClick={() => setPage('profile')}>
            My Studio
          </button>
        ) : (
          <button className="button button-alabaster button-small" onClick={() => setPage('login')}>
            Start Building
          </button>
        )}
        <ProfileMenu user={user} setPage={setPage} onLogout={logout} onOpenStudio={() => openStudio()} onLogin={completeLogin} notify={notify} />
        <button className="icon-button mobile-menu" aria-label="Toggle menu" onClick={() => setMobileNav(!mobileNav)}><Menu size={19}/></button>
      </div>
    </header>

    <main>
      <section className="hero editorial-hero" id="home">
        <div className="hero-copy">
          <div className="hero-kicker">Browser IDE · Isolated Sandbox · Gemini Multimodal</div>
          <h1 className="editorial-hero-h1">
            Build, test, and publish playable worlds in one tab.
          </h1>
          <p className="hero-description">
            Write HTML5, WebGL, or React + TypeScript directly in the browser. Pair with Gemini for live coding, Nano Banana art, TTS audio, and headless playtesting—then ship on isolated <code>play.yulya.me</code>.
          </p>
          <div className="hero-actions">
            <button className="button button-alabaster" onClick={() => user ? setPage('profile') : setPage('login')}>
              {user ? 'Open My Studio' : 'Start Building Free'}
            </button>
            <button className="button button-outline" onClick={() => setPage('arcade')}>
              <Gamepad2 size={15}/> Explore Arcade
            </button>
          </div>
          <div className="hero-spec-strip">
            <span>Monaco + esbuild-wasm</span>
            <span>Canvas 2D &amp; Three.js</span>
            <span>BYOK AES-256-GCM</span>
            <span>One-click ZIP export</span>
          </div>
        </div>

        <div className="hero-visual-col">
          <Suspense fallback={<div className="hero-3d-stage hero-3d-loading">Loading 3D studio scene…</div>}>
            <Hero3DCanvas />
          </Suspense>
        </div>
      </section>

      <StudioShowcase />

      <section className="arcade-section editorial-arcade-preview" id="discover">
        <div className="section-heading">
          <div>
            <h2 className="editorial-section-title">Published on Yulya Arcade</h2>
            <p className="editorial-section-sub">Play community projects directly in their isolated sandbox, or inspect and remix open templates.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="button button-outline button-small" onClick={() => api<{projects: Array<Record<string, unknown>>}>('/api/gallery').then(data => { setGames(data.projects.map(projectToGame)); notify('Arcade refreshed'); }).catch(() => notify('Could not refresh games'))}>Refresh</button>
            <button className="button button-alabaster button-small" onClick={() => setPage('arcade')}>Browse Full Arcade</button>
          </div>
        </div>
        {games.length > 0 && (
          <div className="arcade-filters">
            {['ALL', ...Array.from(new Set(games.map(g => g.genre.toUpperCase())))].map(g => (
              <button key={g} type="button" className={`genre-pill ${selectedGenre === g ? 'active' : ''}`} onClick={() => setSelectedGenre(g)}>
                {g}
              </button>
            ))}
          </div>
        )}
        {filteredGames.length ? (
          <div className="editorial-game-grid">
            {filteredGames.slice(0, 6).map((game, index) => <GameCard key={game.projectId ?? game.id} game={game} index={index} onClick={() => { setCurrentGame(game); setModal('game') }} />)}
          </div>
        ) : (
          <div className="gallery-empty">{games.length === 0 ? 'No public projects published yet. Create one in Studio to be first on the shelf.' : 'No projects in this category yet.'}</div>
        )}
        <div className="gallery-footer">
          <span className="tabular-count">{games.length} public {games.length === 1 ? 'project' : 'projects'}</span>
          <button className="quiet-button" onClick={() => setPage('arcade')}>View all in Arcade <ArrowRight size={14}/></button>
        </div>
      </section>

      <section className="how-section editorial-workflow" id="how">
        <div className="workflow-grid">
          <div className="workflow-intro">
            <h2 className="editorial-section-title">From blank file to playable URL in minutes.</h2>
            <p className="editorial-section-sub">No build pipelines, local SDK installs, or deployment friction. Everything compiles and previews live inside your browser.</p>
          </div>
          <div className="workflow-steps-list">
            <div className="workflow-row">
              <span className="workflow-num">1</span>
              <div>
                <h3>Pick a template or prompt an idea</h3>
                <p>Start from blank HTML/JS, Canvas 2D, Phaser, Three.js, GLSL shaders, or React + TypeScript—or describe mechanics to Gemini with pasted sketches.</p>
              </div>
            </div>
            <div className="workflow-row">
              <span className="workflow-num">2</span>
              <div>
                <h3>Iterate side-by-side with headless playtesting</h3>
                <p>Edit code in Monaco while the isolated preview updates live. Stream the game headlessly to Gemini so it can click menus, test controls, and inspect frames.</p>
              </div>
            </div>
            <div className="workflow-row">
              <span className="workflow-num">3</span>
              <div>
                <h3>Publish or share a live preview link</h3>
                <p>Publish to the Community Arcade with leaderboards and comments, share a 24h isolated preview link for private WIPs, or export a complete ZIP anytime.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="editorial-cta-band" id="community">
        <div className="editorial-cta-inner">
          <div>
            <h2>Ready to build your next browser game or interactive tool?</h2>
            <p>Start free with your own Google AI Studio key—zero vendor lock-in, full source export.</p>
          </div>
          <div className="editorial-cta-actions">
            <button className="button button-alabaster" onClick={() => setPage(user ? 'profile' : 'login')}>
              {user ? 'Open Your Studio' : 'Create Free Account'}
            </button>
            <button className="button button-outline" onClick={() => setPage('templates')}>
              Browse Templates
            </button>
          </div>
        </div>
      </section>
    </main>

    <footer className="footer editorial-footer">
      <div className="editorial-footer-grid">
        <div className="footer-brand-col">
          <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
            <span className="brand-mark">✳</span>
            <span>yulya<span className="brand-light">studio</span></span>
          </a>
          <p className="footer-tagline">Browser-native coding IDE, multimodal Gemini workspace, and isolated game arcade.</p>
          <div className="footer-contact-row">
            <a href="mailto:support@yulya.me" className="footer-contact-pill">
              <Mail size={13} /> support@yulya.me
            </a>
            <a href="https://moheith.tech" target="_blank" rel="noreferrer" className="footer-contact-pill">
              Creator Portfolio · moheith.tech <ArrowUpRight size={12} />
            </a>
          </div>
        </div>

        <div className="footer-col">
          <h4>Platform</h4>
          <a href="/arcade" onClick={(e) => { e.preventDefault(); setPage('arcade') }}>Community Arcade</a>
          <a href="/templates" onClick={(e) => { e.preventDefault(); setPage('templates') }}>Starter Templates</a>
          <a href="/docs" onClick={(e) => { e.preventDefault(); setPage('docs') }}>Documentation</a>
        </div>

        <div className="footer-col">
          <h4>Legal &amp; Support</h4>
          <a href="/terms" onClick={(e) => { e.preventDefault(); setPage('terms') }}>Terms of Service</a>
          <a href="/privacy" onClick={(e) => { e.preventDefault(); setPage('privacy') }}>Privacy Policy</a>
          <a href="mailto:support@yulya.me">support@yulya.me</a>
        </div>
      </div>

      <div className="editorial-footer-bottom">
        <span>&copy; {new Date().getFullYear()} Yulya Studio. All rights reserved.</span>
        <span>
          Crafted by{' '}
          <a href="https://moheith.tech" target="_blank" rel="noreferrer" className="footer-portfolio-link">
            moheith.tech
          </a>
        </span>
      </div>
    </footer>
    {modal === 'game' && currentGame && (
      <GameModal
        game={currentGame}
        close={() => setModal(null)}
        play={() => {
          if (currentGame.visibility === 'public') {
            setPage('play', `/${encodeURIComponent(currentGame.creator)}/${encodeURIComponent(currentGame.id)}`)
          } else notify('This project is private')
          setModal(null)
        }}
      />
    )}
    {modal === 'new-project' && <NewProjectModal name={projectName} setName={setProjectName} visibility={visibility} setVisibility={setVisibility} templateId={projectTemplate} setTemplateId={setProjectTemplate} close={() => setModal(null)} create={handleNewProject}/>}
    {modal === 'api-key' && <KeyModal value={apiKey} setValue={setApiKey} close={() => setModal(null)} save={saveKey} remove={removeKey} hasKey={hasKey}/>}
    {toast && <div className="toast"><Check size={15}/>{toast}</div>}
  </div>
}

function GameCard({ game, index, onClick }: { game: Game; index: number; onClick: () => void }) {
  return (
    <article className={`game-card card-${index}`} onClick={onClick} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className="game-art" style={{ '--game-color': game.color } as React.CSSProperties}>
        {game.thumbnail ? (
          <img src={game.thumbnail} alt={game.title} className="game-art-cover-img" />
        ) : (
          <>
            <div className="game-art-stars">✦　·　✧</div>
            <div className="game-art-object">{game.art}</div>
          </>
        )}
        <span className="art-play"><Play size={14} fill="currentColor"/></span>
        <span className="art-index">0{index + 1}</span>
      </div>
      <div className="game-card-info">
        <div>
          <div className="game-genre">{game.genre}</div>
          <h3>{game.title}</h3>
          <p>{game.description}</p>
        </div>
        <div className="card-meta">
          <span className="creator-avatar" style={{ background: game.color }}>{game.creator[0]}</span>
          <span>by <b>{game.creator}</b></span>
          <span className="play-count"><Play size={11} fill="currentColor"/> {game.plays}</span>
        </div>
      </div>
    </article>
  )
}

function NewProjectModal({ name, setName, visibility, setVisibility, templateId, setTemplateId, close, create }: { name: string; setName: (s: string) => void; visibility: 'private' | 'public'; setVisibility: (v: 'private' | 'public') => void; templateId: string; setTemplateId: (t: string) => void; close: () => void; create: () => void }) {
  const templates = [
    { id: 'blank', label: 'Blank HTML/CSS/JS' },
    { id: 'canvas-arcade', label: 'Canvas 2D Arcade' },
    { id: 'react-ts-tailwind', label: 'React + TypeScript (esbuild)' },
    { id: 'threejs-3d', label: 'Three.js 3D Scene' },
    { id: 'glsl-shader', label: 'WebGL2 GLSL Shader' },
    { id: 'phaser-platformer', label: 'Phaser 3 Platformer' },
    { id: 'landing-page', label: 'Landing Page' },
    { id: 'interactive-tool', label: 'Interactive Web Tool' },
  ]
  return (
    <Modal close={close}>
      <div className="modal-icon"><Sparkles size={18}/></div>
      <div className="eyebrow">NEW PROJECT</div>
      <h2>Give your project a name.</h2>
      <p>Pick a starter runtime and start coding immediately with live sandbox preview.</p>
      <label>Project name<input autoFocus value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-'))}/></label>
      <label style={{ marginTop: 10 }}>
        Starter template
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: '#0e1017', border: '1px solid rgba(148,163,184,0.22)', color: '#f8fafc', marginTop: 6 }}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <div className="visibility-choice"><button className={visibility === 'private' ? 'visibility-selected' : ''} onClick={() => setVisibility('private')}><LockKeyhole size={15}/><span><b>Private</b><small>Only you can see it</small></span>{visibility === 'private' && <Check size={14}/>}</button><button className={visibility === 'public' ? 'visibility-selected' : ''} onClick={() => setVisibility('public')}><Globe2 size={15}/><span><b>Public</b><small>Show it in the arcade</small></span>{visibility === 'public' && <Check size={14}/>}</button></div>
      <button className="button button-primary modal-submit" onClick={create}>Create project <ArrowRight size={15}/></button>
    </Modal>
  )
}
function KeyModal({ value, setValue, close, save, remove, hasKey }: { value: string; setValue: (s: string) => void; close: () => void; save: () => Promise<void>; remove: () => void; hasKey: boolean }) {
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const verify = async () => {
    if (checking) return
    setChecking(true); setError('')
    try { await save() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not verify this key. Please try again.') }
    finally { setChecking(false) }
  }
  return <Modal close={close}><div className="modal-icon key-modal-icon"><Zap size={18}/></div><div className="eyebrow">BRING YOUR OWN KEY</div><h2>{hasKey ? 'Replace your Gemini key.' : 'Connect your Gemini key.'}</h2><p>Your key lets the coding assistant work for you. It’s encrypted and never shown again.</p><label>Google AI Studio API key<input autoFocus type="password" value={value} onChange={(e) => { setValue(e.target.value); setError('') }} placeholder="Paste your API key" autoComplete="off" disabled={checking}/></label><a className="key-help" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get a key from Google AI Studio <ArrowUpRight size={12}/></a>{checking && <div className="key-status" role="status" aria-live="polite"><span className="key-spinner"/>Checking your key with Google…</div>}{error && <div className="key-error" role="alert">{error}</div>}<button className="button button-primary modal-submit" onClick={verify} disabled={checking || !value.trim()}>{checking ? 'Verifying key…' : 'Verify and connect'} {!checking && <ArrowRight size={15}/>}</button>{hasKey && <button className="quiet-button" onClick={remove} disabled={checking}>Remove connected key</button>}</Modal>
}
function GameModal({ game, close, play }: { game: Game; close: () => void; play: () => void }) {
  return (
    <Modal close={close} wide>
      <div className="game-modal-art" style={{ '--game-color': game.color } as React.CSSProperties}>
        {game.thumbnail ? (
          <img src={game.thumbnail} alt={game.title} className="game-modal-cover-img" />
        ) : (
          <>
            <span>{game.art}</span>
            <div className="game-art-stars">✦　·　✧</div>
          </>
        )}
      </div>
      <div className="game-modal-content">
        <div className="game-genre">{game.genre}</div>
        <h2>{game.title}</h2>
        <p>{game.description}</p>
        <div className="game-modal-meta">
          <span className="creator-avatar" style={{ background: game.color }}>{game.creator[0]}</span>
          <span>by <b>{game.creator}</b></span>
          <span className="play-count"><Play size={11} fill="currentColor"/> {game.plays} plays</span>
        </div>
        <div className="modal-game-preview">
          <div className="preview-placeholder">
            {game.thumbnail ? (
              <img src={game.thumbnail} alt={game.title} className="modal-preview-thumb" />
            ) : (
              <>
                <span>{game.art}</span>
                <p>Open the game on its isolated play origin.</p>
              </>
            )}
          </div>
          <button className="button button-primary" onClick={play}>
            <Play size={15} fill="currentColor"/> Play game
          </button>
        </div>
      </div>
    </Modal>
  )
}
function Modal({ children, close, wide = false }: { children: React.ReactNode; close: () => void; wide?: boolean }) { return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><div className={`modal-card ${wide ? 'modal-wide' : ''}`}><button className="modal-close" onClick={close} aria-label="Close"><X size={17}/></button>{children}</div></div> }
