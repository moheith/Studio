import { useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import Editor from '@monaco-editor/react'
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Braces, Check, ChevronDown, ChevronRight,
  CircleHelp, Code2, Copy, FileCode2, FileImage, FilePlus2, Folder, Gamepad2,
  Globe2, Grip, LockKeyhole, Menu, MessageSquare, MoreHorizontal, PanelLeft,
  Play, Plus, RefreshCw, Rocket, Settings2, Sparkles, Terminal, Trash2, Upload, WandSparkles,
  X, Zap,
} from 'lucide-react'
import { api, getFile, saveFile, setCsrfToken, streamSse, uploadAsset } from './api'

type Game = { id: string; title: string; creator: string; genre: string; color: string; art: string; plays: string; description: string; projectId?: string; visibility?: 'private' | 'public' }
type FileEntry = { name: string; kind: 'file' | 'folder'; language?: string }
type User = { id?: string; username: string; email: string; avatar?: string }
function projectToGame(value: Record<string, unknown>): Game {
  const id = String(value.slug ?? value.id ?? 'project')
  const username = String(value.username ?? 'creator')
  return { id, projectId: String(value.id ?? ''), title: String(value.title ?? id), creator: username, genre: 'WEB GAME', color: '#c7a6ff', art: '✦', plays: String(value.plays ?? 0), description: String(value.description ?? 'A game made in Yulya Studio.'), visibility: value.visibility === 'public' ? 'public' : 'private' }
}

const starterFiles: Record<string, string> = {
  'index.html': `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Little Star Game</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <main class="game">\n    <div class="eyebrow">A LITTLE GAME BY YOU</div>\n    <h1>Little Star</h1>\n    <p>Make something wonderful.</p>\n    <button id="play">Start playing <span>→</span></button>\n    <div class="stars" aria-hidden="true">✦　·　✧　·　✦</div>\n  </main>\n  <script src="app.js"></script>\n</body>\n</html>`,
  'style.css': `* { box-sizing: border-box; }\nbody { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101114; color: #f7f5f1; font-family: system-ui, sans-serif; }\n.game { width: min(92vw, 440px); padding: 56px 34px; text-align: center; border: 1px solid #292a30; border-radius: 24px; background: radial-gradient(ellipse at 50% 0%, #272136, #17171c 60%); }\n.eyebrow { color: #b5a3ed; font-size: 10px; letter-spacing: .2em; font-weight: 700; }\nh1 { margin: 20px 0 8px; font-size: clamp(42px, 9vw, 64px); letter-spacing: -.06em; }\np { margin: 0; color: #a5a4ad; }\nbutton { margin: 30px 0 10px; padding: 13px 19px; border: 0; border-radius: 10px; background: #c8a9ff; color: #1c1528; font-weight: 700; cursor: pointer; }\nbutton span { margin-left: 14px; }\n.stars { margin-top: 35px; color: #e8d8ff; font-size: 22px; }`,
  'app.js': `const button = document.querySelector('#play');\nbutton.addEventListener('click', () => {\n  button.innerHTML = 'You are the star ✦';\n  document.querySelector('h1').textContent = 'Let’s go!';\n});`,
}

const initialTree: FileEntry[] = [
  { name: 'public', kind: 'folder' },
  { name: 'src', kind: 'folder' },
  { name: 'index.html', kind: 'file', language: 'html' },
  { name: 'style.css', kind: 'file', language: 'css' },
  { name: 'app.js', kind: 'file', language: 'javascript' },
]

export default function App() {
  const [page, setPage] = useState<'home' | 'studio' | 'login' | 'profile'>('home')
  const [user, setUser] = useState<User | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [projects, setProjects] = useState<Game[]>([])
  const [currentGame, setCurrentGame] = useState<Game | null>(null)
  const [currentProjectId, setCurrentProjectId] = useState('')
  const [code, setCode] = useState<Record<string, string>>(starterFiles)
  const [activeFile, setActiveFile] = useState('app.js')
  const [tree, setTree] = useState(initialTree)
  const [terminalOpen, setTerminalOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chat, setChat] = useState('')
  const [chatHistory, setChatHistory] = useState<string[]>([])
  const [modal, setModal] = useState<'new-project' | 'api-key' | 'new-file' | 'game' | null>(null)
  const [toast, setToast] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [models, setModels] = useState<Array<{ id: string; display_name: string }>>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [projectName, setProjectName] = useState('little-star')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [saveState, setSaveState] = useState('All changes saved')
  const [previewKey, setPreviewKey] = useState(0)
  const [newFileName, setNewFileName] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const saveTimer = useRef<number | undefined>(undefined)

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
    }).catch(() => {})
    api<{ projects: Array<Record<string, unknown>> }>('/api/gallery').then((data) => setGames(data.projects.map(projectToGame))).catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); setSaveState('All changes saved'); setToast('Project saved')
      }
      if (event.key === 'Escape') { setModal(null); setMobileNav(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const language = useMemo(() => activeFile.endsWith('.html') ? 'html' : activeFile.endsWith('.css') ? 'css' : activeFile.endsWith('.json') ? 'json' : 'javascript', [activeFile])
  const openStudio = async (game?: Game) => {
    if (game) { setCurrentGame(game); setCurrentProjectId(game.projectId ?? '') }
    setPage('studio'); setModal(null)
    if (game?.projectId) await loadProject(game.projectId, game)
  }
  const notify = (message: string) => setToast(message)
  const handleEditor = (value?: string) => {
    const content = value ?? ''
    setCode((previous) => ({ ...previous, [activeFile]: content }))
    setSaveState('Saving…')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      if (currentProjectId) saveFile(currentProjectId, activeFile, content).then(() => { setSaveState('All changes saved'); setPreviewKey((v) => v + 1) }).catch((error) => { setSaveState('Save failed'); notify(error.message) })
      else setSaveState('Local preview')
    }, 500)
  }
  const handleNewProject = async () => {
    if (!user) { setPage('login'); setModal(null); return }
    if (!hasKey) { setModal('api-key'); return }
    try {
      const result = await api<{ project: Record<string, unknown> }>('/api/projects', { method: 'POST', body: JSON.stringify({ title: projectName, visibility }) })
      const project = projectToGame(result.project); setProjects((items) => [project, ...items]); setCurrentGame(project); setCurrentProjectId(project.projectId ?? ''); setCode(starterFiles); setTree(initialTree); setPage('studio'); setModal(null)
      if (project.projectId) await loadProject(project.projectId, project)
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not create project') }
  }
  const submitPrompt = async () => {
    if (!chat.trim()) return
    if (!selectedModel) { notify('Connect a key and choose an available Gemini model first'); return }
    const prompt = chat.trim(); setChat(''); setChatHistory((items) => [...items, `You: ${prompt}`]); setTerminalOpen(true)
    if (!currentProjectId) { setChatHistory((items) => [...items, 'Studio AI: Create a project to start an AI coding session.']); return }
    try {
      let answer = ''
      for await (const event of streamSse(`/api/projects/${currentProjectId}/ai/stream`, { prompt, model: selectedModel })) {
        if (event.type === 'token') { answer += event.data.text; setChatHistory((items) => { const next = [...items]; const last = next[next.length - 1]; if (last?.startsWith('Studio AI:')) next[next.length - 1] = `Studio AI: ${answer}`; else next.push(`Studio AI: ${answer}`); return next }) }
        if (event.type === 'tool') notify(`Updated ${event.data.path}`)
        if (event.type === 'reload_preview') setPreviewKey((v) => v + 1)
        if (event.type === 'error') { setChatHistory((items) => [...items, `Studio AI: ${event.data.message}`]); return }
      }
      const current = await api<{ files: Array<{ path: string }> }>(`/api/projects/${currentProjectId}/files`)
      const nextCode: Record<string, string> = {}; for (const file of current.files) { if (/\.(html|css|js|mjs|json)$/.test(file.path)) nextCode[file.path] = (await getFile(currentProjectId, file.path)).content }
      setCode(nextCode); setPreviewKey((v) => v + 1)
    } catch (error) { setChatHistory((items) => [...items, `Studio AI: ${error instanceof Error ? error.message : 'Request failed'}`]) }
  }
  const shareLink = () => {
    if (currentGame?.visibility !== 'public') { notify('Make this project public before sharing its game link'); return }
    navigator.clipboard?.writeText(`${import.meta.env.VITE_PLAY_ORIGIN ?? 'https://play.example.com'}/${user?.username ?? 'you'}/${currentGame?.id ?? 'little-star'}/`).catch(() => {})
    notify('Game link copied')
  }
  const toggleVisibility = async () => {
    if (!currentProjectId || !currentGame) return
    const next = currentGame.visibility === 'public' ? 'private' : 'public'
    try {
      await api(`/api/projects/${currentProjectId}/visibility`, { method: 'PATCH', body: JSON.stringify({ visibility: next }) })
      const updated = { ...currentGame, visibility: next as 'public' | 'private' }
      setCurrentGame(updated); setProjects(items => items.map(item => item.projectId === currentProjectId ? updated : item))
      if (next === 'public') setPreviewUrl(`${import.meta.env.VITE_PLAY_ORIGIN ?? 'https://play.example.com'}/${user?.username}/${updated.id}/`)
      else { const token = await api<{url:string}>(`/api/projects/${currentProjectId}/preview-token`, { method: 'POST', body: '{}' }); setPreviewUrl(token.url) }
      setPreviewKey(v => v + 1); notify(next === 'public' ? 'Game is public in the arcade' : 'Game is private')
    }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not change visibility') }
  }
  const saveKey = async () => {
    if (apiKey.trim().length < 12) { notify('Enter a valid Gemini API key'); return }
    try { await api('/api/keys/gemini', { method: 'POST', body: JSON.stringify({ api_key: apiKey.trim() }) }); const result = await api<{models: Array<{id: string; display_name: string}>}>('/api/models'); setModels(result.models); setSelectedModel(result.models[0]?.id ?? ''); setHasKey(true); setApiKey(''); setModal(null); notify('Gemini key verified and connected') }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not verify API key') }
  }
  const removeKey = async () => {
    try { await api('/api/keys/gemini', { method: 'DELETE' }); setHasKey(false); setModels([]); setSelectedModel(''); setModal(null); notify('Gemini key removed') }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not remove key') }
  }
  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }) } catch { /* clear the local view even if the API is offline */ }
    setCsrfToken(''); setUser(null); setProjects([]); setHasKey(false); setModels([]); setSelectedModel(''); setPage('home'); notify('Signed out')
  }
  const addFile = () => {
    const name = newFileName.trim()
    if (!name || name.includes('..') || name.startsWith('/') || !/\.(html|css|js|mjs|json|png|jpe?g|webp|gif|mp3|wav|ogg|mp4|webm|woff2?)$/i.test(name)) { notify('Use a supported browser file name'); return }
    setTree((items) => items.some((file) => file.name === name) ? items : [...items, { name, kind: 'file', language: name.endsWith('.css') ? 'css' : name.endsWith('.html') ? 'html' : name.endsWith('.json') ? 'json' : 'javascript' }])
    setCode((files) => ({ ...files, [name]: '' })); setActiveFile(name); setNewFileName(''); setModal(null)
    if (currentProjectId) saveFile(currentProjectId, name, '').catch((error) => notify(error.message))
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
      const loaded: Record<string, string> = {}; for (const file of result.files) if (/\.(html|css|js|mjs|json)$/.test(file.path)) loaded[file.path] = (await getFile(id, file.path)).content
      setCurrentProjectId(id); setCurrentGame(meta); setCode(loaded); setTree(result.files.map(file => ({ name: file.path, kind: 'file', language: file.path.endsWith('.css') ? 'css' : file.path.endsWith('.html') ? 'html' : file.path.endsWith('.json') ? 'json' : 'javascript' })))
      const preview = await api<{ url: string }>(`/api/projects/${id}/preview-token`, { method: 'POST', body: '{}' }).catch(() => ({ url: '' })); setPreviewUrl(preview.url)
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not open project') }
  }

  if (page === 'login') return <LoginPage onBack={() => setPage('home')} onLogin={(nextUser, csrf) => { setCsrfToken(csrf); setUser(nextUser); setHasKey(Boolean((nextUser as User & { has_api_key?: boolean }).has_api_key)); api<{projects: Array<Record<string, unknown>>}>('/api/projects').then(result => setProjects(result.projects.map(projectToGame))).catch(() => {}); if ((nextUser as User & {has_api_key?: boolean}).has_api_key) api<{models: Array<{id:string;display_name:string}>}>('/api/models').then(result => { setModels(result.models); setSelectedModel(result.models[0]?.id ?? '') }).catch(() => {}); setPage('profile') }} notify={notify} />
  if (page === 'profile') return <ProfilePage
    user={user} hasKey={hasKey} projects={projects}
    onHome={() => setPage('home')} onCreate={() => setModal('new-project')} onOpen={(game) => openStudio(game)} onKey={() => setModal('api-key')} onLogout={logout}
    onUsername={async (name) => {
      try {
        await api('/api/profile/username', { method: 'PUT', body: JSON.stringify({ username: name }) })
        setUser((current) => current ? { ...current, username: name } : current)
        const result = await api<{projects: Array<Record<string, unknown>>}>('/api/projects')
        setProjects(result.projects.map(projectToGame))
        notify('Username saved')
      } catch (error) { notify(error instanceof Error ? error.message : 'Could not save username') }
    }}
  />
  if (page === 'studio') return <><StudioPage {...{
    user, currentGame, activeFile, code, language, tree, sidebarOpen, terminalOpen, chat, chatHistory, saveState, previewKey, currentProjectId, previewUrl, newFileName, modal, models, selectedModel,
    setPage, setModal, setActiveFile, setSidebarOpen, setTerminalOpen, setChat, handleEditor, submitPrompt, shareLink,
    notify, setPreviewKey, setMobileNav, mobileNav, setTree, setNewFileName, addFile, toggleVisibility, setSelectedModel, uploadProjectAsset,
  }} />{modal === 'new-file' && <Modal close={() => setModal(null)}><div className="eyebrow">PROJECT FILE</div><h2>Create a browser asset</h2><label>File path<input autoFocus value={newFileName} onChange={e => setNewFileName(e.target.value)} placeholder="assets/scene.js" /></label><button className="button button-primary modal-submit" onClick={addFile}>Create file</button></Modal>}{modal === 'api-key' && <KeyModal value={apiKey} setValue={setApiKey} close={() => setModal(null)} save={saveKey} remove={removeKey} hasKey={hasKey}/>}</>

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
      <section className="arcade-section" id="discover"><div className="section-heading"><div><div className="eyebrow">THE COMMUNITY ARCADE</div><h2>Little worlds, <em>made by you.</em></h2><p>Press play. Find a favorite. Make your own version.</p></div><button className="button button-outline" onClick={() => api<{projects: Array<Record<string, unknown>>}>('/api/gallery').then(data => setGames(data.projects.map(projectToGame))).catch(() => notify('Could not refresh games'))}>Refresh games <ArrowRight size={15}/></button></div>{games.length ? <div className="game-grid">{games.map((game, index) => <GameCard key={game.projectId ?? game.id} game={game} index={index} onClick={() => { setCurrentGame(game); setModal('game') }} />)}</div> : <div className="gallery-empty">No public games yet. Be the first to make one.</div>}<div className="gallery-footer"><span><span className="live-dot"/> {games.length} PUBLIC GAMES</span><button className="quiet-button" onClick={() => setPage('login')}>Have an idea? Make it real <ArrowRight size={14}/></button></div></section>
      <section className="how-section" id="how"><div className="how-title"><div className="eyebrow">FROM THOUGHT TO THUMBS-UP</div><h2>Three steps.<br/><em>One playable idea.</em></h2></div><div className="how-steps"><div className="how-step"><span className="step-index">01</span><div className="step-icon"><MessageSquare size={20}/></div><h3>Tell it what you imagine</h3><p>Start with a sentence, a sketch in your head, or a “what if…”</p></div><div className="step-step-line"/><div className="how-step"><span className="step-index">02</span><div className="step-icon peach-step"><Code2 size={20}/></div><h3>Make it yours</h3><p>See the code and the game side by side. Tweak anything you like.</p></div><div className="step-step-line"/><div className="how-step"><span className="step-index">03</span><div className="step-icon mint-step"><Rocket size={20}/></div><h3>Send it to a friend</h3><p>Share one link. They can play it, or make their own remix.</p></div></div></section>
      <section className="cta-section" id="community"><div className="cta-spark">✳</div><div><div className="eyebrow">YOUR TURN, CREATOR</div><h2>What will you make<br/>people <em>feel?</em></h2></div><button className="button button-light" onClick={() => setPage('login')}>Let’s find out <ArrowRight size={16}/></button><span className="cta-orbit cta-orbit-a"/><span className="cta-orbit cta-orbit-b"/></section>
    </main><footer className="footer"><a className="brand" href="#home"><span className="brand-mark">✳</span><span>yulya<span className="brand-light">studio</span></span></a><span>A tiny studio for curious minds.</span><span>Made with care <span className="footer-heart">♥</span></span></footer>
    {modal === 'game' && currentGame && <GameModal game={currentGame} close={() => setModal(null)} play={() => { if (currentGame.visibility === 'public') window.open(`${import.meta.env.VITE_PLAY_ORIGIN ?? 'https://play.example.com'}/${currentGame.creator}/${currentGame.id}/`, '_blank', 'noopener,noreferrer'); else notify('This project is private'); setModal(null) }} remix={async () => { if (!user) { setModal(null); setPage('login'); return }; if (!currentGame.projectId) { notify('This game cannot be remixed'); return }; try { const result = await api<{project: Record<string, unknown>}>(`/api/projects/${currentGame.projectId}/remix`, { method: 'POST', body: '{}' }); const remix = projectToGame(result.project); setProjects(items => [remix, ...items]); setModal(null); await openStudio(remix) } catch (error) { notify(error instanceof Error ? error.message : 'Could not remix game') } }} />}
    {modal === 'new-project' && <NewProjectModal name={projectName} setName={setProjectName} visibility={visibility} setVisibility={setVisibility} close={() => setModal(null)} create={handleNewProject}/>}
    {modal === 'api-key' && <KeyModal value={apiKey} setValue={setApiKey} close={() => setModal(null)} save={saveKey} remove={removeKey} hasKey={hasKey}/>}
    {toast && <div className="toast"><Check size={15}/>{toast}</div>}
  </div>
}

function GameCard({ game, index, onClick }: { game: Game; index: number; onClick: () => void }) {
  return <article className={`game-card card-${index}`} onClick={onClick} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}><div className="game-art" style={{ '--game-color': game.color } as React.CSSProperties}><div className="game-art-stars">✦　·　✧</div><div className="game-art-object">{game.art}</div><span className="art-play"><Play size={14} fill="currentColor"/></span><span className="art-index">0{index + 1}</span></div><div className="game-card-info"><div><div className="game-genre">{game.genre}</div><h3>{game.title}</h3><p>{game.description}</p></div><div className="card-meta"><span className="creator-avatar" style={{ background: game.color }}>{game.creator[0]}</span><span>by <b>{game.creator}</b></span><span className="play-count"><Play size={11} fill="currentColor"/> {game.plays}</span></div></div></article>
}

function LoginPage({ onBack, onLogin, notify }: { onBack: () => void; onLogin: (user: User, csrf: string) => void; notify: (s: string) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [mode, setMode] = useState<'login' | 'signup' | 'verify'>('signup'); const [code, setCode] = useState('')
  const submit = async () => { try { if (mode === 'signup') { const result = await api<{verification_required: boolean; development_code?: string}>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }); setMode('verify'); if (result.development_code) notify(`Development verification code: ${result.development_code}`); else notify('Check your email for a verification code') } else if (mode === 'verify') { const result = await api<{user: User; csrf_token: string}>('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ email, code }) }); onLogin(result.user, result.csrf_token) } else { const result = await api<{user: User; csrf_token: string}>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); onLogin(result.user, result.csrf_token) } } catch (error) { notify(error instanceof Error ? error.message : 'Could not sign in') } }
  return <div className="auth-screen"><button className="auth-back" onClick={onBack}><ArrowLeft size={16}/> Back to Yulya</button><div className="auth-card"><a className="brand auth-brand" onClick={onBack}><span className="brand-mark">✳</span><span>yulya<span className="brand-light">studio</span></span></a><div className="auth-kicker">YOUR NEXT LITTLE BIG THING</div><h1>{mode === 'signup' ? 'Let’s make something.' : mode === 'verify' ? 'Check your email.' : 'Welcome back.'}</h1><p>Sign in to your studio and make an idea playable.</p><div className="auth-separator"><span/>email sign-in<span/></div><label>Email address<input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>{mode !== 'verify' && <label>Password<input type="password" placeholder="At least 10 characters" value={password} onChange={(e) => setPassword(e.target.value)} /></label>}{mode === 'verify' && <label>Verification code<input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 digit code" /></label>}<button className="button button-primary auth-submit" onClick={submit}>{mode === 'signup' ? 'Create account' : mode === 'verify' ? 'Verify email' : 'Sign in'} <ArrowRight size={15}/></button>{mode !== 'verify' && <p className="auth-switch">{mode === 'signup' ? 'Already have a studio?' : 'New to Yulya?'} <button onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'Log in' : 'Make an account'}</button></p>}<div className="auth-legal">Email accounts require verification.</div></div><div className="auth-decoration"><span>✦</span><span>✧</span><span>·</span><span>✳</span></div></div>
}

function ProfilePage({ user, hasKey, projects, onHome, onCreate, onOpen, onKey, onUsername, onLogout }: { user: User | null; hasKey: boolean; projects: Game[]; onHome: () => void; onCreate: () => void; onOpen: (game: Game) => void; onKey: () => void; onUsername: (name: string) => void; onLogout: () => void }) {
  const [username, setUsername] = useState(user?.username ?? '')
  return <div className="profile-shell"><header className="topbar profile-topbar"><button className="brand" onClick={onHome}><span className="brand-mark">✳</span><span>yulya<span className="brand-light">studio</span></span></button><div className="profile-top-actions"><button className="quiet-button" onClick={onHome}>Arcade</button><button className="quiet-button" onClick={onLogout}>Sign out</button><button className="profile-avatar">{user?.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer"/> : user?.username?.[0]?.toUpperCase() ?? 'Y'}</button></div></header><main className="profile-main"><div className="profile-hero"><div className="profile-avatar profile-avatar-large">{user?.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer"/> : user?.username?.[0]?.toUpperCase() ?? 'Y'}</div><div><div className="eyebrow">YOUR CREATOR SPACE</div><h1>{user?.username ?? 'creator'}</h1><p>{user?.email}</p>{!user?.username && <div className="username-setup"><input value={username} onChange={e => setUsername(e.target.value.toLowerCase())} placeholder="Choose a unique username"/><button className="button button-primary" onClick={() => onUsername(username)}>Save username</button></div>}</div><button className="button button-primary" onClick={onCreate}><Plus size={16}/> New project</button></div><div className="profile-tabs"><span className="tab-active">Projects <span>{projects.length}</span></span><span className="tab-settings" onClick={onKey}><Settings2 size={14}/>{hasKey ? 'AI key connected' : 'Connect AI key'}{hasKey && <Check size={13}/>}</span></div><div className="project-grid"><button className="project-new-card" onClick={onCreate}><span className="new-card-plus"><Plus size={20}/></span><b>Start with a blank canvas</b><small>HTML, CSS, JavaScript. Your idea goes here.</small></button>{projects.map(game => <button className="project-card" key={game.projectId} onClick={() => onOpen(game)}><div className="project-thumb"><span>✦</span><span className="project-thumb-small">{game.title}</span></div><div className="project-card-bottom"><div><b>{game.title}</b><small>Edited recently · {game.visibility}</small></div><MoreHorizontal size={17}/></div></button>)}</div></main></div>
}

type StudioProps = {
  user: User | null; currentGame: Game | null; activeFile: string; code: Record<string, string>; language: string; tree: FileEntry[]; sidebarOpen: boolean; terminalOpen: boolean; chat: string; chatHistory: string[]; saveState: string; previewKey: number; mobileNav: boolean; currentProjectId: string; previewUrl: string; newFileName: string; modal: 'new-project' | 'api-key' | 'new-file' | 'game' | null; models: Array<{id: string; display_name: string}>; selectedModel: string;
  setPage: (p: 'home' | 'studio' | 'login' | 'profile') => void; setModal: (m: 'new-project' | 'api-key' | 'new-file' | 'game' | null) => void; setActiveFile: (s: string) => void; setSidebarOpen: (v: boolean) => void; setTerminalOpen: (v: boolean) => void; setChat: (s: string) => void; handleEditor: (s?: string) => void; submitPrompt: () => void; shareLink: () => void; notify: (s: string) => void; setPreviewKey: (n: number) => void; setMobileNav: (v: boolean) => void; setTree: (files: FileEntry[]) => void; setNewFileName: (s: string) => void; addFile: () => void; toggleVisibility: () => void; setSelectedModel: (s: string) => void; uploadProjectAsset: (file: File) => void;
}
function StudioPage(p: StudioProps) {
  const [leftWidth, setLeftWidth] = useState(220); const [centerWidth, setCenterWidth] = useState(51); const [dragging, setDragging] = useState(false)
  const title = p.currentGame?.title ?? 'Little Star'
  const startDrag = (kind: 'left' | 'center', e: React.MouseEvent) => { e.preventDefault(); setDragging(true); const move = (event: MouseEvent) => { if (kind === 'left') setLeftWidth(Math.max(170, Math.min(330, event.clientX))); else setCenterWidth(Math.max(30, Math.min(70, event.clientX / window.innerWidth * 100))) }; const up = () => { setDragging(false); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up) }
  return <div className={`ide-shell ${dragging ? 'is-resizing' : ''}`}>
    <header className="ide-topbar"><button className="ide-brand" onClick={() => p.setPage('home')}><span className="brand-mark">✳</span><span>yulya</span><span className="ide-brand-small">studio</span></button><div className="ide-crumb"><span>My projects</span><ChevronRight size={13}/><b>{title.toLowerCase().replace(/\s/g, '-')}</b><ChevronDown size={13}/></div><div className="ide-top-center"><span className="save-indicator"><span className="save-dot"/>{p.saveState}</span></div><div className="ide-top-actions"><button className="icon-button ide-help" title="Help"><CircleHelp size={16}/></button><button className="icon-button ide-settings" title="Settings" onClick={() => p.setModal('api-key')}><Settings2 size={16}/></button><button className="button button-outline ide-share" onClick={p.shareLink}><Copy size={14}/> Copy game link</button><button className="button button-primary ide-publish" onClick={p.toggleVisibility}><Rocket size={14}/> {p.currentGame?.visibility === 'public' ? 'Make private' : 'Publish game'}</button><button className="profile-avatar profile-avatar-small" onClick={() => p.setPage('profile')}>{p.user?.username[0]?.toUpperCase() ?? 'Y'}</button></div></header>
    <div className="ide-workspace">
      <aside className={`explorer-pane ${p.sidebarOpen ? '' : 'hidden-pane'}`} style={{ width: p.sidebarOpen ? leftWidth : 0 }}><div className="pane-heading"><span>EXPLORER</span><div><button className="mini-icon" title="New file" onClick={() => p.setModal('new-file')}><FilePlus2 size={14}/></button><button className="mini-icon" title="Upload asset" onClick={() => document.getElementById('project-asset-upload')?.click()}><Upload size={14}/></button><input id="project-asset-upload" type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.ogg,.mp4,.webm,.woff,.woff2" hidden onChange={event => { const file = event.target.files?.[0]; if (file) p.uploadProjectAsset(file); event.currentTarget.value = '' }}/><button className="mini-icon" title="More"><MoreHorizontal size={14}/></button></div></div><div className="workspace-label"><ChevronDown size={13}/><b>YULYA GAME</b><span className="workspace-actions"><button className="mini-icon" onClick={() => p.setModal('new-file')}><Plus size={13}/></button></span></div><div className="file-list">{p.tree.map((file) => <button key={file.name} className={`file-row ${p.activeFile === file.name ? 'file-active' : ''}`} onClick={() => file.kind === 'file' && p.setActiveFile(file.name)}>{file.kind === 'folder' ? <><ChevronRight size={12}/><Folder size={14} className="folder-icon"/></> : <FileIcon name={file.name}/>}<span>{file.name}</span></button>)}</div><div className="explorer-bottom"><div className="explorer-tip"><Sparkles size={14}/><span><b>Small steps make games.</b><br/>Ask the AI to help with anything.</span></div><button className="explorer-profile" onClick={() => p.setPage('profile')}><span className="profile-avatar profile-avatar-tiny">{p.user?.username[0]?.toUpperCase() ?? 'Y'}</span><span><b>{p.user?.username ?? 'Your profile'}</b><small>Creator account</small></span><MoreHorizontal size={16}/></button></div></aside>
      {p.sidebarOpen && <div className="resize-handle" onMouseDown={(e) => startDrag('left', e)}><Grip size={11}/></div>}
      <section className="editor-pane" style={{ width: `${p.sidebarOpen ? 100 - centerWidth : 100 - centerWidth}%` }}><div className="editor-tabs"><button className="sidebar-toggle" onClick={() => p.setSidebarOpen(!p.sidebarOpen)}><PanelLeft size={15}/></button>{[...p.tree.filter(f => f.kind === 'file').slice(0, 4)].map((file) => <button key={file.name} className={`editor-tab ${p.activeFile === file.name ? 'active-tab' : ''}`} onClick={() => p.setActiveFile(file.name)}><FileIcon name={file.name}/>{file.name}{p.activeFile === file.name && <X size={12}/>}</button>)}<button className="tab-plus" onClick={() => p.setModal('new-file')}><Plus size={14}/></button><button className="editor-more"><MoreHorizontal size={15}/></button></div><div className="editor-breadcrumb"><span>src</span><ChevronRight size={12}/><b><FileIcon name={p.activeFile}/>{p.activeFile}</b><span className="breadcrumb-spacer"/><button className="mini-icon" title="Format code"><Braces size={14}/></button></div><div className="editor-body"><Editor height="100%" language={p.language} theme="vs-dark" value={p.code[p.activeFile] ?? ''} onChange={p.handleEditor} options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: 'DM Mono, monospace', lineNumbers: 'on', roundedSelection: false, scrollBeyondLastLine: false, automaticLayout: true, wordWrap: 'on', padding: { top: 16 }, cursorBlinking: 'smooth', smoothScrolling: true, renderLineHighlight: 'gutter', tabSize: 2 }} /></div><div className="editor-status"><span><Code2 size={12}/>{p.language.toUpperCase()}</span><span>UTF-8</span><span>Spaces: 2</span><span className="status-spacer"/><span>Ln 1, Col 1</span><span>✦ Studio AI</span></div></section>
      <div className="resize-handle center-handle" onMouseDown={(e) => startDrag('center', e)}><Grip size={11}/></div>
      <section className="preview-pane"><div className="preview-toolbar"><div className="preview-title"><span className="live-dot"/><b>PREVIEW</b><span className="preview-label">LIVE</span></div><div className="preview-controls"><button className="mini-icon" title="Desktop preview"><MonitorIcon/></button><button className="mini-icon" title="Mobile preview"><SmartphoneIcon/></button><span className="toolbar-separator"/><button className="mini-icon" title="Reload" onClick={() => p.setPreviewKey(p.previewKey + 1)}><RefreshCw size={14}/></button><button className="mini-icon" title="Open game" onClick={() => p.previewUrl && window.open(p.previewUrl, '_blank', 'noopener,noreferrer')}><ArrowUpRight size={14}/></button><button className="mini-icon" title="Fullscreen"><span className="fullscreen-glyph">⛶</span></button></div></div><div className="preview-address"><LockKeyhole size={11}/><span>{p.currentGame?.visibility === 'public' ? `${import.meta.env.VITE_PLAY_ORIGIN ?? 'play.example.com'}/${p.user?.username ?? 'creator'}/${p.currentGame?.id}/` : 'Private preview · token expires in 10 minutes'}</span><button onClick={p.shareLink}><Copy size={12}/></button></div><div className="preview-frame-wrap">{p.previewUrl ? <iframe key={p.previewKey} title="Isolated game preview" className="game-iframe" sandbox="allow-scripts" src={p.previewUrl} referrerPolicy="no-referrer" /> : <div className="preview-placeholder">Save and open a project to load its isolated preview.</div>}</div><div className="preview-footer"><span><span className="live-dot"/> Auto-updating</span><button onClick={() => p.setPreviewKey(p.previewKey + 1)}><MonitorIcon/> Reload preview</button></div></section>
    </div>
    <div className={`terminal-pane ${p.terminalOpen ? '' : 'terminal-collapsed'}`}><div className="terminal-head"><div className="terminal-tabs"><button className="terminal-title" onClick={() => p.setTerminalOpen(!p.terminalOpen)}><Terminal size={14}/><span>STUDIO AI</span><ChevronDown size={12}/></button><button className="terminal-tab active-terminal-tab"><MessageSquare size={13}/> Chat</button><button className="terminal-tab" onClick={() => p.notify('No build errors')}>Output</button><button className="terminal-tab" onClick={() => p.notify('No current problems')}>Problems</button><span className="terminal-session"><span className="save-dot"/> Ready</span></div><div className="terminal-tools"><button className="mini-icon" title="Clear chat" onClick={() => p.notify('Chat cleared')}><Trash2 size={14}/></button><button className="mini-icon" title="Expand panel" onClick={() => p.setTerminalOpen(!p.terminalOpen)}><ArrowUpRight size={14}/></button></div></div>{p.terminalOpen && <><div className="chat-area"><div className="assistant-intro"><div className="assistant-avatar"><Sparkles size={16}/></div><div><b>Hey{p.user ? `, ${p.user.username}` : ' there'}! Let’s make something.</b><p>I can help you build the game you’re imagining. Tell me what to change, or pick a starting point:</p><div className="suggestion-chips"><button onClick={() => p.setChat('Make the star move with arrow keys')}>⌁ Add movement</button><button onClick={() => p.setChat('Add a score counter and a timer')}>✳ Add a score</button><button onClick={() => p.setChat('Make the background feel more dreamy')}>◌ Change the mood</button></div></div></div>{p.chatHistory.map((line, index) => <div className={line.startsWith('You:') ? 'chat-message user-message' : 'chat-message'} key={index}>{line.startsWith('You:') ? <><span className="message-tag">YOU</span>{line.slice(4)}</> : <><span className="message-tag ai-tag">AI</span>{line.slice(12)}</>}</div>)}</div><div className="chat-composer"><div className="composer-context"><span className="context-lock"><LockKeyhole size={11}/></span><span>Working in <b>{p.currentGame?.title ?? 'Little Star'}</b></span><span className="context-dot">·</span><select aria-label="Gemini model" value={p.selectedModel} onChange={e => p.setSelectedModel(e.target.value)}>{p.models.length ? p.models.map(model => <option key={model.id} value={model.id}>{model.display_name}</option>) : <option value="">Connect a Gemini key</option>}</select><button onClick={() => p.setModal('api-key')}>Key settings</button></div><div className="composer-input-row"><textarea value={p.chat} onChange={(e) => p.setChat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); p.submitPrompt() } }} placeholder="Describe a change… Shift + Enter for a new line"/><button className="attach-button" title="Add context" onClick={() => p.notify('Project files are already in context')}><Plus size={16}/></button><button className="send-button" disabled={!p.chat.trim() || !p.selectedModel} onClick={p.submitPrompt}><ArrowUpRight size={17}/></button></div><div className="composer-foot"><span><Sparkles size={12}/> AI can make mistakes. Review changes as you go.</span><span><kbd>↵</kbd> send</span></div></div></>}</div>
    {p.mobileNav && <button className="mobile-overlay" aria-label="Close menu" onClick={() => p.setMobileNav(false)}/>}
    <div className="ide-bottom-hint"><span>●</span> Project {p.currentGame?.visibility ?? 'private'} <button onClick={p.shareLink}>Copy game link</button></div>
  </div>
}

function FileIcon({ name }: { name: string }) { const ext = name.split('.').pop(); const icon = ext === 'html' ? <FileCode2 size={13} className="file-html"/> : ext === 'css' ? <Braces size={13} className="file-css"/> : ext === 'png' || ext === 'jpg' ? <FileImage size={13} className="file-image"/> : ext === 'json' ? <Braces size={13} className="file-json"/> : <Code2 size={13} className="file-js"/>; return icon }
function MonitorIcon() { return <span className="monitor-glyph">▱</span> }
function SmartphoneIcon() { return <span className="phone-glyph">▯</span> }

function NewProjectModal({ name, setName, visibility, setVisibility, close, create }: { name: string; setName: (s: string) => void; visibility: 'private' | 'public'; setVisibility: (v: 'private' | 'public') => void; close: () => void; create: () => void }) {
  return <Modal close={close}><div className="modal-icon"><Sparkles size={18}/></div><div className="eyebrow">NEW LITTLE UNIVERSE</div><h2>Give your game a name.</h2><p>We’ll set up a blank canvas with a live preview.</p><label>Project name<input autoFocus value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-'))} placeholder="little-star"/></label><div className="visibility-choice"><button className={visibility === 'private' ? 'visibility-selected' : ''} onClick={() => setVisibility('private')}><LockKeyhole size={15}/><span><b>Private</b><small>Only you can see it</small></span>{visibility === 'private' && <Check size={14}/>}</button><button className={visibility === 'public' ? 'visibility-selected' : ''} onClick={() => setVisibility('public')}><Globe2 size={15}/><span><b>Public</b><small>Show it in the arcade</small></span>{visibility === 'public' && <Check size={14}/>}</button></div><button className="button button-primary modal-submit" onClick={create}>Create project <ArrowRight size={15}/></button></Modal>
}
function KeyModal({ value, setValue, close, save, remove, hasKey }: { value: string; setValue: (s: string) => void; close: () => void; save: () => void; remove: () => void; hasKey: boolean }) {
  return <Modal close={close}><div className="modal-icon key-modal-icon"><Zap size={18}/></div><div className="eyebrow">BRING YOUR OWN KEY</div><h2>{hasKey ? 'Replace your Gemini key.' : 'Connect your Gemini key.'}</h2><p>Your key lets the coding assistant work for you. It’s encrypted and never shown again.</p><label>Google AI Studio API key<input autoFocus type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste your API key" autoComplete="off"/></label><a className="key-help" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get a key from Google AI Studio <ArrowUpRight size={12}/></a><button className="button button-primary modal-submit" onClick={save}>Verify and connect <ArrowRight size={15}/></button>{hasKey && <button className="quiet-button" onClick={remove}>Remove connected key</button>}</Modal>
}
function GameModal({ game, close, play, remix }: { game: Game; close: () => void; play: () => void; remix: () => void }) {
  return <Modal close={close} wide><div className="game-modal-art" style={{ '--game-color': game.color } as React.CSSProperties}><span>{game.art}</span><div className="game-art-stars">✦　·　✧</div></div><div className="game-modal-content"><div className="game-genre">{game.genre}</div><h2>{game.title}</h2><p>{game.description}</p><div className="game-modal-meta"><span className="creator-avatar" style={{ background: game.color }}>{game.creator[0]}</span><span>by <b>{game.creator}</b></span><span className="play-count"><Play size={11} fill="currentColor"/> {game.plays} plays</span></div><div className="modal-game-preview"><div className="preview-placeholder"><span>{game.art}</span><p>Open the game on its isolated play origin.</p></div><button className="button button-primary" onClick={play}><Play size={15} fill="currentColor"/> Play game</button></div><button className="remix-button" onClick={remix}><WandSparkles size={14}/> Remix this game <ArrowRight size={13}/></button></div></Modal>
}
function Modal({ children, close, wide = false }: { children: React.ReactNode; close: () => void; wide?: boolean }) { return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><div className={`modal-card ${wide ? 'modal-wide' : ''}`}><button className="modal-close" onClick={close} aria-label="Close"><X size={17}/></button>{children}</div></div> }
