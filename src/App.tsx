import { useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import {
  ArrowDown, ArrowRight, ArrowUpRight, Check, Code2, Gamepad2,
  Globe2, LockKeyhole, Menu, MessageSquare,
  Play, Rocket, Sparkles, WandSparkles,
  X, Zap,
} from 'lucide-react'
import { api, deleteFile, getFile, saveFile, setCsrfToken, streamSse, uploadAsset } from './api'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ProfilePage from './pages/ProfilePage'
import PublicProfilePage from './pages/PublicProfilePage'
import StudioPage from './pages/StudioPage'
import type { Game, FileEntry, Page, User, ChatMessage } from './types'
function projectToGame(value: Record<string, unknown>): Game {
  const id = String(value.slug ?? value.id ?? 'project')
  const username = String(value.username ?? 'creator')
  return { id, projectId: String(value.id ?? ''), title: String(value.title ?? id), creator: username, genre: 'WEB GAME', color: '#c7a6ff', art: '✦', plays: String(value.plays ?? 0), description: String(value.description ?? 'A game made in Yulya Studio.'), visibility: value.visibility === 'public' ? 'public' : 'private' }
}
function publicGameUrl(username: string, slug: string) {
  const origin = (import.meta.env.VITE_API_ORIGIN || window.location.origin).replace(/\/$/, '')
  return `${origin}/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`
}

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
    const fixed = ({ '/': 'home', '/login': 'login', '/register': 'register', '/verify-email': 'verify-email', '/profile': 'profile', '/studio': 'studio', '/not-found': 'not-found' }[route] as Page | undefined)
    if (fixed) return fixed
    const parts = route.split('/').filter(Boolean)
    if (parts.length === 3 && parts[2] === 'edit') return 'studio'
    if (parts.length === 1) return 'profile'
    return 'home'
  }
  const [page, setPageState] = useState<Page>(pageFromPath)
  const setPage = (next: Page, pathOverride?: string) => {
    const route: Record<Page, string> = { home: '/', login: '/login', register: '/register', 'verify-email': '/verify-email', profile: '/profile', studio: '/studio', 'not-found': '/not-found' }
    const path = pathOverride ?? (next === 'profile' && user?.username ? `/${encodeURIComponent(user.username)}` : next === 'studio' && currentGame && user?.username ? editorPath(user.username, currentGame.id) : route[next])
    // Dialogs belong to the page that opened them; never carry one across routes.
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
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chat, setChat] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [modal, setModal] = useState<'new-project' | 'api-key' | 'new-file' | 'game' | null>(null)
  const [toast, setToast] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [models, setModels] = useState<Array<{ id: string; display_name: string }>>([
    {"id": "antigravity-preview-latest", "display_name": "✦ Antigravity (Gemini 3.6 Flash)"},
    {"id": "antigravity-preview-09-2026", "display_name": "✦ Antigravity (Gemini 3.8 Flash)"},
    {"id": "gemini-3.6-flash", "display_name": "Gemini 3.6 Flash"},
    {"id": "gemini-3.8-flash", "display_name": "Gemini 3.8 Flash"},
  ])
  const [selectedModel, setSelectedModel] = useState('antigravity-preview-latest')
  const [isAntigravityMode, setIsAntigravityMode] = useState<boolean>(true)
  const [projectName, setProjectName] = useState('little-star')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [saveState, setSaveState] = useState('Saved')
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set())
  const [previewKey, setPreviewKey] = useState(0)
  const [newFileName, setNewFileName] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
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
    api<{ user: User; csrf_token: string; needs_username: boolean }>('/api/auth/me').then(async (session) => {
      setCsrfToken(session.csrf_token); setUser(session.user); setHasKey(Boolean((session.user as User & { has_api_key?: boolean }).has_api_key))
      if ((session.user as User & { has_api_key?: boolean }).has_api_key) api<{models: Array<{id: string; display_name: string}>}>('/api/models').then(result => { setModels(result.models); if (result.models[0]) setSelectedModel(result.models[0].id) }).catch(() => {})
      if (session.needs_username) setPage('profile')
      else { const data = await api<{ projects: Array<Record<string, unknown>> }>('/api/projects').catch(() => ({ projects: [] })); setProjects(data.projects.map(projectToGame)) }
    }).catch(() => {}).finally(() => setSessionReady(true))
    api<{ projects: Array<Record<string, unknown>> }>('/api/gallery').then((data) => setGames(data.projects.map(projectToGame))).catch(() => {})
  }, [])

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
    if (code[activeFile] === undefined && /\.(html|css|js|mjs|json|txt|csv|tsv)$/i.test(activeFile)) {
      getFile(currentProjectId, activeFile).then(res => {
        setCode(prev => ({ ...prev, [activeFile]: res.content }))
      }).catch(() => {})
    }
  }, [currentProjectId, activeFile, code])

  const language = useMemo(() => activeFile.endsWith('.html') ? 'html' : activeFile.endsWith('.css') ? 'css' : activeFile.endsWith('.json') ? 'json' : 'javascript', [activeFile])
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
    }, 1500)
  }
  const handleNewProject = async () => {
    if (!user) { setPage('login'); setModal(null); return }
    if (!hasKey) { setModal('api-key'); return }
    try {
      const result = await api<{ project: Record<string, unknown> }>('/api/projects', { method: 'POST', body: JSON.stringify({ title: projectName, visibility }) })
      const project = projectToGame(result.project); setProjects((items) => [project, ...items]); setCurrentGame(project); setCurrentProjectId(project.projectId ?? ''); setCode(starterFiles); setTree(initialTree); setPage('studio', editorPath(user.username, project.id)); setModal(null)
      if (project.projectId) await loadProject(project.projectId, project)
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not create project') }
  }
  const submitPrompt = async () => {
    if (!chat.trim()) return
    if (!selectedModel) { notify('Connect a key and choose an available Gemini model first'); return }
    const prompt = chat.trim()
    setChat('')
    const userMsgId = Date.now().toString()
    const aiMsgId = (Date.now() + 1).toString()
    const modelTag = isAntigravityMode
      ? (selectedModel.toLowerCase().includes('antigravity') ? selectedModel : `✦ Antigravity (${selectedModel})`)
      : selectedModel
    setChatMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user', text: prompt, time: Date.now() },
      { id: aiMsgId, role: 'ai', text: 'Thinking…', time: Date.now(), tools: [], model: modelTag }
    ])
    setTerminalOpen(true)
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
      for await (const event of streamSse(`/api/projects/${currentProjectId}/ai/stream`, { prompt, model: selectedModel, antigravity: isAntigravityMode }, controller.signal)) {
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
        if (event.type === 'tool') {
          const actionName = event.data.name || 'write_file'
          const label = actionName === 'create_folder'
            ? `Created folder ${event.data.path}`
            : actionName === 'create_file'
            ? `Created ${event.data.path}`
            : `Updated ${event.data.path}`
          toolsUsed.push(event.data.path)
          setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, tools: [...toolsUsed] } : m))
          notify(label)
        }
        if (event.type === 'reload_preview') setPreviewKey(v => v + 1)
        if (event.type === 'error') {
          const errMsg = event.data.message || event.data.text || (typeof event.data === 'string' ? event.data : JSON.stringify(event.data))
          setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: `Error: ${errMsg}` } : m))
          notify(`AI Error: ${errMsg}`)
          return
        }
      }
      const current = await api<{ files: Array<{ path: string }> }>(`/api/projects/${currentProjectId}/files`)
      const nextCode: Record<string, string> = {}
      for (const file of current.files) {
        if (/\.(html|css|js|mjs|json)$/.test(file.path)) {
          nextCode[file.path] = (await getFile(currentProjectId, file.path)).content
        }
      }
      setCode(nextCode)
      setTree(current.files.map(file => ({
        name: file.path,
        kind: 'file',
        language: file.path.endsWith('.css') ? 'css' : file.path.endsWith('.html') ? 'html' : file.path.endsWith('.json') ? 'json' : 'javascript'
      })))
      setPreviewKey(v => v + 1)
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
  const shareLink = () => {
    if (currentGame?.visibility !== 'public') { notify('Make this project public before sharing its game link'); return }
    navigator.clipboard?.writeText(publicGameUrl(user?.username ?? currentGame.creator, currentGame.id)).catch(() => {})
    notify('Game link copied')
  }
  const toggleVisibility = async () => {
    if (!currentProjectId || !currentGame) return
    const next = currentGame.visibility === 'public' ? 'private' : 'public'
    try {
      await api(`/api/projects/${currentProjectId}/visibility`, { method: 'PATCH', body: JSON.stringify({ visibility: next }) })
      const updated = { ...currentGame, visibility: next as 'public' | 'private' }
      setCurrentGame(updated); setProjects(items => items.map(item => item.projectId === currentProjectId ? updated : item))
      if (next === 'public') setPreviewUrl(publicGameUrl(user?.username ?? currentGame.creator, updated.id))
      else { const token = await api<{url:string}>(`/api/projects/${currentProjectId}/preview-token`, { method: 'POST', body: '{}' }); setPreviewUrl(token.url) }
      setPreviewKey(v => v + 1); notify(next === 'public' ? 'Game is public in the arcade' : 'Game is private')
    }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not change visibility') }
  }
  const saveKey = async () => {
    if (apiKey.trim().length < 12) throw new Error('Enter a valid Gemini API key')
    // The POST validates and stores the key, returning the model that passed.
    const verified = await api<{ verified_model?: string; fallback_used?: boolean }>('/api/keys/gemini', { method: 'POST', body: JSON.stringify({ api_key: apiKey.trim() }) })
    setHasKey(true); setApiKey(''); setModal(null); notify(verified.fallback_used ? `Key connected with ${verified.verified_model ?? 'Gemma'} fallback` : 'Gemini key verified and connected')
    try {
      const result = await api<{models: Array<{id: string; display_name: string}>}>('/api/models')
      setModels(result.models); setSelectedModel(verified.verified_model && result.models.some(model => model.id === verified.verified_model) ? verified.verified_model : result.models[0]?.id ?? '')
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
  const completeLogin = (nextUser: User, csrf: string) => {
    setCsrfToken(csrf)
    setUser(nextUser)
    setHasKey(Boolean((nextUser as User & { has_api_key?: boolean }).has_api_key))
    api<{ projects: Array<Record<string, unknown>> }>('/api/projects').then(result => setProjects(result.projects.map(projectToGame))).catch(() => {})
    if ((nextUser as User & { has_api_key?: boolean }).has_api_key) api<{ models: Array<{ id: string; display_name: string }> }>('/api/models').then(result => { setModels(result.models); setSelectedModel(result.models[0]?.id ?? '') }).catch(() => {})
    const returnTo = sessionStorage.getItem('yulya:return-to')
    if (returnTo) { sessionStorage.removeItem('yulya:return-to'); setPage('studio', returnTo) }
    else setPage('profile', nextUser.username ? `/${encodeURIComponent(nextUser.username)}` : '/profile')
  }
  const addFile = (explicitName?: string) => {
    const raw = typeof explicitName === 'string' ? explicitName : newFileName
    const name = raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim()
    if (!name || name.includes('..') || !/\.(html|css|js|mjs|json|png|jpe?g|webp|gif|mp3|wav|ogg|mp4|webm|woff2?)$/i.test(name)) { notify('Use a supported browser file name'); return }
    setTree((items) => items.some((file) => file.name === name) ? items : [...items, { name, kind: 'file', language: name.endsWith('.css') ? 'css' : name.endsWith('.html') ? 'html' : name.endsWith('.json') ? 'json' : 'javascript' }])
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
    if (!clean || clean.includes('..') || !/\.(html|css|js|mjs|json|png|jpe?g|webp|gif|mp3|wav|ogg|mp4|webm|woff2?)$/i.test(clean)) {
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
      const result = await api<{ files: Array<{ path: string }> }>(`/api/projects/${id}/files`)
      const loaded: Record<string, string> = {}
      for (const file of result.files) {
        if (/\.(html|css|js|mjs|json)$/.test(file.path)) {
          loaded[file.path] = (await getFile(id, file.path)).content
        }
      }
      setCurrentProjectId(id)
      setCurrentGame(meta)
      setCode(loaded)
      const treeList: FileEntry[] = result.files.map(file => ({
        name: file.path,
        kind: 'file',
        language: file.path.endsWith('.css') ? 'css' : file.path.endsWith('.html') ? 'html' : file.path.endsWith('.json') ? 'json' : 'javascript'
      }))
      setTree(treeList)
      const firstFile = Object.keys(loaded)[0] || 'index.html'
      setActiveFile(prev => loaded[prev] !== undefined ? prev : firstFile)
      setOpenFiles(prev => {
        const valid = prev.filter(f => loaded[f] !== undefined)
        return valid.length ? valid : Object.keys(loaded).slice(0, 5)
      })

      // Load persistent AI conversation history
      try {
        const historyData = await api<{ conversations: Array<{ id: string; prompt: string; response: string; thought?: string; model?: string; created_at: number }> }>(`/api/projects/${id}/ai/history`)
        if (historyData?.conversations) {
          const msgs: ChatMessage[] = []
          for (const conv of historyData.conversations) {
            if (conv.prompt) msgs.push({ id: `${conv.id}-user`, role: 'user', text: conv.prompt, time: conv.created_at })
            if (conv.response) msgs.push({ id: `${conv.id}-ai`, role: 'ai', text: conv.response, thought: conv.thought, time: conv.created_at, model: conv.model })
          }
          setChatMessages(msgs)
        }
      } catch {
        // history empty or offline
      }

      if (meta.visibility === 'public') {
        setPreviewUrl(publicGameUrl(meta.creator, meta.id))
      } else {
        const preview = await api<{ url: string }>(`/api/projects/${id}/preview-token`, { method: 'POST', body: '{}' }).catch(() => ({ url: '' }))
        setPreviewUrl(preview.url)
      }
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
    return <main className="project-opening"><span className="key-spinner"/><b>Opening your project…</b><small>Loading your files and saved AI conversation.</small></main>
  }
  if (page === 'login') return <LoginPage onBack={() => setPage('home')} onRegister={() => setPage('register')} onLogin={completeLogin} notify={notify} />
  if (page === 'register') return <RegisterPage onBack={() => setPage('home')} onLogin={() => setPage('login')} onRegistered={(email) => { setVerificationEmail(email); sessionStorage.setItem('yulya-verification-email', email); setPage('verify-email') }} notify={notify} />
  if (page === 'verify-email') return <VerifyEmailPage email={verificationEmail} onBack={() => setPage('register')} onLogin={(nextUser, csrf) => { sessionStorage.removeItem('yulya-verification-email'); completeLogin(nextUser, csrf) }} notify={notify} />
  if (page === 'profile') {
    const routeUsername = decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[0] ?? '')
    const isOwnProfile = window.location.pathname === '/profile' || Boolean(user?.username && routeUsername.toLowerCase() === user.username.toLowerCase())
    if (!isOwnProfile && routeUsername) {
      if (!sessionReady) return <main className="public-profile-shell"><div className="public-profile-loading">Loading creator profile…</div></main>
      return <PublicProfilePage username={routeUsername} onHome={() => setPage('home')}/>
    }
    return <>
    <ProfilePage
    user={user} hasKey={hasKey} projects={projects}
    onHome={() => setPage('home')} onArcade={() => {
      setPage('home')
      window.setTimeout(() => document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    }} onCreate={() => {
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
    />
    {modal === 'new-project' && <NewProjectModal name={projectName} setName={setProjectName} visibility={visibility} setVisibility={setVisibility} close={() => setModal(null)} create={handleNewProject}/>}
    {modal === 'api-key' && <KeyModal value={apiKey} setValue={setApiKey} close={() => setModal(null)} save={saveKey} remove={removeKey} hasKey={hasKey}/>}
    {toast && <div className="toast" role="status" aria-live="polite"><Check size={15}/>{toast}</div>}
    </>
  }
  if (page === 'not-found') return <main className="route-not-found"><span>404</span><h1>This page isn’t available</h1><p>The editor is private to its owner, or this link is incorrect.</p><button className="button button-primary" onClick={() => setPage(user ? 'profile' : 'home')}>Return to Yulya Studio</button></main>
  if (page === 'studio') return <><StudioPage {...{
    user, currentGame, activeFile, openFiles, setOpenFiles, code, language, tree, sidebarOpen, terminalOpen, chat, chatMessages, saveState, previewKey, currentProjectId, previewUrl, newFileName, modal, models, selectedModel, dirtyFiles, setDirtyFiles,
    isAntigravityMode, setIsAntigravityMode,
    setPage, setModal, setActiveFile, setSidebarOpen, setTerminalOpen, setChat, handleEditor, submitPrompt, shareLink,
    notify, setPreviewKey, setMobileNav, mobileNav, setTree, setNewFileName, addFile, deleteProjectFile, renameProjectFile, toggleVisibility, setSelectedModel, uploadProjectAsset,
    isAiGenerating, stopAiGeneration, onClearChat: clearChatHistory, onReloadFiles: reloadProjectFiles,
  }} />{modal === 'new-file' && <Modal close={() => setModal(null)}><div className="eyebrow">PROJECT FILE</div><h2>Create a browser asset</h2><label>File path<input autoFocus value={newFileName} onChange={e => setNewFileName(e.target.value)} placeholder="assets/scene.js" /></label><button className="button button-primary modal-submit" onClick={() => addFile()}>Create file</button></Modal>}{modal === 'api-key' && <KeyModal value={apiKey} setValue={setApiKey} close={() => setModal(null)} save={saveKey} remove={removeKey} hasKey={hasKey}/>} {toast && <div className="toast" role="status" aria-live="polite"><Check size={15}/>{toast}</div>}</>

  return <div className="site-shell">
    <header className="topbar home-topbar">
      <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); setPage('home') }}><span className="brand-mark">✳</span><span>yulya<span className="brand-light">studio</span></span><span className="beta-pill">BETA</span></a>
      <nav className={`main-nav ${mobileNav ? 'nav-open' : ''}`}>
        <a href="#discover">Discover</a><a href="#how">How it works</a><a href="#community">Community</a>
      </nav>
      <div className="top-actions"><button className="top-link" onClick={() => user ? setPage('profile') : setPage('login')}>{user ? `@${user.username}` : 'Log in'}</button><button className="button button-primary button-small" onClick={() => user ? setPage('profile') : setPage('login')}>{user ? 'My studio' : 'Start creating'} <ArrowRight size={15}/></button><button className="icon-button mobile-menu" aria-label="Toggle menu" onClick={() => setMobileNav(!mobileNav)}><Menu size={19}/></button></div>
    </header>
    <main>
      <section className="hero" id="home">
        <div className="hero-copy"><div className="eyebrow hero-eyebrow"><span className="live-dot"/> YOUR IDEAS, PLAYABLE</div><h1>Make a game.<br/><span>See it come alive.</span></h1><p className="hero-description">A tiny game studio in your browser. Describe what you imagine, shape it with code, and share something people can play.</p><div className="hero-actions"><button className="button button-primary" onClick={() => user ? setPage('profile') : setPage('login')}>Make your first game <ArrowRight size={16}/></button><a className="text-button" href="#discover">Explore the arcade <ArrowDown size={15}/></a></div><div className="hero-note"><div className="avatar-stack"><span className="avatar peach">p</span><span className="avatar lilac">l</span><span className="avatar mint">o</span><span className="avatar sky">m</span></div><span><b>Made by curious people</b><br/>Played everywhere</span></div></div>
        <div className="hero-art" aria-label="A dreamy illustration of a little game world"><div className="hero-grid"/><div className="floating-label label-top"><Sparkles size={13}/> made with a little help</div><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/><div className="hero-planet"><div className="planet-ring"/><div className="planet-face">✦</div><div className="planet-spark">✧</div></div><div className="hero-moon">☾</div><div className="pixel-cloud cloud-one">▪ ▪<br/>▪ ▪ ▪</div><div className="pixel-cloud cloud-two">▪ ▪ ▪<br/>　▪</div><div className="floating-label label-bottom"><span className="mini-wave">〰</span> playable in one click</div><div className="art-caption">a universe<br/>of tiny ideas <span>↗</span></div></div>
      </section>
      <section className="community-strip"><div className="strip-item"><span className="strip-icon violet"><Code2 size={17}/></span><span><b>Made in the browser</b><small>No setup, just make</small></span></div><div className="strip-divider"/><div className="strip-item"><span className="strip-icon orange"><Gamepad2 size={18}/></span><span><b>Made to be played</b><small>One link, any device</small></span></div><div className="strip-divider"/><div className="strip-item"><span className="strip-icon green"><Sparkles size={17}/></span><span><b>Made together</b><small>Remix a game you love</small></span></div><div className="strip-end">A little studio for big imagination <span>✳</span></div></section>
      <section className="arcade-section" id="discover"><div className="section-heading"><div><div className="eyebrow">THE COMMUNITY ARCADE</div><h2>Little worlds, <em>made by you.</em></h2><p>Press play. Find a favorite. Make your own version.</p></div><button className="button button-outline" onClick={() => api<{projects: Array<Record<string, unknown>>}>('/api/gallery').then(data => setGames(data.projects.map(projectToGame))).catch(() => notify('Could not refresh games'))}>Refresh games <ArrowRight size={15}/></button></div>{games.length ? <div className="game-grid">{games.map((game, index) => <GameCard key={game.projectId ?? game.id} game={game} index={index} onClick={() => { setCurrentGame(game); setModal('game') }} />)}</div> : <div className="gallery-empty">No public games yet. Be the first to make one.</div>}<div className="gallery-footer"><span><span className="live-dot"/> {games.length} PUBLIC GAMES</span><button className="quiet-button" onClick={() => setPage(user ? 'profile' : 'login')}>Have an idea? Make it real <ArrowRight size={14}/></button></div></section>
      <section className="how-section" id="how"><div className="how-title"><div className="eyebrow">FROM THOUGHT TO THUMBS-UP</div><h2>Three steps.<br/><em>One playable idea.</em></h2></div><div className="how-steps"><div className="how-step"><span className="step-index">01</span><div className="step-icon"><MessageSquare size={20}/></div><h3>Tell it what you imagine</h3><p>Start with a sentence, a sketch in your head, or a “what if…”</p></div><div className="step-step-line"/><div className="how-step"><span className="step-index">02</span><div className="step-icon peach-step"><Code2 size={20}/></div><h3>Make it yours</h3><p>See the code and the game side by side. Tweak anything you like.</p></div><div className="step-step-line"/><div className="how-step"><span className="step-index">03</span><div className="step-icon mint-step"><Rocket size={20}/></div><h3>Send it to a friend</h3><p>Share one link. They can play it, or make their own remix.</p></div></div></section>
      <section className="cta-section" id="community"><div className="cta-spark">✳</div><div><div className="eyebrow">YOUR TURN, CREATOR</div><h2>What will you make<br/>people <em>feel?</em></h2></div><button className="button button-light" onClick={() => setPage(user ? 'profile' : 'login')}>{user ? 'Open your studio' : 'Let’s find out'} <ArrowRight size={16}/></button><span className="cta-orbit cta-orbit-a"/><span className="cta-orbit cta-orbit-b"/></section>
    </main><footer className="footer"><a className="brand" href="#home"><span className="brand-mark">✳</span><span>yulya<span className="brand-light">studio</span></span></a><span>A tiny studio for curious minds.</span><span>Made with care <span className="footer-heart">♥</span></span></footer>
    {modal === 'game' && currentGame && <GameModal game={currentGame} close={() => setModal(null)} play={() => { if (currentGame.visibility === 'public') window.open(publicGameUrl(currentGame.creator, currentGame.id), '_blank', 'noopener,noreferrer'); else notify('This project is private'); setModal(null) }} remix={async () => { if (!user) { setModal(null); setPage('login'); return }; if (!currentGame.projectId) { notify('This game cannot be remixed'); return }; try { const result = await api<{project: Record<string, unknown>}>(`/api/projects/${currentGame.projectId}/remix`, { method: 'POST', body: '{}' }); const remix = projectToGame(result.project); setProjects(items => [remix, ...items]); setModal(null); await openStudio(remix) } catch (error) { notify(error instanceof Error ? error.message : 'Could not remix game') } }} />}
    {modal === 'new-project' && <NewProjectModal name={projectName} setName={setProjectName} visibility={visibility} setVisibility={setVisibility} close={() => setModal(null)} create={handleNewProject}/>}
    {modal === 'api-key' && <KeyModal value={apiKey} setValue={setApiKey} close={() => setModal(null)} save={saveKey} remove={removeKey} hasKey={hasKey}/>}
    {toast && <div className="toast"><Check size={15}/>{toast}</div>}
  </div>
}

function GameCard({ game, index, onClick }: { game: Game; index: number; onClick: () => void }) {
  return <article className={`game-card card-${index}`} onClick={onClick} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}><div className="game-art" style={{ '--game-color': game.color } as React.CSSProperties}><div className="game-art-stars">✦　·　✧</div><div className="game-art-object">{game.art}</div><span className="art-play"><Play size={14} fill="currentColor"/></span><span className="art-index">0{index + 1}</span></div><div className="game-card-info"><div><div className="game-genre">{game.genre}</div><h3>{game.title}</h3><p>{game.description}</p></div><div className="card-meta"><span className="creator-avatar" style={{ background: game.color }}>{game.creator[0]}</span><span>by <b>{game.creator}</b></span><span className="play-count"><Play size={11} fill="currentColor"/> {game.plays}</span></div></div></article>
}

function NewProjectModal({ name, setName, visibility, setVisibility, close, create }: { name: string; setName: (s: string) => void; visibility: 'private' | 'public'; setVisibility: (v: 'private' | 'public') => void; close: () => void; create: () => void }) {
  return <Modal close={close}><div className="modal-icon"><Sparkles size={18}/></div><div className="eyebrow">NEW LITTLE UNIVERSE</div><h2>Give your game a name.</h2><p>We’ll set up a blank canvas with a live preview.</p><label>Project name<input autoFocus value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-'))} placeholder="little-star"/></label><div className="visibility-choice"><button className={visibility === 'private' ? 'visibility-selected' : ''} onClick={() => setVisibility('private')}><LockKeyhole size={15}/><span><b>Private</b><small>Only you can see it</small></span>{visibility === 'private' && <Check size={14}/>}</button><button className={visibility === 'public' ? 'visibility-selected' : ''} onClick={() => setVisibility('public')}><Globe2 size={15}/><span><b>Public</b><small>Show it in the arcade</small></span>{visibility === 'public' && <Check size={14}/>}</button></div><button className="button button-primary modal-submit" onClick={create}>Create project <ArrowRight size={15}/></button></Modal>
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
function GameModal({ game, close, play, remix }: { game: Game; close: () => void; play: () => void; remix: () => void }) {
  return <Modal close={close} wide><div className="game-modal-art" style={{ '--game-color': game.color } as React.CSSProperties}><span>{game.art}</span><div className="game-art-stars">✦　·　✧</div></div><div className="game-modal-content"><div className="game-genre">{game.genre}</div><h2>{game.title}</h2><p>{game.description}</p><div className="game-modal-meta"><span className="creator-avatar" style={{ background: game.color }}>{game.creator[0]}</span><span>by <b>{game.creator}</b></span><span className="play-count"><Play size={11} fill="currentColor"/> {game.plays} plays</span></div><div className="modal-game-preview"><div className="preview-placeholder"><span>{game.art}</span><p>Open the game on its isolated play origin.</p></div><button className="button button-primary" onClick={play}><Play size={15} fill="currentColor"/> Play game</button></div><button className="remix-button" onClick={remix}><WandSparkles size={14}/> Remix this game <ArrowRight size={13}/></button></div></Modal>
}
function Modal({ children, close, wide = false }: { children: React.ReactNode; close: () => void; wide?: boolean }) { return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><div className={`modal-card ${wide ? 'modal-wide' : ''}`}><button className="modal-close" onClick={close} aria-label="Close"><X size={17}/></button>{children}</div></div> }
