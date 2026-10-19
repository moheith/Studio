import { useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import Editor from '@monaco-editor/react'
import {
  ArrowUpRight, Braces, Check, ChevronDown, ChevronRight, CircleHelp,
  Code2, Copy, Download, Eye, EyeOff, FileCode2, FileImage, FilePlus, Files, Folder,
  FolderMinus, FolderOpen, FolderPlus, Image as ImageIcon, Loader2, LockKeyhole, Maximize2,
  Monitor, MoreHorizontal, PanelBottomClose, PanelLeft, Pencil, Plus, RefreshCw,
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
  addFile: (explicitName?: string) => void
  deleteProjectFile: (path: string) => Promise<void> | void
  renameProjectFile?: (oldPath: string, newPath: string) => Promise<void> | void
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

interface FileNode {
  id: string
  name: string
  path: string
  kind: 'file' | 'folder'
  depth: number
  children?: FileNode[]
  language?: string
}

function buildTreeHierarchy(entries: FileEntry[], emptyFolders: Set<string>): FileNode[] {
  type RawFolder = {
    __isFolder: true
    __path: string
    __name: string
    __children: Record<string, any>
  }
  type RawFile = {
    __isFolder: false
    __path: string
    __name: string
    __language?: string
  }

  const root: Record<string, any> = {}

  const ensureBranch = (parts: string[]) => {
    let curr = root
    let accumulated = ''
    for (const part of parts) {
      accumulated = accumulated ? `${accumulated}/${part}` : part
      if (!curr[part]) {
        curr[part] = {
          __isFolder: true,
          __path: accumulated,
          __name: part,
          __children: {}
        } as RawFolder
      }
      curr = curr[part].__children
    }
  }

  // 1. Add empty folders
  for (const folder of emptyFolders) {
    const parts = folder.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length > 0) ensureBranch(parts)
  }

  // 2. Add files from entries
  for (const file of entries) {
    const parts = file.name.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length === 0) continue
    const fileName = parts.pop()!
    if (parts.length > 0) ensureBranch(parts)
    let curr = root
    for (const part of parts) {
      curr = curr[part].__children
    }
    curr[fileName] = {
      __isFolder: false,
      __path: file.name,
      __name: fileName,
      __language: file.language
    } as RawFile
  }

  // 3. Convert nested dict into sorted FileNode array recursively
  const toNodes = (dict: Record<string, any>, depth: number): FileNode[] => {
    const folders: FileNode[] = []
    const files: FileNode[] = []

    for (const key of Object.keys(dict).sort((a, b) => a.localeCompare(b))) {
      const item = dict[key]
      if (item.__isFolder) {
        folders.push({
          id: item.__path,
          name: item.__name,
          path: item.__path,
          kind: 'folder',
          depth,
          children: toNodes(item.__children, depth + 1)
        })
      } else {
        files.push({
          id: item.__path,
          name: item.__name,
          path: item.__path,
          kind: 'file',
          depth,
          language: item.__language
        })
      }
    }

    return [...folders, ...files]
  }

  return toNodes(root, 0)
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
  const [explorerMenuOpen, setExplorerMenuOpen] = useState(false)

  // Explorer advanced features: collapsing folders, empty folders, inline creation, renaming, context menu, loading
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [emptyFolders, setEmptyFolders] = useState<Set<string>>(new Set())
  const [creatingItem, setCreatingItem] = useState<{ type: 'file' | 'folder'; parentPath: string } | null>(null)
  const [renamingItem, setRenamingItem] = useState<{ path: string; name: string; kind: 'file' | 'folder' } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: { path: string; name: string; kind: 'file' | 'folder' } | null } | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [processingPath, setProcessingPath] = useState<string | null>(null)

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

  // Hierarchical file tree calculation
  const hierarchicalTree = useMemo(() => {
    return buildTreeHierarchy(p.tree, emptyFolders)
  }, [p.tree, emptyFolders])

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderPath)) next.delete(folderPath)
      else next.add(folderPath)
      return next
    })
  }

  const collapseAllFolders = () => {
    const allFolderPaths: string[] = []
    const collect = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.kind === 'folder') {
          allFolderPaths.push(node.path)
          if (node.children) collect(node.children)
        }
      }
    }
    collect(hierarchicalTree)
    setCollapsedFolders(new Set(allFolderPaths))
  }

  const expandAllFolders = () => {
    setCollapsedFolders(new Set())
  }

  const startCreate = (type: 'file' | 'folder', parentPath: string = '') => {
    setCreatingItem({ type, parentPath })
    if (parentPath) {
      setCollapsedFolders(prev => {
        const next = new Set(prev)
        next.delete(parentPath)
        return next
      })
    }
  }

  const commitCreate = async (type: 'file' | 'folder', parentPath: string, rawName: string) => {
    const clean = rawName.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim()
    if (!clean || clean.includes('..')) {
      p.notify('Invalid name')
      return
    }
    const fullPath = parentPath ? `${parentPath}/${clean}` : clean

    if (type === 'folder') {
      setEmptyFolders(prev => new Set([...prev, fullPath]))
      setCollapsedFolders(prev => {
        const next = new Set(prev)
        next.delete(fullPath)
        if (parentPath) next.delete(parentPath)
        return next
      })
      p.notify(`Folder "${clean}" created`)
      return
    }

    const ext = fullPath.split('.').pop()?.toLowerCase()
    const hasExt = ext && ext !== fullPath
    const finalFilePath = hasExt ? fullPath : `${fullPath}.js`

    setProcessingPath(finalFilePath)
    try {
      p.addFile(finalFilePath)
      if (parentPath) {
        setCollapsedFolders(prev => {
          const next = new Set(prev)
          next.delete(parentPath)
          return next
        })
      }
    } finally {
      setProcessingPath(null)
    }
  }

  const deleteFolder = async (folderPath: string) => {
    const filesInFolder = p.tree.filter(f => f.name === folderPath || f.name.startsWith(`${folderPath}/`))
    const confirmMsg = filesInFolder.length > 0
      ? `Delete folder "${folderPath}" and all ${filesInFolder.length} file(s) inside it?`
      : `Delete empty folder "${folderPath}"?`
    if (!window.confirm(confirmMsg)) return

    setProcessingPath(folderPath)
    try {
      for (const file of filesInFolder) {
        if (file.name === 'index.html') continue
        await p.deleteProjectFile(file.name)
      }
      setEmptyFolders(prev => {
        const next = new Set(prev)
        for (const f of next) {
          if (f === folderPath || f.startsWith(`${folderPath}/`)) next.delete(f)
        }
        return next
      })
      p.notify(`Deleted folder "${folderPath}"`)
    } catch (err: any) {
      p.notify(err?.message || 'Could not delete folder')
    } finally {
      setProcessingPath(null)
    }
  }

  const renameFolder = async (oldFolderPath: string, newFolderName: string) => {
    const cleanName = newFolderName.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim()
    if (!cleanName || cleanName.includes('..') || cleanName.includes('/')) {
      p.notify('Please enter a valid folder name (no slashes or dots)')
      return
    }
    const parent = oldFolderPath.includes('/') ? oldFolderPath.slice(0, oldFolderPath.lastIndexOf('/')) : ''
    const newFolderPath = parent ? `${parent}/${cleanName}` : cleanName
    if (newFolderPath === oldFolderPath) return

    setProcessingPath(oldFolderPath)
    try {
      const filesInFolder = p.tree.filter(f => f.name.startsWith(`${oldFolderPath}/`))
      if (p.renameProjectFile) {
        for (const file of filesInFolder) {
          const suffix = file.name.slice(oldFolderPath.length)
          const newFilePath = `${newFolderPath}${suffix}`
          await p.renameProjectFile(file.name, newFilePath)
        }
      }
      setEmptyFolders(prev => {
        const next = new Set(prev)
        if (next.has(oldFolderPath)) {
          next.delete(oldFolderPath)
          next.add(newFolderPath)
        }
        for (const f of Array.from(next)) {
          if (f.startsWith(`${oldFolderPath}/`)) {
            next.delete(f)
            next.add(`${newFolderPath}${f.slice(oldFolderPath.length)}`)
          }
        }
        return next
      })
      setCollapsedFolders(prev => {
        const next = new Set(prev)
        if (next.has(oldFolderPath)) {
          next.delete(oldFolderPath)
          next.add(newFolderPath)
        }
        return next
      })
      p.notify(`Renamed folder to "${newFolderPath}"`)
    } catch (err: any) {
      p.notify(err?.message || 'Could not rename folder')
    } finally {
      setProcessingPath(null)
    }
  }

  const downloadFile = (filePath: string) => {
    const content = p.code[filePath] ?? ''
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filePath.split('/').pop() || 'file'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    p.notify(`Downloaded ${filePath}`)
  }

  const handleRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      await p.onReloadFiles()
    } finally {
      setIsRefreshing(false)
    }
  }

  const triggerUpload = () => {
    document.getElementById('vsc-asset-file-input')?.click()
  }

  const handleContextMenu = (e: React.MouseEvent, node: FileNode | null) => {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 220)
    const y = Math.min(e.clientY, window.innerHeight - 270)
    setContextMenu({
      x,
      y,
      item: node ? { path: node.path, name: node.name, kind: node.kind } : null
    })
  }

  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null)
      setExplorerMenuOpen(false)
      setAiMenuOpen(false)
      setTopMenuOpen(false)
    }
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null)
        setExplorerMenuOpen(false)
        setAiMenuOpen(false)
        setTopMenuOpen(false)
        setCreatingItem(null)
        setRenamingItem(null)
      }
    }
    window.addEventListener('click', handleGlobalClick)
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => {
      window.removeEventListener('click', handleGlobalClick)
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [])

  const renderTreeNodes = (nodes: FileNode[]) => {
    return nodes.map(node => {
      if (node.kind === 'folder') {
        const isCollapsed = collapsedFolders.has(node.path)
        const isProcessing = processingPath === node.path
        const isRenaming = renamingItem?.path === node.path
        const childCount = (node.children?.length ?? 0)

        return (
          <div key={node.id} className="vsc-tree-folder-group">
            <div
              className={`vsc-tree-row vsc-folder-row ${isProcessing ? 'is-loading' : ''}`}
              style={{ paddingLeft: `${node.depth * 14 + 10}px` }}
              onClick={() => toggleFolder(node.path)}
              onContextMenu={e => handleContextMenu(e, node)}
              title={node.path}
            >
              <span className="tree-folder-chevron">
                {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </span>
              <span className="tree-folder-icon">
                {isCollapsed ? <Folder size={14} className="folder-icon" /> : <FolderOpen size={14} className="folder-icon-open" />}
              </span>

              {isRenaming ? (
                <input
                  className="vsc-inline-tree-input"
                  autoFocus
                  defaultValue={node.name}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    else if (e.key === 'Escape') setRenamingItem(null)
                  }}
                  onBlur={e => {
                    const val = e.currentTarget.value.trim()
                    setRenamingItem(null)
                    if (val && val !== node.name) {
                      void renameFolder(node.path, val)
                    }
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="tree-file-name folder-name">
                  {node.name}
                  {childCount > 0 && <span className="tree-child-count">{childCount}</span>}
                </span>
              )}

              {isProcessing ? (
                <Loader2 size={12} className="animate-spin text-muted" />
              ) : (
                <div className="tree-row-actions">
                  <button
                    className="tree-row-action-btn"
                    title="New File Inside Folder"
                    onClick={e => {
                      e.stopPropagation()
                      startCreate('file', node.path)
                    }}
                  >
                    <FilePlus size={12} />
                  </button>
                  <button
                    className="tree-row-action-btn"
                    title="New Folder Inside Folder"
                    onClick={e => {
                      e.stopPropagation()
                      startCreate('folder', node.path)
                    }}
                  >
                    <FolderPlus size={12} />
                  </button>
                  <button
                    className="tree-row-action-btn danger"
                    title="Delete Folder"
                    onClick={e => {
                      e.stopPropagation()
                      void deleteFolder(node.path)
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Inline creation inside this folder */}
            {!isCollapsed && creatingItem?.parentPath === node.path && (
              <div
                className="vsc-tree-row vsc-inline-create-row"
                style={{ paddingLeft: `${(node.depth + 1) * 14 + 10}px` }}
              >
                <span className="tree-file-icon">
                  {creatingItem.type === 'file' ? <FileCode2 size={13} className="text-accent" /> : <FolderPlus size={13} className="text-folder" />}
                </span>
                <input
                  className="vsc-inline-tree-input"
                  autoFocus
                  placeholder={creatingItem.type === 'file' ? 'filename.js' : 'folder-name'}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    else if (e.key === 'Escape') setCreatingItem(null)
                  }}
                  onBlur={e => {
                    const val = e.currentTarget.value.trim()
                    const type = creatingItem.type
                    const parent = creatingItem.parentPath
                    setCreatingItem(null)
                    if (val) void commitCreate(type, parent, val)
                  }}
                  onClick={e => e.stopPropagation()}
                />
              </div>
            )}

            {/* Child nodes */}
            {!isCollapsed && node.children && (
              <div className="vsc-folder-children">
                {renderTreeNodes(node.children)}
              </div>
            )}
          </div>
        )
      }

      // File Node
      const isProcessing = processingPath === node.path
      const isRenaming = renamingItem?.path === node.path
      const isActive = p.activeFile === node.path

      return (
        <div
          key={node.id}
          className={`vsc-tree-row ${isActive ? 'active' : ''} ${isProcessing ? 'is-loading' : ''}`}
          style={{ paddingLeft: `${node.depth * 14 + 10}px` }}
          onClick={() => openFileTab(node.path)}
          onContextMenu={e => handleContextMenu(e, node)}
          title={node.path}
        >
          <span className="tree-file-icon">
            <FileIcon name={node.name} />
          </span>

          {isRenaming ? (
            <input
              className="vsc-inline-tree-input"
              autoFocus
              defaultValue={node.name}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
                else if (e.key === 'Escape') setRenamingItem(null)
              }}
              onBlur={e => {
                const val = e.currentTarget.value.trim()
                setRenamingItem(null)
                if (val && val !== node.name && p.renameProjectFile) {
                  const parent = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : ''
                  const newFilePath = parent ? `${parent}/${val}` : val
                  setProcessingPath(node.path)
                  Promise.resolve(p.renameProjectFile(node.path, newFilePath)).finally(() => setProcessingPath(null))
                }
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="tree-file-name">{node.name}</span>
          )}

          {isProcessing ? (
            <Loader2 size={12} className="animate-spin text-muted" />
          ) : (
            <div className="tree-row-actions">
              {node.path !== 'index.html' && (
                <button
                  className="tree-row-action-btn"
                  title={`Rename ${node.name}`}
                  onClick={e => {
                    e.stopPropagation()
                    setRenamingItem({ path: node.path, name: node.name, kind: 'file' })
                  }}
                >
                  <Pencil size={11} />
                </button>
              )}
              {node.path !== 'index.html' && (
                <button
                  className="tree-row-action-btn danger"
                  title={`Delete ${node.name}`}
                  onClick={e => {
                    e.stopPropagation()
                    if (window.confirm(`Delete ${node.name}?`)) {
                      setProcessingPath(node.path)
                      Promise.resolve(p.deleteProjectFile(node.path)).finally(() => setProcessingPath(null))
                    }
                  }}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          )}
        </div>
      )
    })
  }

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
                      title="New File (Root)"
                      onClick={() => startCreate('file', '')}
                    >
                      <FilePlus size={14} />
                    </button>
                    <button
                      className="vsc-tool-btn"
                      title="New Folder (Root)"
                      onClick={() => startCreate('folder', '')}
                    >
                      <FolderPlus size={14} />
                    </button>
                    <button
                      className="vsc-tool-btn"
                      title="Upload Game Asset (PNG, JPG, Audio, Fonts)"
                      onClick={triggerUpload}
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
                        if (file) {
                          setIsUploading(true)
                          Promise.resolve(p.uploadProjectAsset(file)).finally(() => setIsUploading(false))
                        }
                        e.currentTarget.value = ''
                      }}
                    />
                    <button
                      className={`vsc-tool-btn ${isRefreshing ? 'is-spinning' : ''}`}
                      title="Refresh Project Files"
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                    >
                      <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                    </button>
                    <button
                      className="vsc-tool-btn"
                      title="Collapse All Folders"
                      onClick={collapseAllFolders}
                    >
                      <FolderMinus size={14} />
                    </button>
                    {/* Explorer 3-dots Menu */}
                    <div className="vsc-menu-container">
                      <button
                        className="vsc-tool-btn"
                        title="More Explorer Options"
                        onClick={e => {
                          e.stopPropagation()
                          setExplorerMenuOpen(!explorerMenuOpen)
                        }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {explorerMenuOpen && (
                        <div className="vsc-dropdown-menu" onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setExplorerMenuOpen(false); startCreate('file', '') }}>
                            <FilePlus size={13} />
                            <span>New File…</span>
                          </button>
                          <button onClick={() => { setExplorerMenuOpen(false); startCreate('folder', '') }}>
                            <FolderPlus size={13} />
                            <span>New Folder…</span>
                          </button>
                          <button onClick={() => { setExplorerMenuOpen(false); triggerUpload() }}>
                            <Upload size={13} />
                            <span>Upload Asset…</span>
                          </button>
                          <button onClick={() => { setExplorerMenuOpen(false); void handleRefresh() }}>
                            <RefreshCw size={13} />
                            <span>Refresh Explorer</span>
                          </button>
                          <button onClick={() => { setExplorerMenuOpen(false); collapseAllFolders() }}>
                            <FolderMinus size={13} />
                            <span>Collapse All Folders</span>
                          </button>
                          <button onClick={() => { setExplorerMenuOpen(false); expandAllFolders() }}>
                            <FolderOpen size={13} />
                            <span>Expand All Folders</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress bar during refresh/scan */}
                {isRefreshing && <div className="vsc-explorer-progress-bar" />}

                {/* Project Header Row */}
                <div
                  className="vsc-project-header"
                  onContextMenu={e => handleContextMenu(e, null)}
                >
                  <ChevronDown size={14} />
                  <Folder size={14} className="folder-icon" />
                  <span className="project-name-label">
                    {p.currentGame?.id?.toUpperCase() ?? 'PROJECT'}
                  </span>
                  {isRefreshing ? (
                    <span className="vsc-scan-indicator">
                      <Loader2 size={10} className="animate-spin" />
                      <span>Scanning…</span>
                    </span>
                  ) : isUploading ? (
                    <span className="vsc-scan-indicator">
                      <Loader2 size={10} className="animate-spin" />
                      <span>Uploading…</span>
                    </span>
                  ) : (
                    <span className="vsc-file-count-badge">
                      {p.tree.length} files
                    </span>
                  )}
                </div>

                {/* File Tree View with Hierarchy and Right-Click support */}
                <div
                  className="vsc-file-tree"
                  onContextMenu={e => handleContextMenu(e, null)}
                >
                  {/* Root inline creation row */}
                  {creatingItem && creatingItem.parentPath === '' && (
                    <div className="vsc-tree-row vsc-inline-create-row" style={{ paddingLeft: '10px' }}>
                      <span className="tree-file-icon">
                        {creatingItem.type === 'file' ? <FileCode2 size={13} className="text-accent" /> : <FolderPlus size={13} className="text-folder" />}
                      </span>
                      <input
                        className="vsc-inline-tree-input"
                        autoFocus
                        placeholder={creatingItem.type === 'file' ? 'filename.js' : 'folder-name'}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.currentTarget.blur()
                          else if (e.key === 'Escape') setCreatingItem(null)
                        }}
                        onBlur={e => {
                          const val = e.currentTarget.value.trim()
                          const type = creatingItem.type
                          setCreatingItem(null)
                          if (val) void commitCreate(type, '', val)
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                  )}

                  {/* Render Hierarchical Tree */}
                  {renderTreeNodes(hierarchicalTree)}

                  {!p.tree.length && !creatingItem && (
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
                      <b>VS Code Game Explorer</b>
                      <p>Right-click any file or folder for quick options. Client-side game runtime.</p>
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
      {/* Global Explorer Right-Click Context Menu */}
      {contextMenu && (
        <div
          className="vsc-context-menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.item?.kind === 'file' && (
            <>
              <div className="context-menu-header">{contextMenu.item.path}</div>
              <button onClick={() => { openFileTab(contextMenu.item!.path); setContextMenu(null) }}>
                <FileCode2 size={13} />
                <span>Open File</span>
              </button>
              {contextMenu.item.path !== 'index.html' && (
                <button onClick={() => { setRenamingItem(contextMenu.item!); setContextMenu(null) }}>
                  <Pencil size={13} />
                  <span>Rename File…</span>
                </button>
              )}
              <button onClick={() => {
                navigator.clipboard?.writeText(contextMenu.item!.path)
                p.notify(`Copied "${contextMenu.item!.path}"`)
                setContextMenu(null)
              }}>
                <Copy size={13} />
                <span>Copy Path</span>
              </button>
              <button onClick={() => { downloadFile(contextMenu.item!.path); setContextMenu(null) }}>
                <Download size={13} />
                <span>Download File</span>
              </button>
              <div className="context-menu-sep" />
              {contextMenu.item.path !== 'index.html' && (
                <button className="danger" onClick={() => {
                  const path = contextMenu.item!.path
                  setContextMenu(null)
                  if (window.confirm(`Delete ${path}?`)) {
                    setProcessingPath(path)
                    Promise.resolve(p.deleteProjectFile(path)).finally(() => setProcessingPath(null))
                  }
                }}>
                  <Trash2 size={13} />
                  <span>Delete File</span>
                </button>
              )}
            </>
          )}

          {contextMenu.item?.kind === 'folder' && (
            <>
              <div className="context-menu-header">📁 {contextMenu.item.path}</div>
              <button onClick={() => { startCreate('file', contextMenu.item!.path); setContextMenu(null) }}>
                <FilePlus size={13} />
                <span>New File in Folder…</span>
              </button>
              <button onClick={() => { startCreate('folder', contextMenu.item!.path); setContextMenu(null) }}>
                <FolderPlus size={13} />
                <span>New Folder in Folder…</span>
              </button>
              <button onClick={() => { setRenamingItem(contextMenu.item!); setContextMenu(null) }}>
                <Pencil size={13} />
                <span>Rename Folder…</span>
              </button>
              <button onClick={() => {
                navigator.clipboard?.writeText(contextMenu.item!.path)
                p.notify(`Copied "${contextMenu.item!.path}"`)
                setContextMenu(null)
              }}>
                <Copy size={13} />
                <span>Copy Path</span>
              </button>
              <div className="context-menu-sep" />
              <button className="danger" onClick={() => {
                const path = contextMenu.item!.path
                setContextMenu(null)
                void deleteFolder(path)
              }}>
                <Trash2 size={13} />
                <span>Delete Folder</span>
              </button>
            </>
          )}

          {!contextMenu.item && (
            <>
              <div className="context-menu-header">PROJECT EXPLORER</div>
              <button onClick={() => { startCreate('file', ''); setContextMenu(null) }}>
                <FilePlus size={13} />
                <span>New File…</span>
              </button>
              <button onClick={() => { startCreate('folder', ''); setContextMenu(null) }}>
                <FolderPlus size={13} />
                <span>New Folder…</span>
              </button>
              <button onClick={() => { triggerUpload(); setContextMenu(null) }}>
                <Upload size={13} />
                <span>Upload Asset…</span>
              </button>
              <div className="context-menu-sep" />
              <button onClick={() => { setContextMenu(null); void handleRefresh() }}>
                <RefreshCw size={13} />
                <span>Refresh Explorer</span>
              </button>
              <button onClick={() => { expandAllFolders(); setContextMenu(null) }}>
                <FolderOpen size={13} />
                <span>Expand All Folders</span>
              </button>
              <button onClick={() => { collapseAllFolders(); setContextMenu(null) }}>
                <FolderMinus size={13} />
                <span>Collapse All Folders</span>
              </button>
            </>
          )}
        </div>
      )}
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
