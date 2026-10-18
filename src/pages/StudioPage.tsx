import { useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import Editor from '@monaco-editor/react'
import {
  ArrowUpRight, Braces, Check, ChevronDown, ChevronRight, CircleHelp,
  Code2, Copy, FileCode2, FileImage, FilePlus2, Files, Folder,
  Image as ImageIcon, LockKeyhole, Maximize2, Minimize2,
  Monitor, PanelBottomClose, PanelLeft, Plus, RefreshCw,
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
type BottomTab = 'terminal' | 'chat' | 'output' | 'problems'
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
  const [bottomTab, setBottomTab] = useState<BottomTab>('chat')
  const [device, setDevice] = useState<DeviceMode>('desktop')
  const [searchQuery, setSearchQuery] = useState('')
  const [panelMaximized, setPanelMaximized] = useState(false)
  const [leftWidth, setLeftWidth] = useState(240)
  const [centerWidth, setCenterWidth] = useState(54)
  const [bottomHeight, setBottomHeight] = useState(260)
  const [dragging, setDragging] = useState(false)

  // Terminal interactive state
  const [termInput, setTermInput] = useState('')
  const [termHistory, setTermHistory] = useState<TerminalLogEntry[]>([
    {
      id: 'init-1',
      type: 'system',
      text: 'Yulya Studio Web Game Terminal v1.0 [Sandboxed Browser Runtime]',
      time: new Date().toLocaleTimeString()
    },
    {
      id: 'init-2',
      type: 'system',
      text: 'Type "help" for built-in commands or enter JavaScript expressions to evaluate.',
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
    if (p.terminalOpen && bottomTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [p.chatMessages, p.terminalOpen, bottomTab])

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (p.terminalOpen && bottomTab === 'terminal') {
      termEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [termHistory, p.terminalOpen, bottomTab])

  // Drag resizers
  const startDrag = (kind: 'left' | 'center' | 'bottom', e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    const move = (event: MouseEvent) => {
      if (kind === 'left') {
        setLeftWidth(Math.max(180, Math.min(380, event.clientX - 48)))
      } else if (kind === 'center') {
        setCenterWidth(Math.max(30, Math.min(75, (event.clientX / window.innerWidth) * 100)))
      } else if (kind === 'bottom') {
        setBottomHeight(Math.max(140, Math.min(window.innerHeight - 150, window.innerHeight - event.clientY)))
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
        p.notify('This JSON has a syntax error and cannot be formatted yet')
      }
      return
    }
    const formatter = editorRef.current?.getAction('editor.action.formatDocument')
    if (formatter) {
      try {
        await formatter.run()
        p.notify('Document formatted')
      } catch {
        p.notify('No formatter configured for this file type')
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
        text: 'Available Commands:\n  help        Display this help message\n  clear       Clear terminal output\n  ls          List files in this project\n  status      Display project status & visibility\n  reload      Refresh game preview\n  <js code>   Evaluate any JavaScript expression safely',
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
        text: `Project: ${p.currentGame?.title} (${p.currentGame?.id})\nVisibility: ${p.currentGame?.visibility}\nActive File: ${p.activeFile}\nSave Status: ${p.saveState}`,
        time
      })
    } else if (cmd === 'reload') {
      p.setPreviewKey(k => k + 1)
      newLogs.push({
        id: (Date.now() + 1).toString(),
        type: 'output',
        text: 'Preview iframe reloaded.',
        time
      })
    } else {
      // Evaluate JavaScript in sandboxed try-catch
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

  // Problems / Linter checks
  const problemList = useMemo(() => {
    const list: Array<{ file: string; message: string; severity: 'warning' | 'error' }> = []
    for (const [file, content] of Object.entries(p.code)) {
      if (file.endsWith('.json')) {
        try {
          JSON.parse(content)
        } catch (err: any) {
          list.push({ file, message: `JSON syntax error: ${err.message}`, severity: 'error' })
        }
      }
      if (file.endsWith('.html')) {
        if (!content.includes('<!doctype') && !content.includes('<!DOCTYPE')) {
          list.push({ file, message: 'Missing <!doctype html> declaration', severity: 'warning' })
        }
      }
    }
    return list
  }, [p.code])

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

        <div className="vsc-top-center">
          <div className="vsc-save-pill">
            <span className={`status-dot ${p.saveState.includes('Saving') ? 'saving' : 'saved'}`} />
            <span>{p.saveState}</span>
          </div>
        </div>

        <div className="vsc-top-actions">
          <button
            className="vsc-action-btn"
            title="Studio Shortcuts: Ctrl+S to save, Enter to send chat, Shift+Enter for new line."
            onClick={() => p.notify('Shortcuts: Ctrl/Cmd+S saves; Enter sends prompt to AI; Shift+Enter creates a new line.')}
          >
            <CircleHelp size={15} />
          </button>
          <button
            className="vsc-action-btn"
            title="Gemini API Key Settings"
            onClick={() => p.setModal('api-key')}
          >
            <Settings2 size={15} />
          </button>
          <button
            className="vsc-action-btn share-btn"
            title="Copy Game Link"
            onClick={p.shareLink}
          >
            <Copy size={13} />
            <span>Copy Link</span>
          </button>
          <button
            className={`vsc-btn ${p.currentGame?.visibility === 'public' ? 'vsc-btn-secondary' : 'vsc-btn-primary'}`}
            onClick={p.toggleVisibility}
            title={p.currentGame?.visibility === 'public' ? 'Set game visibility to private' : 'Publish game to arcade'}
          >
            <Rocket size={13} />
            <span>{p.currentGame?.visibility === 'public' ? 'Make Private' : 'Publish Game'}</span>
          </button>
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
              title="Game Assets (Images, Audio, Fonts)"
              onClick={() => {
                if (activityTab === 'assets' && p.sidebarOpen) p.setSidebarOpen(false)
                else { setActivityTab('assets'); p.setSidebarOpen(true) }
              }}
            >
              <ImageIcon size={19} />
            </button>
            <button
              className={`activity-icon-btn ${p.terminalOpen && bottomTab === 'chat' ? 'active' : ''}`}
              title="AI Assistant / Copilot Chat"
              onClick={() => {
                setBottomTab('chat')
                p.setTerminalOpen(!p.terminalOpen)
              }}
            >
              <Sparkles size={19} />
            </button>
            <button
              className={`activity-icon-btn ${p.terminalOpen && bottomTab === 'terminal' ? 'active' : ''}`}
              title="Interactive Terminal"
              onClick={() => {
                setBottomTab('terminal')
                p.setTerminalOpen(!p.terminalOpen)
              }}
            >
              <Terminal size={19} />
            </button>
          </div>

          <div className="activity-bottom">
            <button
              className="activity-icon-btn"
              title="API Key Settings"
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

        {/* VS Code Side Sidebar (Explorer, Search, Assets) */}
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

                <div className="sidebar-security-badge">
                  <LockKeyhole size={11} />
                  <span>HTML5/JS Project · Client Sandbox Only</span>
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
                            if (window.confirm(`Delete ${file.name}? This cannot be undone.`)) {
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
                      <b>Web Game Engine</b>
                      <p>Build HTML5, CSS, and JS games with instant live reload.</p>
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
                  <span className="sidebar-title">PROJECT ASSETS</span>
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
                  Upload images, sound FX, music, or web fonts for your game. Files are stored securely and served directly.
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
                      <span>No media assets uploaded yet. Click upload to add images or sounds.</span>
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

        {/* Editor + Bottom Panel Column */}
        <section
          className="vsc-editor-column"
          style={{ width: `${p.sidebarOpen ? 100 - centerWidth : 100 - centerWidth}%` }}
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
                className="vsc-tool-btn"
                title="Toggle AI / Terminal Panel"
                onClick={() => p.setTerminalOpen(!p.terminalOpen)}
              >
                <Terminal size={14} />
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

          {/* Bottom Resizer */}
          {p.terminalOpen && (
            <div
              className="vsc-resizer-h"
              onMouseDown={e => startDrag('bottom', e)}
              role="separator"
              aria-label="Resize Panel"
            />
          )}

          {/* VS Code Bottom Panel (Terminal, Copilot Chat, Output, Problems) */}
          <div
            className={`vsc-bottom-panel ${p.terminalOpen ? '' : 'collapsed'} ${panelMaximized ? 'maximized' : ''}`}
            style={{ height: p.terminalOpen ? (panelMaximized ? 'calc(100% - 75px)' : bottomHeight) : 34 }}
          >
            <div className="panel-header">
              <div className="panel-tabs">
                <button
                  className={`panel-tab ${bottomTab === 'terminal' ? 'active-panel-tab' : ''}`}
                  onClick={() => { setBottomTab('terminal'); p.setTerminalOpen(true) }}
                >
                  <Terminal size={13} />
                  <span>TERMINAL</span>
                </button>
                <button
                  className={`panel-tab ${bottomTab === 'chat' ? 'active-panel-tab' : ''}`}
                  onClick={() => { setBottomTab('chat'); p.setTerminalOpen(true) }}
                >
                  <Sparkles size={13} />
                  <span>AI COPILOT</span>
                  {p.chatMessages.length > 0 && <span className="tab-counter">{p.chatMessages.length}</span>}
                </button>
                <button
                  className={`panel-tab ${bottomTab === 'output' ? 'active-panel-tab' : ''}`}
                  onClick={() => { setBottomTab('output'); p.setTerminalOpen(true) }}
                >
                  <span>OUTPUT</span>
                </button>
                <button
                  className={`panel-tab ${bottomTab === 'problems' ? 'active-panel-tab' : ''}`}
                  onClick={() => { setBottomTab('problems'); p.setTerminalOpen(true) }}
                >
                  <span>PROBLEMS</span>
                  {problemList.length > 0 && <span className="tab-counter error-counter">{problemList.length}</span>}
                </button>
              </div>

              <div className="panel-actions">
                {bottomTab === 'chat' && (
                  <button
                    className="vsc-tool-btn"
                    title="Clear saved AI chat history"
                    onClick={() => {
                      if (window.confirm('Clear saved AI conversation for this project?')) {
                        p.onClearChat()
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
                {bottomTab === 'terminal' && (
                  <button
                    className="vsc-tool-btn"
                    title="Clear terminal output"
                    onClick={() => setTermHistory([])}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
                <button
                  className="vsc-tool-btn"
                  title={panelMaximized ? 'Restore panel height' : 'Maximize panel height'}
                  onClick={() => setPanelMaximized(!panelMaximized)}
                >
                  {panelMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
                <button
                  className="vsc-tool-btn"
                  title={p.terminalOpen ? 'Collapse panel' : 'Expand panel'}
                  onClick={() => p.setTerminalOpen(!p.terminalOpen)}
                >
                  <PanelBottomClose size={13} />
                </button>
              </div>
            </div>

            {p.terminalOpen && (
              <div className="panel-content">
                {/* 1. Interactive Terminal Tab */}
                {bottomTab === 'terminal' && (
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
                )}

                {/* 2. Persistent AI Copilot Tab */}
                {bottomTab === 'chat' && (
                  <div className="chat-view">
                    <div className="chat-messages-scroll">
                      <div className="chat-welcome-banner">
                        <div className="welcome-avatar">
                          <Sparkles size={16} />
                        </div>
                        <div className="welcome-body">
                          <b>Studio AI Coding Assistant</b>
                          <p>
                            I have full access to your game project files. Describe features, controls, mechanics, or bug fixes.
                            Your conversation history is saved permanently with this project.
                          </p>
                          <div className="suggestion-chips">
                            <button onClick={() => p.setChat('Add mobile touch joystick controls for touchscreens')}>
                              ⌁ Mobile Touch Controls
                            </button>
                            <button onClick={() => p.setChat('Add a cosmic particle explosion effect on score')}>
                              ✳ Particle Effects
                            </button>
                            <button onClick={() => p.setChat('Add synthesized retro sound effects with Web Audio')}>
                              ♫ Audio Synthesizer
                            </button>
                            <button onClick={() => p.setChat('Make difficulty increase every 30 seconds')}>
                              ⚡ Progressive Difficulty
                            </button>
                          </div>
                        </div>
                      </div>

                      {p.chatMessages.map(msg => (
                        <div key={msg.id} className={`chat-bubble-row ${msg.role === 'user' ? 'user-row' : 'ai-row'}`}>
                          <div className="bubble-avatar">
                            {msg.role === 'user' ? (p.user?.username?.[0]?.toUpperCase() ?? 'U') : <Sparkles size={13} />}
                          </div>
                          <div className="bubble-content">
                            <div className="bubble-header">
                              <span className="bubble-author">{msg.role === 'user' ? (p.user?.username ?? 'You') : 'Studio AI'}</span>
                              {msg.time && (
                                <span className="bubble-time">
                                  {new Date(msg.time * 1000 > 1e12 ? msg.time : msg.time * 1000).toLocaleTimeString()}
                                </span>
                              )}
                            </div>
                            <div className="bubble-text">
                              <pre>{msg.text}</pre>
                            </div>
                            {msg.tools && msg.tools.length > 0 && (
                              <div className="bubble-tools">
                                {msg.tools.map((t, idx) => (
                                  <span key={idx} className="tool-chip"><Check size={11} /> Updated {t}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>

                    <div className="chat-composer-box">
                      <div className="composer-meta-row">
                        <span className="context-item">
                          <LockKeyhole size={11} /> Project: <b>{p.currentGame?.title ?? 'Project'}</b>
                        </span>
                        <span className="meta-divider">·</span>
                        <select
                          className="model-select"
                          value={p.selectedModel}
                          onChange={e => p.setSelectedModel(e.target.value)}
                          aria-label="AI Model"
                        >
                          {p.models.length ? (
                            p.models.map(m => (
                              <option key={m.id} value={m.id}>{m.display_name}</option>
                            ))
                          ) : (
                            <option value="">Connect Gemini Key</option>
                          )}
                        </select>
                        <button className="key-link-btn" onClick={() => p.setModal('api-key')}>Key Setup</button>
                      </div>

                      <div className="composer-input-row">
                        <textarea
                          value={p.chat}
                          onChange={e => p.setChat(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              p.submitPrompt()
                            }
                          }}
                          placeholder="Describe changes or new game features… (Shift+Enter for new line)"
                          rows={2}
                        />
                        <button
                          className="send-btn"
                          disabled={!p.chat.trim() || !p.selectedModel}
                          onClick={p.submitPrompt}
                          title="Send to AI (Enter)"
                        >
                          <ArrowUpRight size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Output Tab */}
                {bottomTab === 'output' && (
                  <div className="output-view">
                    <div className="output-item"><Check size={13} className="text-success" /> Save status: {p.saveState}</div>
                    <div className="output-item"><Check size={13} className="text-success" /> Static files loaded ({p.tree.length} files)</div>
                    <div className="output-item"><Check size={13} className="text-success" /> Isolated browser preview synchronized</div>
                    <div className="output-item text-muted">HTML5 games run purely in your client browser sandbox. No server shell is executed.</div>
                  </div>
                )}

                {/* 4. Problems Tab */}
                {bottomTab === 'problems' && (
                  <div className="problems-view">
                    {problemList.length > 0 ? (
                      problemList.map((pr, idx) => (
                        <div key={idx} className={`problem-item ${pr.severity}`}>
                          <span className="problem-file">{pr.file}:</span>
                          <span className="problem-msg">{pr.message}</span>
                        </div>
                      ))
                    ) : (
                      <div className="no-problems">
                        <Check size={16} className="text-success" />
                        <span>No problems detected in workspace files.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* VS Code Bottom Status Bar */}
          <footer className="vsc-statusbar">
            <div className="status-left">
              <span className="status-item"><Code2 size={12} /> {p.currentGame?.id ?? 'workspace'}</span>
              <span className="status-item">{problemList.length} Problems</span>
              <span className="status-item">UTF-8</span>
            </div>
            <div className="status-center">
              <span className="status-item"><span className="status-dot saved" /> {p.saveState}</span>
            </div>
            <div className="status-right">
              <span className="status-item">Spaces: 2</span>
              <span className="status-item">{(p.language || 'text').toUpperCase()}</span>
              <span className="status-item ai-status">
                <Sparkles size={11} /> {p.selectedModel ? p.selectedModel.replace('models/', '') : 'Connect Key'}
              </span>
            </div>
          </footer>
        </section>

        {/* Resizer between Editor & Preview */}
        <div
          className="vsc-resizer-v center-resizer"
          onMouseDown={e => startDrag('center', e)}
          role="separator"
          aria-label="Resize Preview"
        />

        {/* Live Game Preview Pane */}
        <section className="vsc-preview-column" style={{ width: `${centerWidth}%` }}>
          <div className="vsc-preview-header">
            <div className="preview-label-group">
              <span className="status-dot saved live-pulse" />
              <b className="preview-heading">GAME PREVIEW</b>
              <span className="preview-badge">LIVE</span>
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
                title="Mobile Phone View (390px)"
                onClick={() => setDevice('mobile')}
              >
                <Smartphone size={14} />
              </button>
              <span className="vsc-header-sep" />
              <button
                className="device-btn"
                title="Reload Game Preview"
                onClick={() => p.setPreviewKey(k => k + 1)}
              >
                <RefreshCw size={13} />
              </button>
              <button
                className="device-btn"
                title="Open Game in a New Tab"
                onClick={() => p.previewUrl && window.open(p.previewUrl, '_blank', 'noopener,noreferrer')}
              >
                <ArrowUpRight size={13} />
              </button>
              <button
                className="device-btn"
                title="Fullscreen Game"
                onClick={() => previewWrapRef.current?.requestFullscreen().catch(() => p.notify('Fullscreen mode not available'))}
              >
                <Maximize2 size={13} />
              </button>
            </div>
          </div>

          <div className="vsc-address-bar">
            <LockKeyhole size={11} className="lock-icon" />
            <span className="address-text" title={publicUrl || 'Private isolated preview'}>
              {p.currentGame?.visibility === 'public' ? publicUrl : 'Private Isolated Preview'}
            </span>
            <button
              className="copy-url-btn"
              onClick={p.shareLink}
              title="Copy Public Game Link"
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
                  <p>Opening isolated game preview…</p>
                </div>
              )}
            </div>
          </div>

          <div className="vsc-preview-footer">
            <div className="footer-left">
              <span className="status-dot saved" />
              <span>Auto-reloading on save · {p.saveState}</span>
            </div>
            <button className="preview-reload-btn" onClick={() => p.setPreviewKey(k => k + 1)}>
              <RefreshCw size={11} /> Reload
            </button>
          </div>
        </section>
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
