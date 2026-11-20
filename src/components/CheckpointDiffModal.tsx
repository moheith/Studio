import { useEffect, useState } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { History, RotateCcw, X, FileCode2 } from 'lucide-react'
import { fetchCheckpointDetail, fetchCheckpoints, restoreCheckpoint } from '../api'
import type { ProjectCheckpoint } from '../types'

type CheckpointDiffModalProps = {
  open: boolean
  projectId: string
  currentFiles: Record<string, string>
  onClose: () => void
  onRestored: () => Promise<void> | void
  notify: (msg: string) => void
}

function guessLang(path: string): string {
  if (path.endsWith('.html') || path.endsWith('.htm')) return 'html'
  if (path.endsWith('.css')) return 'css'
  if (path.endsWith('.json')) return 'json'
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript'
  return 'javascript'
}

export default function CheckpointDiffModal({ open, projectId, currentFiles, onClose, onRestored, notify }: CheckpointDiffModalProps) {
  const [checkpoints, setCheckpoints] = useState<ProjectCheckpoint[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string>('')
  const [detail, setDetail] = useState<ProjectCheckpoint | null>(null)
  const [selectedFile, setSelectedFile] = useState<string>('index.html')
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    if (!open || !projectId) return
    setLoading(true)
    fetchCheckpoints(projectId)
      .then((res) => {
        setCheckpoints(res.checkpoints || [])
        if (res.checkpoints?.length) setSelectedId(res.checkpoints[0].id)
      })
      .catch((err) => notify(err instanceof Error ? err.message : 'Could not load checkpoints'))
      .finally(() => setLoading(false))
  }, [open, projectId])

  useEffect(() => {
    if (!open || !selectedId || !projectId) return
    fetchCheckpointDetail(projectId, selectedId)
      .then((res) => {
        setDetail(res.checkpoint)
        const keys = Object.keys(res.checkpoint.files || {})
        if (keys.length && !keys.includes(selectedFile)) setSelectedFile(keys[0])
      })
      .catch(() => setDetail(null))
  }, [open, selectedId, projectId])

  if (!open) return null

  const allFiles = Array.from(new Set([...Object.keys(detail?.files || {}), ...Object.keys(currentFiles)])).sort()

  const handleRestore = async () => {
    if (!selectedId) return
    setRestoring(true)
    try {
      const res = await restoreCheckpoint(projectId, selectedId)
      notify(`Restored ${res.files_restored} files from checkpoint!`)
      await onRestored()
      onClose()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not restore checkpoint')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="modal-backdrop" style={{ zIndex: 9998 }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Project Checkpoints and Diff">
      <div
        className="modal-card"
        style={{
          width: 'min(1080px, 95vw)',
          height: 'min(760px, 90vh)',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#0e1017',
          border: '1px solid rgba(148,163,184,0.2)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(148,163,184,0.14)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <History size={18} color="#a78bfa" />
            <div>
              <h3 style={{ margin: 0, fontSize: 15 }}>Checkpoints &amp; Visual Diff</h3>
              <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Auto-saved before every AI edit. Compare side-by-side (Left: Checkpoint · Right: Current) or rollback in one click.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 0 }}>
          <div style={{ borderRight: '1px solid rgba(148,163,184,0.14)', overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {loading ? (
              <div style={{ padding: 16, color: '#64748b', fontSize: 13 }}>Loading history…</div>
            ) : checkpoints.length === 0 ? (
              <div style={{ padding: 16, color: '#64748b', fontSize: 13 }}>No checkpoints yet. Checkpoints are automatically saved right before Copilot modifies your files.</div>
            ) : (
              checkpoints.map((cp) => (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() => setSelectedId(cp.id)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: cp.id === selectedId ? '1px solid rgba(139,92,246,0.6)' : '1px solid transparent',
                    background: cp.id === selectedId ? 'rgba(139,92,246,0.16)' : 'rgba(255,255,255,0.03)',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cp.label}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {new Date(cp.created_at * 1000).toLocaleString()} · {cp.file_count} files
                  </div>
                </button>
              ))
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
            {detail ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 14px', borderBottom: '1px solid rgba(148,163,184,0.14)', background: '#121521' }}>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                    {allFiles.map((f) => {
                      const changed = (detail.files?.[f] ?? '') !== (currentFiles[f] ?? '')
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setSelectedFile(f)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '5px 10px',
                            borderRadius: 8,
                            border: 'none',
                            fontSize: 12,
                            cursor: 'pointer',
                            background: selectedFile === f ? 'rgba(56,189,248,0.2)' : 'transparent',
                            color: selectedFile === f ? '#38bdf8' : changed ? '#fbbf24' : '#94a3b8',
                          }}
                        >
                          <FileCode2 size={12} /> {f}{changed ? ' •' : ''}
                        </button>
                      )
                    })}
                  </div>
                  <button type="button" className="button button-primary button-small" disabled={restoring} onClick={handleRestore}>
                    <RotateCcw size={13} /> <span>{restoring ? 'Restoring…' : 'Rollback to Checkpoint'}</span>
                  </button>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <DiffEditor
                    theme="vs-dark"
                    language={guessLang(selectedFile)}
                    original={detail.files?.[selectedFile] ?? ''}
                    modified={currentFiles[selectedFile] ?? ''}
                    options={{ readOnly: true, minimap: { enabled: false }, renderSideBySide: true, fontSize: 13 }}
                  />
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#64748b', fontSize: 13 }}>
                Select a checkpoint on the left to inspect file diffs
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
