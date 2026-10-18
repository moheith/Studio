Attempting to perform the InitializeDefaultDrives operation on the 'FileSystem' provider failed.
import { useRef, useState } from 'react'
import type * as React from 'react'
import Editor from '@monaco-editor/react'
import {
  ArrowUpRight, Braces, Check, ChevronDown, ChevronRight, CircleHelp, Code2, Copy,
  FileCode2, FileImage, FilePlus2, Folder, LockKeyhole, Maximize2, MessageSquare,
  Monitor, MoreHorizontal, PanelLeft, Plus, RefreshCw, Rocket, Settings2, Smartphone,
  Sparkles, Terminal, Trash2, Upload,
} from 'lucide-react'
import type { FileEntry, Game, Page, User } from '../types'

type StudioProps = {
  user: User | null; currentGame: Game | null; activeFile: string; code: Record<string, string>; language: string; tree: FileEntry[]; sidebarOpen: boolean; terminalOpen: boolean; chat: string; chatHistory: string[]; saveState: string; previewKey: number; mobileNav: boolean; currentProjectId: string; previewUrl: string; newFileName: string; modal: 'new-project' | 'api-key' | 'new-file' | 'game' | null; models: Array<{ id: string; display_name: string }>; selectedModel: string
  setPage: (p: Page) => void; setModal: (m: 'new-project' | 'api-key' | 'new-file' | 'game' | null) => void; setActiveFile: (s: string) => void; setSidebarOpen: (v: boolean) => void; setTerminalOpen: (v: boolean) => void; setChat: (s: string) => void; handleEditor: (s?: string) => void; submitPrompt: () => void; shareLink: () => void; notify: (s: string) => void; setPreviewKey: (n: number) => void; setMobileNav: (v: boolean) => void; setTree: (files: FileEntry[]) => void; setNewFileName: (s: string) => void; addFile: () => void; toggleVisibility: () => void; setSelectedModel: (s: string) => void; uploadProjectAsset: (file: File) => void; onClearChat: () => void; onReloadFiles: () => void
}

type PanelTab = 'chat' | 'output' | 'problems'
type EditorHandle = { getValue: () => string; getAction: (id: string) => { run: () => Promise<void> } | null }

export default function StudioPage(p: StudioProps) {
  const [leftWidth, setLeftWidth] = useState(235)
  const [centerWidth, setCenterWidth] = useState(52)
  const [dragging, setDragging] = useState(false)
  const [panelTab, setPanelTab] = useState<PanelTab>('chat')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const editorRef = useRef<EditorHandle | null>(null)
  const previewWrapRef = useRef<HTMLDivElement | null>(null)
  const title = p.currentGame?.title ?? 'Opening project'
  const publicUrl = p.currentGame && p.user ? `${window.location.origin}/${encodeURIComponent(p.user.username)}/${encodeURIComponent(p.currentGame.id)}` : ''
  const startDrag = (kind: 'left' | 'center', e: React.MouseEvent) => {
    e.preventDefault(); setDragging(true)
    const move = (event: MouseEvent) => {
      if (kind === 'left') setLeftWidth(Math.max(180, Math.min(360, event.clientX)))
      else setCenterWidth(Math.max(30, Math.min(70, event.clientX / window.innerWidth * 100)))
    }
    const up = () => { setDragging(false); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  const formatDocument = async () => {
    const value = editorRef.current?.getValue() ?? ''
    if (p.activeFile.toLowerCase().endsWith('.json')) {
      try { p.handleEditor(JSON.stringify(JSON.parse(value), null, 2)); p.notify('JSON formatted') }
      catch { p.notify('This JSON has a syntax error, so it cannot be formatted yet') }
      return
    }
    const formatter = editorRef.current?.getAction('editor.action.formatDocument')
    if (formatter) {
      try { await formatter.run(); p.notify('Document formatted') }
      catch { p.notify('No formatter is configured for this file type yet') }
    } else p.notify('No formatter is configured for this file type yet')
  }
  const clearChat = () => {
    if (window.confirm('Clear the saved AI conversation for this project? This cannot be undone.')) p.onClearChat()
  }

  return <div className={`ide-shell ${dragging ? 'is-resizing' : ''}`}>
    <header className="ide-topbar">
      <button className="ide-brand" onClick={() => p.setPage('home')} aria-label="Back to Yulya Studio home"><span className="brand-mark">✳</span><span>yulya</span><span className="ide-brand-small">studio</span></button>
      <div className="ide-crumb"><button onClick={() => p.setPage('profile')}>My projects</button><ChevronRight size={13}/><b>{title.toLowerCase().replace(/\s/g, '-')}</b></div>
      <div className="ide-top-center"><span className="save-indicator"><span className="save-dot"/>{p.saveState}</span></div>
      <div className="ide-top-actions">
        <button className="icon-button ide-help" title="Studio help" aria-label="Studio help" onClick={() => p.notify('Shortcuts: Ctrl/Cmd+S saves; Enter sends to AI; Shift+Enter adds a line. Game code runs only in the isolated browser preview.')}><CircleHelp size={16}/></button>
        <button className="icon-button ide-settings" title="AI key settings" aria-label="AI key settings" onClick={() => p.setModal('api-key')}><Settings2 size={16}/></button>
        <button className="button button-outline ide-share" onClick={p.shareLink}><Copy size={14}/> Copy game link</button>
        <button className="button button-primary ide-publish" onClick={p.toggleVisibility}><Rocket size={14}/> {p.currentGame?.visibility === 'public' ? 'Make private' : 'Publish game'}</button>
        <button className="profile-avatar profile-avatar-small" onClick={() => p.setPage('profile')} aria-label="Open your profile">{p.user?.username[0]?.toUpperCase() ?? 'Y'}</button>
      </div>
    </header>

    <div className="ide-workspace">
      <aside className={`explorer-pane ${p.sidebarOpen ? '' : 'hidden-pane'}`} style={{ width: p.sidebarOpen ? leftWidth : 0 }}>
        <div className="pane-heading"><span>EXPLORER</span><div>
          <button className="mini-icon" title="New file" aria-label="New file" onClick={() => p.setModal('new-file')}><FilePlus2 size={14}/></button>
          <button className="mini-icon" title="Add image, audio, video, or font asset to this project" aria-label="Add media asset" onClick={() => document.getElementById('project-asset-upload')?.click()}><Upload size={14}/></button>
          <input id="project-asset-upload" type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.ogg,.mp4,.webm,.woff,.woff2" hidden onChange={event => { const file = event.target.files?.[0]; if (file) p.uploadProjectAsset(file); event.currentTarget.value = '' }}/>
          <button className="mini-icon" title="Refresh project files" aria-label="Refresh project files" onClick={p.onReloadFiles}><RefreshCw size={13}/></button>
        </div></div>
        <div className="workspace-label"><ChevronDown size={13}/><b>{p.currentGame?.id?.toUpperCase() ?? 'PROJECT'}</b><span className="workspace-actions"><button className="mini-icon" title="New file" aria-label="New file" onClick={() => p.setModal('new-file')}><Plus size={13}/></button></span></div>
        <p className="explorer-scope"><LockKeyhole size={11}/> Files stay inside this game project. Upload accepts media assets only.</p>
        <div className="file-list">{p.tree.map(file => <button key={file.name} className={`file-row ${p.activeFile === file.name ? 'file-active' : ''}`} onClick={() => file.kind === 'file' && p.setActiveFile(file.name)} title={file.name}>{file.kind === 'folder' ? <><ChevronRight size={12}/><Folder size={14} className="folder-icon"/></> : <FileIcon name={file.name}/>}<span>{file.name}</span></button>)}</div>
        {!p.tree.length && <div className="explorer-empty"><Folder size={16}/><span>Loading project files…</span></div>}
        <div className="explorer-bottom"><div className="explorer-tip"><Sparkles size={14}/><span><b>Browser game workspace</b><br/>HTML, CSS, JavaScript and media assets only. No server shell.</span></div><button className="explorer-profile" onClick={() => p.setPage('profile')}><span className="profile-avatar profile-avatar-tiny">{p.user?.username[0]?.toUpperCase() ?? 'Y'}</span><span><b>{p.user?.username ?? 'Your profile'}</b><small>Creator account</small></span><MoreHorizontal size={16}/></button></div>
      </aside>
      {p.sidebarOpen && <div className="resize-handle" onMouseDown={e => startDrag('left', e)} role="separator" aria-label="Resize explorer"/>}

      <section className="editor-pane" style={{ width: `${p.sidebarOpen ? 100 - centerWidth : 100 - centerWidth}%` }}>
        <div className="editor-tabs"><button className="sidebar-toggle" onClick={() => p.setSidebarOpen(!p.sidebarOpen)} aria-label={p.sidebarOpen ? 'Hide explorer' : 'Show explorer'}><PanelLeft size={15}/></button>
          {p.tree.filter(f => f.kind === 'file').slice(0, 5).map(file => <button key={file.name} className={`editor-tab ${p.activeFile === file.name ? 'active-tab' : ''}`} onClick={() => p.setActiveFile(file.name)} title={file.name}><FileIcon name={file.name}/>{file.name}</button>)}
          <button className="tab-plus" title="New file" aria-label="New file" onClick={() => p.setModal('new-file')}><Plus size={14}/></button>
          <div className="editor-more-wrap"><button className="editor-more" aria-label="Editor tab actions" title="Editor tab actions" onClick={() => setFileMenuOpen(value => !value)}><MoreHorizontal size={15}/></button>{fileMenuOpen && <div className="editor-menu"><button onClick={() => { p.onReloadFiles(); setFileMenuOpen(false) }}>Refresh files</button><button onClick={() => { setFileMenuOpen(false); void formatDocument() }}>Format current file</button></div>}</div>
        </div>
        <div className="editor-breadcrumb"><span>{p.currentGame?.id ?? 'project'}</span><ChevronRight size={12}/><b><FileIcon name={p.activeFile}/>{p.activeFile || 'Choose a file'}</b><span className="breadcrumb-spacer"/><button className="mini-icon" title="Format current file" aria-label="Format current file" onClick={() => void formatDocument()}><Braces size={14}/></button></div>
        <div className="editor-body">{p.activeFile ? <Editor height="100%" language={p.language} theme="vs-dark" value={p.code[p.activeFile] ?? ''} onMount={editor => { editorRef.current = editor }} onChange={p.handleEditor} options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: 'DM Mono, monospace', lineNumbers: 'on', roundedSelection: false, scrollBeyondLastLine: false, automaticLayout: true, wordWrap: 'on', padding: { top: 16 }, cursorBlinking: 'smooth', smoothScrolling: true, renderLineHighlight: 'gutter', tabSize: 2 }} /> : <div className="editor-empty">Select a file from Explorer, or create a new browser asset.</div>}</div>
        <div className="editor-status"><span><Code2 size={12}/>{(p.language || 'text').toUpperCase()}</span><span>UTF-8</span><span>Spaces: 2</span><span className="status-spacer"/><span>Project-scoped</span><span>✦ Studio AI</span></div>
      </section>
      <div className="resize-handle center-handle" onMouseDown={e => startDrag('center', e)} role="separator" aria-label="Resize editor and preview"/>

      <section className="preview-pane"><div className="preview-toolbar"><div className="preview-title"><span className="live-dot"/><b>PREVIEW</b><span className="preview-label">LIVE</span></div><div className="preview-controls">
        <button className={`mini-icon ${device === 'desktop' ? 'selected-device' : ''}`} title="Desktop preview" aria-label="Desktop preview" onClick={() => setDevice('desktop')}><Monitor size={14}/></button>
        <button className={`mini-icon ${device === 'mobile' ? 'selected-device' : ''}`} title="Mobile preview" aria-label="Mobile preview" onClick={() => setDevice('mobile')}><Smartphone size={14}/></button><span className="toolbar-separator"/>
        <button className="mini-icon" title="Reload preview" aria-label="Reload preview" onClick={() => p.setPreviewKey(p.previewKey + 1)}><RefreshCw size={14}/></button>
        <button className="mini-icon" title="Open game in a new tab" aria-label="Open game in a new tab" onClick={() => p.previewUrl && window.open(p.previewUrl, '_blank', 'noopener,noreferrer')}><ArrowUpRight size={14}/></button>
        <button className="mini-icon" title="Fullscreen preview" aria-label="Fullscreen preview" onClick={() => previewWrapRef.current?.requestFullscreen().catch(() => p.notify('Fullscreen is not available in this browser'))}><Maximize2 size={14}/></button>
      </div></div>
        <div className="preview-address"><LockKeyhole size={11}/><span title={publicUrl || 'Private preview'}>{p.currentGame?.visibility === 'public' ? publicUrl : 'Private isolated preview'}</span><button onClick={p.shareLink} title="Copy public game link" aria-label="Copy public game link"><Copy size={12}/></button></div>
        <div className="preview-frame-wrap" ref={previewWrapRef}>{p.previewUrl ? <iframe key={p.previewKey} title="Isolated game preview" className={`game-iframe ${device === 'mobile' ? 'game-iframe-mobile' : ''}`} sandbox="allow-scripts" src={p.previewUrl} referrerPolicy="no-referrer" /> : <div className="preview-placeholder">Opening the isolated project preview…</div>}</div>
        <div className="preview-footer"><span><span className="live-dot"/> Auto-updating · {p.saveState}</span><button onClick={() => p.setPreviewKey(p.previewKey + 1)}><RefreshCw size={12}/> Reload preview</button></div>
      </section>
    </div>

    <div className={`terminal-pane ${p.terminalOpen ? '' : 'terminal-collapsed'}`}>
      <div className="terminal-head"><div className="terminal-tabs"><button className="terminal-title" onClick={() => p.setTerminalOpen(!p.terminalOpen)}><Terminal size={14}/><span>AI CONSOLE</span><ChevronDown size={12}/></button>
        <button className={`terminal-tab ${panelTab === 'chat' ? 'active-terminal-tab' : ''}`} onClick={() => { setPanelTab('chat'); p.setTerminalOpen(true) }}><MessageSquare size={13}/> Chat history</button>
        <button className={`terminal-tab ${panelTab === 'output' ? 'active-terminal-tab' : ''}`} onClick={() => { setPanelTab('output'); p.setTerminalOpen(true) }}>Output</button>
        <button className={`terminal-tab ${panelTab === 'problems' ? 'active-terminal-tab' : ''}`} onClick={() => { setPanelTab('problems'); p.setTerminalOpen(true) }}>Problems</button>
        <span className="terminal-session"><span className="save-dot"/> Project only · no OS shell</span></div>
        <div className="terminal-tools"><button className="mini-icon" title="Clear saved chat history" aria-label="Clear saved chat history" onClick={clearChat}><Trash2 size={14}/></button><button className="mini-icon" title="Collapse or expand panel" aria-label="Collapse or expand panel" onClick={() => p.setTerminalOpen(!p.terminalOpen)}><ArrowUpRight size={14}/></button></div>
      </div>
      {p.terminalOpen && <>
        {panelTab === 'chat' && <><div className="chat-area"><div className="assistant-intro"><div className="assistant-avatar"><Sparkles size={16}/></div><div><b>Hey{p.user ? `, ${p.user.username}` : ' there'}! Let’s make something.</b><p>I can read and edit this project’s HTML, CSS, JavaScript, and browser assets. Your messages and my replies are saved with this project.</p><div className="suggestion-chips"><button onClick={() => p.setChat('Make the star move with arrow keys')}>⌁ Add movement</button><button onClick={() => p.setChat('Add a score counter and a timer')}>✳ Add a score</button><button onClick={() => p.setChat('Make the background feel more dreamy')}>◌ Change the mood</button></div></div></div>{p.chatHistory.map((line, index) => <div className={line.startsWith('You:') ? 'chat-message user-message' : 'chat-message'} key={index}>{line.startsWith('You:') ? <><span className="message-tag">YOU</span>{line.slice(4)}</> : <><span className="message-tag ai-tag">AI</span>{line.slice(12)}</>}</div>)}</div>
          <div className="chat-composer"><div className="composer-context"><span className="context-lock"><LockKeyhole size={11}/></span><span>Working in <b>{p.currentGame?.title ?? 'project'}</b></span><span className="context-dot">·</span><select aria-label="Gemini model" value={p.selectedModel} onChange={e => p.setSelectedModel(e.target.value)}>{p.models.length ? p.models.map(model => <option key={model.id} value={model.id}>{model.display_name}</option>) : <option value="">Connect a Gemini key</option>}</select><button onClick={() => p.setModal('api-key')}>Key settings</button></div><div className="composer-input-row"><textarea value={p.chat} onChange={e => p.setChat(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); p.submitPrompt() } }} placeholder="Describe a change… Shift + Enter for a new line"/><button className="attach-button" title="Project files are already in context" aria-label="Project files are already in context" onClick={() => p.notify('This project’s files are already available to the AI; external files are not attached.')}><Plus size={16}/></button><button className="send-button" title="Send to AI" aria-label="Send to AI" disabled={!p.chat.trim() || !p.selectedModel} onClick={p.submitPrompt}><ArrowUpRight size={17}/></button></div><div className="composer-foot"><span><Sparkles size={12}/> AI can make mistakes. Review changes as you go.</span><span><kbd>↵</kbd> send</span></div></div></>}
        {panelTab === 'output' && <div className="console-output"><p><Check size={13}/> {p.saveState}</p><p>Live preview reloads after a successful file save.</p><p>No server build or shell command is run for browser games.</p></div>}
        {panelTab === 'problems' && <div className="console-output"><p><Check size={13}/> Project file access is scoped to this project.</p><p>Game runtime errors happen inside the isolated browser preview.</p><p>Open the game in a new tab and use that browser’s developer tools for runtime console details.</p></div>}
      </>}
    </div>
    {p.mobileNav && <button className="mobile-overlay" aria-label="Close menu" onClick={() => p.setMobileNav(false)}/>}
    <div className="ide-bottom-hint"><span>●</span> Project {p.currentGame?.visibility ?? 'private'} <button onClick={p.shareLink}>Copy game link</button></div>
  </div>
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase()
  const icon = ext === 'html' ? <FileCode2 size={13} className="file-html"/> : ext === 'css' ? <Braces size={13} className="file-css"/> : ['png','jpg','jpeg','webp','gif'].includes(ext ?? '') ? <FileImage size={13} className="file-image"/> : ext === 'json' ? <Braces size={13} className="file-json"/> : <Code2 size={13} className="file-js"/>
  return icon
}

