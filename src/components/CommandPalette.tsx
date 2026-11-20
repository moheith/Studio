import { useEffect, useMemo, useRef, useState } from 'react'
import { FileCode2, Search, Terminal, Sparkles, History, Crosshair, Image as ImageIcon, Download, Eye, Settings, X } from 'lucide-react'

export type PaletteAction = {
  id: string
  label: string
  hint?: string
  group: 'Files' | 'Commands'
  icon?: 'file' | 'ai' | 'history' | 'picker' | 'asset' | 'download' | 'preview' | 'terminal' | 'settings'
  run: () => void
}

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  files: string[]
  onOpenFile: (path: string) => void
  actions: Omit<PaletteAction, 'group'>[]
}

export default function CommandPalette({ open, onClose, files, onOpenFile, actions }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      window.setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  const items = useMemo<PaletteAction[]>(() => {
    const fileItems: PaletteAction[] = files
      .filter((f) => !f.endsWith('/.keep.json') && f !== '.keep.json')
      .map((path) => ({
        id: `file:${path}`,
        label: path,
        hint: 'Open file',
        group: 'Files',
        icon: 'file',
        run: () => onOpenFile(path),
      }))
    const cmdItems: PaletteAction[] = actions.map((a) => ({ ...a, group: 'Commands' }))
    const all = query.startsWith('>') ? cmdItems : [...fileItems, ...cmdItems]
    const needle = query.replace(/^>\s*/, '').trim().toLowerCase()
    if (!needle) return all.slice(0, 24)
    return all
      .filter((item) => item.label.toLowerCase().includes(needle) || (item.hint || '').toLowerCase().includes(needle))
      .slice(0, 24)
  }, [files, actions, query, onOpenFile])

  useEffect(() => {
    setSelected(0)
  }, [query])

  if (!open) return null

  const renderIcon = (kind?: PaletteAction['icon']) => {
    switch (kind) {
      case 'ai': return <Sparkles size={15} />
      case 'history': return <History size={15} />
      case 'picker': return <Crosshair size={15} />
      case 'asset': return <ImageIcon size={15} />
      case 'download': return <Download size={15} />
      case 'preview': return <Eye size={15} />
      case 'terminal': return <Terminal size={15} />
      case 'settings': return <Settings size={15} />
      default: return <FileCode2 size={15} />
    }
  }

  return (
    <div
      className="modal-backdrop"
      style={{ alignItems: 'flex-start', paddingTop: '11vh', zIndex: 9999 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        className="modal-card"
        style={{
          width: 'min(600px, 92vw)',
          padding: 0,
          overflow: 'hidden',
          background: '#11131a',
          border: '1px solid rgba(148,163,184,0.22)',
          borderRadius: 16,
          boxShadow: '0 24px 80px rgba(0,0,0,0.65)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(148,163,184,0.14)' }}>
          <Search size={16} style={{ opacity: 0.7 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(items.length - 1, s + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(0, s - 1)) }
              else if (e.key === 'Enter' && items[selected]) { e.preventDefault(); items[selected].run(); onClose() }
            }}
            placeholder="Search files or type '>' for studio commands..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f8fafc',
              fontSize: 14,
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close palette"
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ maxHeight: 380, overflowY: 'auto', padding: 8 }}>
          {items.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              No matching files or commands
            </div>
          ) : (
            items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setSelected(idx)}
                onClick={() => { item.run(); onClose() }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: idx === selected ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                  color: idx === selected ? '#ffffff' : '#cbd5e1',
                  fontSize: 13,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ color: item.group === 'Commands' ? '#a78bfa' : '#38bdf8', flexShrink: 0 }}>
                    {renderIcon(item.icon)}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                </span>
                <span style={{ fontSize: 11, color: '#64748b', flexShrink: 0 }}>{item.hint || item.group}</span>
              </button>
            ))
          )}
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(148,163,184,0.12)', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
          <span>↑↓ Navigate · Enter Run · Esc Close</span>
          <span>Ctrl+K / Ctrl+P</span>
        </div>
      </div>
    </div>
  )
}
