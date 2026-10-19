import { useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import Editor from '@monaco-editor/react'
import {
  ArrowUpRight, Braces, Check, ChevronDown, ChevronRight, CircleHelp,
  Code2, Copy, Eye, EyeOff, FileCode2, FileImage, FilePlus2, Files, Folder,
  Image as ImageIcon, LockKeyhole, Maximize2,
  Monitor, MoreHorizontal, PanelBottomClose, PanelLeft, Plus, RefreshCw,
  Rocket, Search, Settings2, Smartphone, Sparkles, Tablet, Terminal, Trash2, Upload, X
} from 'lucide-react'
import type { ChatMessage, FileEntry, Game, Page, User } from '../types'

type StudioProps = {
  user: User | null
  currentGame: Game | null
  activeFile: string
  openFiles: string[]
  code: Record<string, string>
  language: string
  tree: FileEntry[]
  sidebarOpen: boolean
  terminalOpen: boolean
  chat: string
  chatMessages: ChatMessage[]
  saveState: string
  previewKey: number
  mobileNav: boolean
  currentProjectId: string
  previewUrl: string
  newFileName: string
  modal: 'new-project' | 'api-key' | 'new-file' | 'game' | null
  models: Array<{ id: string; display_name: string }>
  selectedModel: string
  setPage: (p: Page) => void
  setModal: (m: 'new-project' | 'api-key' | 'new-file' | 'game' | null) => void
  setActiveFile: (s: string) => void
  setOpenFiles: React.Dispatch<React.SetStateAction<string[]>>
  setSidebarOpen: (v: boolean) => void
  setTerminalOpen: (v: boolean) => void
  setChat: (s: string) => void
  handleEditor: (s?: string) => void
  submitPrompt: () => void
  shareLink: () => void
  notify: (s: string) => void
  setPreviewKey: React.Dispatch<React.SetStateAction<number>>
  setMobileNav: (v: boolean) => void
  setTree: React.Dispatch<React.SetStateAction<FileEntry[]>>
  setNewFileName: (s: string) => void
  addFile: () => void
  deleteProjectFile: (path: string) => void
  toggleVisibility: () => void
  setSelectedModel: (s: string) => void
  uploadProjectAsset: (file: File) => void
  onClearChat: () => void
  onReloadFiles: () => void
}

type ActivityTab = 'explorer' | 'search' | 'assets'
type DeviceMode = 'desktop' | 'tablet' | 'mobile'

interface TerminalLogEntry {
  id: string
  type: 'input' | 'output' | 'error' | 'system'
  text: string
  time: string
}

export default function StudioPage(p: StudioProps) {
  // Activity bar tab: explorer, search, assets
  const [activityTab, setActivityTab] = useState<ActivityTab>('explorer')
  // Dedicated vertical AI Copilot panel on the right
  const [aiChatOpen, setAiChatOpen] = useState(true)
  // Collapsible live game preview
  const [previewOpen, setPreviewOpen] = useState(true)
  // Device mode for preview
  const [device, setDevice] = useState<DeviceMode>('desktop')
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  // Widths & Heights
  const [leftWidth, setLeftWidth] = useState(250)
  const [aiPanelWidth, setAiPanelWidth] = useState(360)
  const [previewWidth, setPreviewWidth] = useState(45) // percentage of editor area
  const [bottomHeight, setBottomHeight] = useState(200)
  const [dragging, setDragging] = useState(false)

  // 3-dots menus open states
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const [topMenuOpen, setTopMenuOpen] = useState(false)

  // Terminal interactive state
  const [termInput, setTermInput] = useState('')
  const [termHistory, setTermHistory] = useState<TerminalLogEntry[]>([
    {
      id: 'init-1',
      type: 'system',
      text: 'Yulya Studio Web Game Terminal [Sandboxed Client Runtime]',
      time: new Date().toLocaleTimeString()
    },
    {
      id: 'init-2',
      type: 'system',
      text: 'Type "help" for commands or evaluate JavaScript expressions.',
      time: new Date().toLocaleTimeString()
    }
  ])
  const [historyCmds, setHistoryCmds] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const termEndRef = useRef<HTMLDivElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<any>(null)
  const previewWrapRef = useRef<HTMLDivElement | null>(null)

  const title = p.currentGame?.title ?? 'Opening project'
  const publicUrl = p.currentGame && p.user ? `${window.location.origin}/${encodeURIComponent(p.user.username)}/${encodeURIComponent(p.currentGame.id)}` : ''

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (aiChatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [p.chatMessages, aiChatOpen])

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (p.terminalOpen) {
      termEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [termHistory, p.terminalOpen])

  // Drag resizers
  const startDrag = (kind: 'left' | 'ai' | 'preview' | 'bottom', e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    const move = (event: MouseEvent) => {
      if (kind === 'left') {
        setLeftWidth(Math.max(180, Math.min(420, event.clientX - 48)))
      } else if (kind === 'ai') {
        setAiPanelWidth(Math.max(260, Math.min(550, window.innerWidth - event.clientX)))
      } else if (kind === 'preview') {
        const editorAreaWidth = window.innerWidth - (p.sidebarOpen ? leftWidth + 48 : 48) - (aiChatOpen ? aiPanelWidth : 0)
        const pct = Math.max(25, Math.min(75, ((event.clientX - (p.sidebarOpen ? leftWidth + 48 : 48)) / editorAreaWidth) * 100))
        setPreviewWidth(100 - pct)
      } else if (kind === 'bottom') {
        setBottomHeight(Math.max(120, Math.min(window.innerHeight - 150, window.innerHeight - event.clientY)))
      }
    }
    const up = () => {
      setDragging(false)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // Format document action
  const formatDocument = async () => {
    const value = editorRef.current?.getValue() ?? ''
    if (p.activeFile.toLowerCase().endsWith('.json')) {
      try {
        p.handleEditor(JSON.stringify(JSON.parse(value), null, 2))
        p.notify('JSON formatted')
      } catch {
        p.notify('JSON syntax error: cannot format')
      }
      return
    }
    const formatter = editorRef.current?.getAction('editor.action.formatDocument')
    if (formatter) {
      try {
        await formatter.run()
        p.notify('Document formatted')
      } catch {
        p.notify('Formatting completed')
      }
    } else {
      p.notify('Formatting completed')
    }
  }

  // Interactive Terminal Command Execution
  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const raw = termInput.trim()
    if (!raw) return

    const time = new Date().toLocaleTimeString()
    const newLogs: TerminalLogEntry[] = [
      ...termHistory,
      { id: Date.now().toString(), type: 'input', text: `yulya-shell:~$ ${raw}`, time }
    ]

    setHistoryCmds(prev => [raw, ...prev])
    setHistoryIdx(-1)
    setTermInput('')

    const cmd = raw.toLowerCase()
    if (cmd === 'clear' || cmd === 'cls') {
      setTermHistory([])
      return
    }

    if (cmd === 'help') {
      newLogs.push({
        id: (Date.now() + 1).toString(),
        type: 'output',
        text: 'Commands:\n  help        Display help\n  clear       Clear screen\n  ls          List project files\n  status      Display project status\n  reload      Refresh game preview\n  <js code>   Evaluate any JavaScript expression',
        time
      })
    } else if (cmd === 'ls' || cmd === 'dir') {
      const fileList = p.tree.map(f => `  ${f.name} (${f.language || 'asset'})`).join('\n')
      newLogs.push({
        id: (Date.now() + 1).toString(),
        type: 'output',
        text: fileList ? `Project Files (${p.tree.length}):\n${fileList}` : 'No files in project.',
        time
      })
    } else if (cmd === 'status') {
      newLogs.push({
        id: (Date.now() + 1).toString(),
        type: 'output',
        text: `Project: ${p.currentGame?.title} (${p.currentGame?.id})\nVisibility: ${p.currentGame?.visibility}\nActive File: ${p.activeFile}`,
        time
      })
    } else if (cmd === 'reload') {
      p.setPreviewKey(k => k + 1)
      newLogs.push({
        id: (Date.now() + 1).toString(),
        type: 'output',
        text: 'Preview reloaded.',
        time
      })
    } else {
      try {
        // eslint-disable-next-line no-eval
        const result = window.eval(raw)
        let outStr = ''
        if (result === undefined) outStr = 'undefined'
        else if (typeof result === 'object') {
          try { outStr = JSON.stringify(result, null, 2) } catch { outStr = String(result) }
        } else {
          outStr = String(result)
        }
        newLogs.push({
          id: (Date.now() + 1).toString(),
          type: 'output',
          text: `➔ ${outStr}`,
          time
        })
      } catch (err: any) {
        newLogs.push({
          id: (Date.now() + 1).toString(),
          type: 'error',
          text: `Error: ${err?.message || String(err)}`,
          time
        })
      }
    }

    setTermHistory(newLogs)
  }

  // Search in files results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    const results: Array<{ file: string; line: number; text: string }> = []
    for (const [file, content] of Object.entries(p.code)) {
      const lines = content.split('\n')
      lines.forEach((lineText, idx) => {
        if (lineText.toLowerCase().includes(q)) {
          results.push({ file, line: idx + 1, text: lineText.trim() })
        }
      })
    }
    return results
  }, [searchQuery, p.code])

  // Media assets filter
  const assetFiles = useMemo(() => {
    return p.tree.filter(f => /\.(png|jpe?g|webp|gif|mp3|wav|ogg|mp4|webm|woff2?)$/i.test(f.name))
  }, [p.tree])

  // Open a file into editor tabs
  const openFileTab = (fileName: string) => {
    p.setActiveFile(fileName)
    p.setOpenFiles(prev => (prev.includes(fileName) ? prev : [...prev, fileName]))
  }

  // Close an editor tab
  const closeFileTab = (e: React.MouseEvent, fileName: string) => {
    e.stopPropagation()
    p.setOpenFiles(prev => {
      const next = prev.filter(f => f !== fileName)
      if (p.activeFile === fileName) {
        const idx = prev.indexOf(fileName)
        const nextActive = next[Math.max(0, idx - 1)] || next[0] || ''
        p.setActiveFile(nextActive)
      }
      return next
    })
  }

  return (
    <div className={`vscode-ide ${dragging ? 'is-resizing' : ''}`}>
      {/* Top Navbar */}
      <header className="vsc-topbar">
        <div className="vsc-brand-group">
          <button className="vsc-brand" onClick={() => p.setPage('home')} title="Yulya Studio Home">
            <span className="brand-mark">✳</span>
            <span className="brand-title">yulya</span>
            <span className="brand-sub">studio</span>
          </button>
          <div className="vsc-breadcrumb">
            <button className="vsc-crumb-btn" onClick={() => p.setPage('profile')}>My Games</button>
            <ChevronRight size={13} className="crumb-arrow" />
            <span className="crumb-project">{title.toLowerCase().replace(/\s/g, '-')}</span>
          </div>
        </div>

        <div className="vsc-top-actions">
          {/* Toggle Live Game Preview */}
          <button
            className={`vsc-action-btn ${previewOpen ? 'active' : ''}`}
            title={previewOpen ? 'Hide Game Preview' : 'Show Game Preview'}
            onClick={() => setPreviewOpen(!previewOpen)}
          >
            {previewOpen ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>Preview</span>
          </button>

          {/* Toggle Vertical Copilot Chat Panel */}
          <button
            className={`vsc-action-btn ${aiChatOpen ? 'active' : ''}`}
            title={aiChatOpen ? 'Hide AI Copilot' : 'Show AI Copilot'}
            onClick={() => setAiChatOpen(!aiChatOpen)}
          >
            <Sparkles size={14} />
            <span>Copilot</span>
          </button>

          {/* Publish / Private Button */}
          <button
            className={`vsc-btn ${p.currentGame?.visibility === 'public' ? 'vsc-btn-secondary' : 'vsc-btn-primary'}`}
            onClick={p.toggleVisibility}
            title={p.currentGame?.visibility === 'public' ? 'Make game private' : 'Publish game to arcade'}
          >
            <Rocket size={13} />
            <span>{p.currentGame?.visibility === 'public' ? 'Private' : 'Publish'}</span>
          </button>

          {/* 3-dots top menu */}
          <div className="vsc-menu-container">
            <button
              className="vsc-action-btn icon-only"
              title="More actions"
              onClick={() => setTopMenuOpen(!topMenuOpen)}
            >
              <MoreHorizontal size={15} />
            </button>
            {topMenuOpen && (
              <div className="vsc-dropdown-menu">
                <button onClick={() => { p.shareLink(); setTopMenuOpen(false) }}>
                  <Copy size={13} />
                  <span>Copy Game Link</span>
                </button>
                <button onClick={() => { p.setModal('api-key'); setTopMenuOpen(false) }}>
                  <Settings2 size={13} />
                  <span>Configure Gemini API Key</span>
                </button>
                <button onClick={() => { void formatDocument(); setTopMenuOpen(false) }}>
                  <Braces size={13} />
                  <span>Format Active File</span>
                </button>
                <button onClick={() => { p.onReloadFiles(); setTopMenuOpen(false) }}>
                  <RefreshCw size={13} />
                  <span>Reload Project Files</span>
                </button>
                <button onClick={() => { p.notify('Shortcuts: Ctrl/Cmd+S saves; Enter sends to AI; Shift+Enter adds line.'); setTopMenuOpen(false) }}>
                  <CircleHelp size={13} />
                  <span>Editor Help & Shortcuts</span>
                </button>
              </div>
            )}
          </div>

          {/* Profile Avatar */}
          <button
            className="vsc-profile-badge"
            onClick={() => p.setPage('profile')}
            title={`Logged in as ${p.user?.username || 'Creator'}`}
          >
            {p.user?.username?.[0]?.toUpperCase() ?? 'Y'}
          </button>
        </div>
      </header>

      {/* Main Studio Workspace */}
      <div className="vsc-body">
        {/* VS Code Left Activity Bar */}
        <aside className="vsc-activity-bar">
          <div className="activity-top">
            <button
              className={`activity-icon-btn ${activityTab === 'explorer' && p.sidebarOpen ? 'active' : ''}`}
              title="Explorer (Files)"
              onClick={() => {
                if (activityTab === 'explorer' && p.sidebarOpen) p.setSidebarOpen(false)
                else { setActivityTab('explorer'); p.setSidebarOpen(true) }
              }}
            >
              <Files size={19} />
            </button>
            <button
              className={`activity-icon-btn ${activityTab === 'search' && p.sidebarOpen ? 'active' : ''}`}
              title="Search in Files"
              onClick={() => {
                if (activityTab === 'search' && p.sidebarOpen) p.setSidebarOpen(false)
                else { setActivityTab('search'); p.setSidebarOpen(true) }
              }}
            >
              <Search size={19} />
            </button>
            <button
              className={`activity-icon-btn ${activityTab === 'assets' && p.sidebarOpen ? 'active' : ''}`}
              title="Game Assets (Images, Sounds, Fonts)"
              onClick={() => {
                if (activityTab === 'assets' && p.sidebarOpen) p.setSidebarOpen(false)
                else { setActivityTab('assets'); p.setSidebarOpen(true) }
              }}
            >
              <ImageIcon size={19} />
            </button>
            <button
              className={`activity-icon-btn ${aiChatOpen ? 'active' : ''}`}
              title="Copilot Chat"
              onClick={() => setAiChatOpen(!aiChatOpen)}
            >
              <Sparkles size={19} />
            </button>
            <button
              className={`activity-icon-btn ${p.terminalOpen ? 'active' : ''}`}
              title="Terminal Console"
              onClick={() => p.setTerminalOpen(!p.terminalOpen)}
            >
              <Terminal size={19} />
            </button>
          </div>

          <div className="activity-bottom">
            <button
              className="activity-icon-btn"
              title="Gemini API Key Settings"
              onClick={() => p.setModal('api-key')}
            >
              <Settings2 size={18} />
            </button>
            <button
              className="activity-avatar-btn"
              title="Profile"
              onClick={() => p.setPage('profile')}
            >
              {p.user?.username?.[0]?.toUpperCase() ?? 'Y'}
            </button>
          </div>
        </aside>

        {/* VS Code Left Sidebar (Explorer, Search, Assets) */}
        {p.sidebarOpen && (
          <aside className="vsc-sidebar" style={{ width: leftWidth }}>
            {activityTab === 'explorer' && (
              <div className="sidebar-view">
                <div className="sidebar-header">
                  <span className="sidebar-title">EXPLORER</span>
                  <div className="sidebar-tools">
                    <button
                      className="vsc-tool-btn"
                      title="New File"
                      onClick={() => p.setModal('new-file')}
                    >
                      <FilePlus2 size={14} />
                    </button>
                    <button
                      className="vsc-tool-btn"
                      title="Upload Game Asset (PNG, JPG, Audio, Fonts)"
                      onClick={() => document.getElementById('vsc-asset-file-input')?.click()}
                    >
                      <Upload size={14} />
                    </button>
                    <input
                      id="vsc-asset-file-input"
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.ogg,.mp4,.webm,.woff,.woff2"
                      hidden
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) p.uploadProjectAsset(file)
                        e.currentTarget.value = ''
                      }}
                    />
                    <button
                      className="vsc-tool-btn"
                      title="Refresh Project Files"
                      onClick={p.onReloadFiles}
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>
                </div>

                <div className="vsc-project-header">
                  <ChevronDown size={14} />
                  <Folder size={14} className="folder-icon" />
                  <span className="project-name-label">
                    {p.currentGame?.id?.toUpperCase() ?? 'PROJECT'}
                  </span>
                </div>

                <div className="vsc-file-tree">
                  {p.tree.map(file => (
                    <div
                      key={file.name}
                      className={`vsc-tree-row ${p.activeFile === file.name ? 'active' : ''}`}
                      onClick={() => file.kind === 'file' && openFileTab(file.name)}
                      title={file.name}
                    >
                      <span className="tree-file-icon"><FileIcon name={file.name} /></span>
                      <span className="tree-file-name">{file.name}</span>
                      {file.name !== 'index.html' && (
                        <button
                          className="tree-row-delete"
                          title={`Delete ${file.name}`}
                          onClick={e => {
                            e.stopPropagation()
                            if (window.confirm(`Delete ${file.name}?`)) {
                              p.deleteProjectFile(file.name)
                            }
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {!p.tree.length && (
                    <div className="vsc-empty-tree">
                      <Folder size={16} />
                      <span>Loading project files…</span>
                    </div>
                  )}
                </div>

                <div className="vsc-sidebar-footer">
                  <div className="vsc-tip-card">
                    <Sparkles size={14} />
                    <div>
                      <b>Web Game Workspace</b>
                      <p>Client-side HTML5/CSS/JS game assets only. No server shell.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activityTab === 'search' && (
              <div className="sidebar-view">
                <div className="sidebar-header">
                  <span className="sidebar-title">SEARCH IN FILES</span>
                </div>
                <div className="vsc-search-box">
                  <Search size={14} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search in project…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {searchQuery && (
                    <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="vsc-search-results">
                  {searchResults.map((res, i) => (
                    <div
                      key={i}
                      className="search-result-item"
                      onClick={() => openFileTab(res.file)}
                    >
                      <div className="result-file">
                        <FileIcon name={res.file} />
                        <span>{res.file}:{res.line}</span>
                      </div>
                      <div className="result-snippet">{res.text}</div>
                    </div>
                  ))}
                  {searchQuery && !searchResults.length && (
                    <div className="no-results">No matching text found.</div>
                  )}
                  {!searchQuery && (
                    <div className="search-prompt">Type any word or code snippet to search across all project files.</div>
                  )}
                </div>
              </div>
            )}

            {activityTab === 'assets' && (
              <div className="sidebar-view">
                <div className="sidebar-header">
                  <span className="sidebar-title">GAME ASSETS</span>
                  <button
                    className="vsc-tool-btn"
                    title="Upload Media Asset"
                    onClick={() => document.getElementById('vsc-asset-file-input-2')?.click()}
                  >
                    <Upload size={14} />
                  </button>
                  <input
                    id="vsc-asset-file-input-2"
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.ogg,.mp4,.webm,.woff,.woff2"
                    hidden
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) p.uploadProjectAsset(file)
                      e.currentTarget.value = ''
                    }}
                  />
                </div>
                <p className="assets-help-text">
                  Upload images, sound FX, music, or web fonts. Assets stay inside this game project.
                </p>
                <div className="vsc-assets-list">
                  {assetFiles.map(asset => (
                    <div key={asset.name} className="vsc-asset-card">
                      <div className="asset-icon-preview">
                        <FileIcon name={asset.name} />
                      </div>
                      <div className="asset-meta">
                        <span className="asset-name" title={asset.name}>{asset.name}</span>
                        <span className="asset-type">{asset.name.split('.').pop()?.toUpperCase()} Asset</span>
                      </div>
                      <div className="asset-actions">
                        <button
                          className="vsc-tool-btn"
                          title="Copy Asset Path"
                          onClick={() => {
                            navigator.clipboard?.writeText(asset.name)
                            p.notify(`Copied "${asset.name}"`)
                          }}
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          className="vsc-tool-btn"
                          title="Delete Asset"
                          onClick={() => {
                            if (window.confirm(`Delete ${asset.name}?`)) {
                              p.deleteProjectFile(asset.name)
                            }
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!assetFiles.length && (
                    <div className="vsc-empty-tree">
                      <ImageIcon size={20} />
                      <span>No media assets yet. Click upload to add images or sounds.</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Resizer between Sidebar & Editor */}
        {p.sidebarOpen && (
          <div
            className="vsc-resizer-v"
            onMouseDown={e => startDrag('left', e)}
            role="separator"
            aria-label="Resize Sidebar"
          />
        )}

        {/* Editor + Live Preview Container */}
        <div className="vsc-center-workspace">
          {/* Editor Column */}
          <section
            className="vsc-editor-column"
            style={{ width: previewOpen ? `${100 - previewWidth}%` : '100%' }}
          >
            {/* Tabs Bar */}
            <div className="vsc-tabs-bar">
              <button
                className="vsc-sidebar-toggle"
                onClick={() => p.setSidebarOpen(!p.sidebarOpen)}
                title={p.sidebarOpen ? 'Hide Explorer' : 'Show Explorer'}
              >
                <PanelLeft size={15} />
              </button>

              <div className="vsc-tabs-scroll">
                {p.openFiles.map(fileName => (
                  <div
                    key={fileName}
                    className={`vsc-tab ${p.activeFile === fileName ? 'active-tab' : ''}`}
                    onClick={() => p.setActiveFile(fileName)}
                    title={fileName}
                  >
                    <FileIcon name={fileName} />
                    <span className="tab-label">{fileName}</span>
                    <button
                      className="tab-close-btn"
                      title="Close Tab"
                      onClick={e => closeFileTab(e, fileName)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  className="vsc-tab-plus"
                  title="Create New File"
                  onClick={() => p.setModal('new-file')}
                >
                  <Plus size={13} />
                </button>
              </div>

              <div className="vsc-tab-actions">
                <button
                  className="vsc-tool-btn"
                  title="Format Document (Shift+Alt+F)"
                  onClick={() => void formatDocument()}
                >
                  <Braces size={14} />
                </button>
                <button
                  className={`vsc-tool-btn ${previewOpen ? 'active-tool' : ''}`}
                  title={previewOpen ? 'Collapse Preview' : 'Expand Preview'}
                  onClick={() => setPreviewOpen(!previewOpen)}
                >
                  {previewOpen ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  className={`vsc-tool-btn ${aiChatOpen ? 'active-tool' : ''}`}
                  title={aiChatOpen ? 'Close Copilot Chat' : 'Open Copilot Chat'}
                  onClick={() => setAiChatOpen(!aiChatOpen)}
                >
                  <Sparkles size={14} />
                </button>
              </div>
            </div>

            {/* Breadcrumbs Bar */}
            <div className="vsc-breadcrumb-bar">
              <span>{p.currentGame?.id ?? 'project'}</span>
              <ChevronRight size={12} />
              <b>
                <FileIcon name={p.activeFile} />
                <span>{p.activeFile || 'Select a file'}</span>
              </b>
              <span className="vsc-spacer" />
              <span className="lang-tag">{(p.language || 'text').toUpperCase()}</span>
            </div>

            {/* Monaco Editor Canvas */}
            <div className="vsc-monaco-wrapper">
              {p.activeFile ? (
                <Editor
                  height="100%"
                  language={p.language}
                  theme="vs-dark"
                  value={p.code[p.activeFile] ?? ''}
                  onMount={editor => { editorRef.current = editor }}
                  onChange={p.handleEditor}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: "'DM Mono', 'Consolas', 'Courier New', monospace",
                    lineNumbers: 'on',
                    roundedSelection: false,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    wordWrap: 'on',
                    padding: { top: 12, bottom: 12 },
                    cursorBlinking: 'smooth',
                    smoothScrolling: true,
                    renderLineHighlight: 'all',
                    tabSize: 2
                  }}
                />
              ) : (
                <div className="vsc-editor-empty">
                  <Code2 size={24} />
                  <p>Select a file from the explorer on the left or create a new file.</p>
                </div>
              )}
            </div>

            {/* Interactive Bottom Terminal Drawer (collapsible) */}
            {p.terminalOpen && (
              <>
                <div
                  className="vsc-resizer-h"
                  onMouseDown={e => startDrag('bottom', e)}
                  role="separator"
                  aria-label="Resize Terminal"
                />
                <div className="vsc-terminal-drawer" style={{ height: bottomHeight }}>
                  <div className="drawer-header">
                    <div className="drawer-title">
                      <Terminal size={13} />
                      <span>TERMINAL CONSOLE</span>
                    </div>
                    <div className="drawer-tools">
                      <button
                        className="vsc-tool-btn"
                        title="Clear Terminal Output"
                        onClick={() => setTermHistory([])}
                      >
                        <Trash2 size={13} />
                      </button>
                      <button
                        className="vsc-tool-btn"
                        title="Close Terminal"
                        onClick={() => p.setTerminalOpen(false)}
                      >
                        <PanelBottomClose size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="terminal-view">
                    <div className="terminal-log-flow">
                      {termHistory.map(entry => (
                        <div key={entry.id} className={`term-line term-${entry.type}`}>
                          <pre>{entry.text}</pre>
                        </div>
                      ))}
                      <div ref={termEndRef} />
                    </div>
                    <form className="terminal-prompt-row" onSubmit={handleTerminalSubmit}>
                      <span className="term-prompt-label">yulya-shell:~$</span>
                      <input
                        type="text"
                        value={termInput}
                        onChange={e => setTermInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'ArrowUp') {
                            e.preventDefault()
                            if (historyCmds.length > 0) {
                              const nextIdx = Math.min(historyCmds.length - 1, historyIdx + 1)
                              setHistoryIdx(nextIdx)
                              setTermInput(historyCmds[nextIdx])
                            }
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault()
                            if (historyIdx > 0) {
                              const nextIdx = historyIdx - 1
                              setHistoryIdx(nextIdx)
                              setTermInput(historyCmds[nextIdx])
                            } else if (historyIdx === 0) {
                              setHistoryIdx(-1)
                              setTermInput('')
                            }
                          }
                        }}
                        placeholder="Type JavaScript or 'help'…"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </form>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Resizer between Editor & Live Preview */}
          {previewOpen && (
            <div
              className="vsc-resizer-v center-resizer"
              onMouseDown={e => startDrag('preview', e)}
              role="separator"
              aria-label="Resize Preview"
            />
          )}

          {/* Collapsible Live Game Preview Pane */}
          {previewOpen && (
            <section className="vsc-preview-column" style={{ width: `${previewWidth}%` }}>
              <div className="vsc-preview-header">
                <div className="preview-label-group">
                  <span className="status-dot saved live-pulse" />
                  <b className="preview-heading">GAME PREVIEW</b>
                </div>

                <div className="vsc-device-controls">
                  <button
                    className={`device-btn ${device === 'desktop' ? 'active' : ''}`}
                    title="Desktop View (100%)"
                    onClick={() => setDevice('desktop')}
                  >
                    <Monitor size={14} />
                  </button>
                  <button
                    className={`device-btn ${device === 'tablet' ? 'active' : ''}`}
                    title="Tablet View (768px)"
                    onClick={() => setDevice('tablet')}
                  >
                    <Tablet size={14} />
                  </button>
                  <button
                    className={`device-btn ${device === 'mobile' ? 'active' : ''}`}
                    title="Mobile View (390px)"
                    onClick={() => setDevice('mobile')}
                  >
                    <Smartphone size={14} />
                  </button>
                  <span className="vsc-header-sep" />
                  <button
                    className="device-btn"
                    title="Reload Preview"
                    onClick={() => p.setPreviewKey(k => k + 1)}
                  >
                    <RefreshCw size={13} />
                  </button>
                  <button
                    className="device-btn"
                    title="Open in New Tab"
                    onClick={() => p.previewUrl && window.open(p.previewUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <ArrowUpRight size={13} />
                  </button>
                  <button
                    className="device-btn"
                    title="Fullscreen"
                    onClick={() => previewWrapRef.current?.requestFullscreen().catch(() => p.notify('Fullscreen not supported'))}
                  >
                    <Maximize2 size={13} />
                  </button>
                  <button
                    className="device-btn collapse-btn"
                    title="Collapse Preview Panel"
                    onClick={() => setPreviewOpen(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="vsc-address-bar">
                <LockKeyhole size={11} className="lock-icon" />
                <span className="address-text" title={publicUrl || 'Private preview'}>
                  {p.currentGame?.visibility === 'public' ? publicUrl : 'Private Isolated Preview'}
                </span>
                <button
                  className="copy-url-btn"
                  onClick={p.shareLink}
                  title="Copy Game Link"
                >
                  <Copy size={12} />
                </button>
              </div>

              <div className="vsc-preview-stage" ref={previewWrapRef}>
                <div className={`preview-viewport-container device-${device}`}>
                  {device === 'mobile' && <div className="phone-notch"><span className="phone-speaker" /></div>}
                  {p.previewUrl ? (
                    <iframe
                      key={p.previewKey}
                      title="Isolated game preview"
                      className="vsc-game-iframe"
                      sandbox="allow-scripts"
                      src={p.previewUrl}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="preview-loading-box">
                      <span className="loading-spinner" />
                      <p>Opening preview…</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Resizer between Editor Area & Dedicated Vertical AI Copilot Panel */}
        {aiChatOpen && (
          <div
            className="vsc-resizer-v"
            onMouseDown={e => startDrag('ai', e)}
            role="separator"
            aria-label="Resize Copilot Panel"
          />
        )}

        {/* Dedicated Vertical Copilot Chat Panel (Right Side - VS Code Style) */}
        {aiChatOpen && (
          <aside className="vsc-copilot-vertical-panel" style={{ width: aiPanelWidth }}>
            <div className="copilot-panel-header">
              <div className="copilot-title-group">
                <Sparkles size={15} className="copilot-icon" />
                <span className="copilot-title">COPILOT CHAT</span>
                <span className="copilot-model-badge">
                  {p.selectedModel ? p.selectedModel.replace('models/', '') : 'Gemini'}
                </span>
              </div>

              <div className="copilot-header-actions">
                {/* 3-dots menu */}
                <div className="vsc-menu-container">
                  <button
                    className="vsc-tool-btn"
                    title="Copilot Options"
                    onClick={() => setAiMenuOpen(!aiMenuOpen)}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  {aiMenuOpen && (
                    <div className="vsc-dropdown-menu right-aligned">
                      <button onClick={() => { p.setModal('api-key'); setAiMenuOpen(false) }}>
                        <Settings2 size={13} />
                        <span>Configure API Key</span>
                      </button>
                      <button onClick={() => {
                        setAiMenuOpen(false)
                        if (window.confirm('Clear saved AI chat for this project?')) {
                          p.onClearChat()
                        }
                      }}>
                        <Trash2 size={13} />
                        <span>Clear Chat History</span>
                      </button>
                      <button onClick={() => { p.onReloadFiles(); setAiMenuOpen(false) }}>
                        <RefreshCw size={13} />
                        <span>Rescan Project Files</span>
                      </button>
                    </div>
                  )}
                </div>

                <button
                  className="vsc-tool-btn"
                  title="Close Copilot Panel"
                  onClick={() => setAiChatOpen(false)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Chat Message Scroll */}
            <div className="copilot-chat-scroll">
              <div className="copilot-intro-card">
                <div className="intro-icon-wrap">
                  <Sparkles size={16} />
                </div>
                <div className="intro-text">
                  <b>VS Code Game Copilot</b>
                  <p>
                    I have full context of this game project's code. Describe changes, gameplay mechanics, controls, or styling.
                  </p>
                  <div className="copilot-chips">
                    <button onClick={() => p.setChat('Add mobile touch joystick and tap controls')}>
                      ⌁ Touch Controls
                    </button>
                    <button onClick={() => p.setChat('Add a particle explosion effect when scoring')}>
                      ✳ Particle Effects
                    </button>
                    <button onClick={() => p.setChat('Add synthesized retro sound effects with Web Audio')}>
                      ♫ Web Audio SFX
                    </button>
                    <button onClick={() => p.setChat('Make the game progressively harder every 20 seconds')}>
                      ⚡ Difficulty Ramp
                    </button>
                  </div>
                </div>
              </div>

              {p.chatMessages.map(msg => (
                <div key={msg.id} className={`copilot-bubble ${msg.role === 'user' ? 'user-msg' : 'ai-msg'}`}>
                  <div className="bubble-top">
                    <span className="bubble-avatar-tag">
                      {msg.role === 'user' ? (p.user?.username?.[0]?.toUpperCase() ?? 'U') : <Sparkles size={12} />}
                    </span>
                    <span className="bubble-name">{msg.role === 'user' ? (p.user?.username ?? 'You') : 'Copilot'}</span>
                    {msg.time && (
                      <span className="bubble-timestamp">
                        {new Date(msg.time * 1000 > 1e12 ? msg.time : msg.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div className="bubble-body">
                    <pre>{msg.text}</pre>
                  </div>
                  {msg.tools && msg.tools.length > 0 && (
                    <div className="bubble-tool-pills">
                      {msg.tools.map((toolPath, idx) => (
                        <span key={idx} className="tool-pill"><Check size={10} /> Edited {toolPath}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Copilot Chat Composer */}
            <div className="copilot-composer">
              <div className="composer-toolbar">
                <span className="composer-context">
                  <LockKeyhole size={10} /> {p.currentGame?.id ?? 'project'}
                </span>
                <select
                  className="composer-model-dropdown"
                  value={p.selectedModel}
                  onChange={e => {
                    if (e.target.value === 'connect-key') {
                      p.setModal('api-key')
                    } else {
                      p.setSelectedModel(e.target.value)
                    }
                  }}
                  onClick={() => {
                    if (!p.models.length) {
                      p.setModal('api-key')
                    }
                  }}
                  aria-label="Gemini Model"
                >
                  {p.models.length ? (
                    p.models.map(m => (
                      <option key={m.id} value={m.id}>{m.display_name}</option>
                    ))
                  ) : (
                    <option value="connect-key">⚙ Connect Gemini Key</option>
                  )}
                </select>
              </div>

              <div className="composer-input-container">
                <textarea
                  value={p.chat}
                  onChange={e => p.setChat(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      p.submitPrompt()
                    }
                  }}
                  placeholder="Ask Copilot or describe changes… (Enter to send, Shift+Enter for newline)"
                  rows={2}
                />
                <button
                  className="copilot-send-btn"
                  disabled={!p.chat.trim() || !p.selectedModel}
                  onClick={p.submitPrompt}
                  title="Send message (Enter)"
                >
                  <ArrowUpRight size={15} />
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'html') return <FileCode2 size={14} className="icon-html" />
  if (ext === 'css') return <Braces size={14} className="icon-css" />
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext ?? '')) return <FileImage size={14} className="icon-image" />
  if (['mp3', 'wav', 'ogg'].includes(ext ?? '')) return <Sparkles size={14} className="icon-audio" />
  if (ext === 'json') return <Braces size={14} className="icon-json" />
  return <Code2 size={14} className="icon-js" />
}
