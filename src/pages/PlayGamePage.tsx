import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Code2, Copy, Check, ExternalLink, Flag, GitFork, Heart,
  Maximize2, MessageSquare, Play, ShieldCheck, Trash2, Trophy, X, Monitor,
} from 'lucide-react'
import {
  deleteGameComment, fetchGameComments, fetchGameScores, fetchPublicGameMeta,
  postGameComment, remixPublicGame, reportPublicGame, submitGameScore, toggleGameLike, trackGamePlay,
} from '../api'
import type { GameComment, GameScore, Page, PublicGameMeta, User } from '../types'

type PlayGamePageProps = {
  username: string
  slug: string
  user: User | null
  playOrigin: string
  setPage: (page: Page) => void
  onOpenCreatorProfile: (username: string) => void
  onOpenRemixedProject: (project: Record<string, unknown>) => void
  notify: (msg: string) => void
}

export default function PlayGamePage({
  username,
  slug,
  user,
  playOrigin,
  setPage,
  onOpenCreatorProfile,
  onOpenRemixedProject,
  notify,
}: PlayGamePageProps) {
  const [meta, setMeta] = useState<PublicGameMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [theater, setTheater] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [playsCount, setPlaysCount] = useState(0)
  const [comments, setComments] = useState<GameComment[]>([])
  const [scores, setScores] = useState<GameScore[]>([])
  const [activeTab, setActiveTab] = useState<'comments' | 'leaderboard'>('comments')
  const [commentDraft, setCommentDraft] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [remixing, setRemixing] = useState(false)
  const [showEmbed, setShowEmbed] = useState(false)
  const [copiedEmbed, setCopiedEmbed] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportReason, setReportReason] = useState('phishing')
  const [reportDetails, setReportDetails] = useState('')
  const [reporting, setReporting] = useState(false)
  const frameWrapRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const trackedRef = useRef('')

  const resolvedPlayOrigin = useMemo(() => {
    const raw = (meta?.play_origin || playOrigin || '').replace(/\/$/, '')
    return raw || window.location.origin
  }, [meta?.play_origin, playOrigin])

  const iframeSrc = useMemo(() => {
    if (meta?.play_url) return meta.play_url
    return `${resolvedPlayOrigin}/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/`
  }, [meta?.play_url, resolvedPlayOrigin, username, slug])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    Promise.all([
      fetchPublicGameMeta(username, slug),
      fetchGameComments(username, slug).catch(() => ({ comments: [] })),
      fetchGameScores(username, slug).catch(() => ({ scores: [] })),
    ])
      .then(([m, c, s]) => {
        if (!alive) return
        setMeta(m)
        setLiked(Boolean(m.user_liked))
        setLikesCount(m.likes_count || 0)
        setPlaysCount(m.plays || 0)
        setComments(c.comments || [])
        setScores(s.scores || [])
        document.title = `${m.title} by @${m.username} — Yulya Studio`
        // Track play strictly ONCE per game view (fixes BUG-03 3x inflation)
        const key = `${m.username}/${m.slug}`
        if (trackedRef.current !== key) {
          trackedRef.current = key
          trackGamePlay(m.username, m.slug).then((nextPlays) => {
            if (alive && nextPlays > 0) setPlaysCount(nextPlays)
          })
        }
      })
      .catch((err) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : 'Project not found or private')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [username, slug])

  // Listen strictly to verified PLAY_ORIGIN iframe for YulyaSDK.submitScore
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== resolvedPlayOrigin) return
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return
      const data = event.data
      if (!data || typeof data !== 'object') return
      if (data.type === 'yulya:submit-score' && typeof data.score === 'number' && Number.isFinite(data.score)) {
        submitGameScore(username, slug, data.score, user?.username)
          .then((res) => {
            if (res.entry) {
              setScores((prev) => [...prev, res.entry].sort((a, b) => b.score - a.score).slice(0, 20))
              notify(`Score ${res.entry.score} posted to leaderboard!`)
            }
          })
          .catch(() => {})
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [resolvedPlayOrigin, username, slug, user?.username])

  const handleLike = async () => {
    if (!user) {
      notify('Sign in to like projects')
      return
    }
    try {
      const res = await toggleGameLike(username, slug)
      setLiked(res.liked)
      setLikesCount(res.likes_count)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update like')
    }
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      notify('Sign in to post a comment')
      return
    }
    if (!commentDraft.trim()) return
    setPostingComment(true)
    try {
      const res = await postGameComment(username, slug, commentDraft.trim())
      setComments((prev) => [res.comment, ...prev])
      setCommentDraft('')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not post comment')
    } finally {
      setPostingComment(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteGameComment(username, slug, commentId)
      setComments((prev) => prev.filter((c) => c.id !== commentId))
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete comment')
    }
  }

  const handleRemix = async () => {
    if (!user) {
      notify('Sign in to remix this project into your Studio')
      setPage('login')
      return
    }
    setRemixing(true)
    try {
      const res = await remixPublicGame(username, slug)
      notify('Remixed into your Studio workspace!')
      onOpenRemixedProject(res.project)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not remix project')
    } finally {
      setRemixing(false)
    }
  }

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault()
    setReporting(true)
    try {
      await reportPublicGame(username, slug, reportReason, reportDetails)
      notify('Report submitted. Thank you for helping keep Yulya Studio safe.')
      setShowReport(false)
      setReportDetails('')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not submit report')
    } finally {
      setReporting(false)
    }
  }

  const embedCode = `<iframe src="${iframeSrc}?embed=1" width="960" height="540" style="border:0;border-radius:12px;" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms" allowfullscreen></iframe>`

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: '#080a10', color: '#f8fafc', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>Loading sandboxed experience…</div>
      </main>
    )
  }

  if (error || !meta) {
    return (
      <main style={{ minHeight: '100vh', background: '#080a10', color: '#f8fafc', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: 'center', background: '#111420', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 16, padding: 28 }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Project Unavailable</h1>
          <p style={{ color: '#94a3b8', marginBottom: 20 }}>{error || 'This project is private or does not exist.'}</p>
          <button type="button" className="button button-primary" onClick={() => setPage('arcade')}>
            <ArrowLeft size={15} /> Back to Arcade
          </button>
        </div>
      </main>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#070910', color: '#f8fafc' }}>
      <header className="play-page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '12px 20px', borderBottom: '1px solid rgba(148,163,184,0.12)', background: 'rgba(11,13,20,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 40, maxWidth: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 220px' }}>
          <button type="button" className="button button-outline button-small" style={{ flexShrink: 0 }} onClick={() => setPage('arcade')}>
            <ArrowLeft size={14} /> Arcade
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.title}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => onOpenCreatorProfile(meta.username)}
                style={{ background: 'none', border: 'none', color: '#a78bfa', padding: 0, cursor: 'pointer', fontSize: 12 }}
              >
                @{meta.username}
              </button>
              <span>·</span>
              <span>{meta.genre}</span>
              <span>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#34d399' }}>
                <ShieldCheck size={12} /> Isolated Sandbox
              </span>
            </div>
          </div>
        </div>

        <div className="play-page-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', maxWidth: '100%' }}>
          <button type="button" className={`button button-small ${liked ? 'button-primary' : 'button-outline'}`} onClick={handleLike}>
            <Heart size={14} fill={liked ? 'currentColor' : 'none'} /> <span>{likesCount}</span>
          </button>
          {meta.allow_remix && (
            <button type="button" className="button button-primary button-small" disabled={remixing} onClick={handleRemix}>
              <GitFork size={14} /> <span>{remixing ? 'Remixing…' : 'Remix in Studio'}</span>
            </button>
          )}
          <button type="button" className="button button-outline button-small" onClick={() => {
            navigator.clipboard?.writeText(window.location.href)
            setCopiedLink(true)
            notify('Share link copied!')
            window.setTimeout(() => setCopiedLink(false), 1400)
          }}>
            {copiedLink ? <Check size={14} /> : <Copy size={14} />} <span>Share</span>
          </button>
          <button type="button" className="button button-outline button-small" onClick={() => setShowEmbed(true)}>
            <Code2 size={14} /> <span>Embed</span>
          </button>
          <button type="button" className="button button-outline button-small" onClick={() => setTheater((t) => !t)} title="Toggle Theater Mode">
            <Monitor size={14} />
          </button>
          <button type="button" className="button button-outline button-small" onClick={() => frameWrapRef.current?.requestFullscreen().catch(() => notify('Fullscreen unavailable'))} title="Fullscreen">
            <Maximize2 size={14} />
          </button>
          <button type="button" className="button button-outline button-small" onClick={() => setShowReport(true)} title="Report Abuse or Phishing">
            <Flag size={14} />
          </button>
        </div>
      </header>

      <main style={{ maxWidth: theater ? '100%' : 1220, margin: '0 auto', padding: theater ? '16px 20px' : '24px 20px 64px' }}>
        <div
          ref={frameWrapRef}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: theater ? '21 / 10' : '16 / 9',
            maxHeight: theater ? '82vh' : '74vh',
            background: '#05060a',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid rgba(148,163,184,0.18)',
            boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
          }}
        >
          <iframe
            ref={iframeRef}
            title={`${meta.title} sandbox`}
            src={iframeSrc}
            sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms"
            allow="fullscreen; gamepad"
            style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#05060a' }}
          />
        </div>

        <div className="play-page-grid">
          <section style={{ background: '#0f121b', border: '1px solid rgba(148,163,184,0.14)', borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid rgba(148,163,184,0.14)', paddingBottom: 12, marginBottom: 16 }}>
              <button
                type="button"
                className={`button button-small ${activeTab === 'comments' ? 'button-primary' : 'button-outline'}`}
                onClick={() => setActiveTab('comments')}
              >
                <MessageSquare size={14} /> <span>Comments ({comments.length})</span>
              </button>
              <button
                type="button"
                className={`button button-small ${activeTab === 'leaderboard' ? 'button-primary' : 'button-outline'}`}
                onClick={() => setActiveTab('leaderboard')}
              >
                <Trophy size={14} /> <span>Leaderboard ({scores.length})</span>
              </button>
            </div>

            {activeTab === 'comments' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <form onSubmit={handleComment} style={{ display: 'flex', gap: 10 }}>
                  <input
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder={user ? 'Leave feedback for the creator…' : 'Sign in to leave a comment…'}
                    maxLength={600}
                    style={{ flex: 1, background: '#080a10', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, padding: '10px 14px', color: '#f8fafc', fontSize: 13.5 }}
                  />
                  <button type="submit" className="button button-primary button-small" disabled={postingComment || !commentDraft.trim()}>
                    {postingComment ? 'Posting…' : 'Post'}
                  </button>
                </form>

                {comments.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: 13.5, margin: 0 }}>No comments yet. Be the first to share feedback!</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {comments.map((c) => (
                      <div key={c.id} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,163,184,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                            {c.display_name} <span style={{ color: '#94a3b8', fontWeight: 400 }}>@{c.username}</span>
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: '#64748b' }}>{new Date(c.created_at * 1000).toLocaleDateString()}</span>
                            {user && (user.id === c.user_id || user.username === meta.username) && (
                              <button type="button" onClick={() => handleDeleteComment(c.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 2 }} title="Delete comment">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                        <p style={{ margin: 0, fontSize: 13.5, color: '#cbd5e1', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                {scores.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: 13.5, margin: 0 }}>
                    No scores recorded yet. Creators can send scores from any game using <code>window.YulyaSDK.submitScore(score)</code>.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {scores.map((s, idx) => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: idx === 0 ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)' }}>
                        <span style={{ fontSize: 13.5 }}><b>#{idx + 1}</b> &nbsp; {s.player}</span>
                        <span style={{ fontWeight: 700, color: '#38bdf8' }}>{s.score}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <aside style={{ background: '#0f121b', border: '1px solid rgba(148,163,184,0.14)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>About this Project</h2>
            <p style={{ margin: 0, fontSize: 13.5, color: '#94a3b8', lineHeight: 1.6 }}>
              {meta.description || 'Interactive web experience built live in Yulya Studio.'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>PLAYS</div>
                <div style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><Play size={14} color="#38bdf8" /> {playsCount}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>LIKES</div>
                <div style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><Heart size={14} color="#f43f5e" /> {likesCount}</div>
              </div>
            </div>
            <a
              href={iframeSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="button button-outline button-small"
              style={{ justifyContent: 'center', textDecoration: 'none' }}
            >
              <ExternalLink size={14} /> Open Isolated Sandbox Tab
            </a>
          </aside>
        </div>
      </main>

      {showEmbed && (
        <div className="modal-backdrop" onClick={() => setShowEmbed(false)}>
          <div className="modal-card" style={{ width: 'min(540px, 92vw)', background: '#10121a', borderRadius: 16, padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Embed on Your Website</h3>
              <button type="button" onClick={() => setShowEmbed(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <textarea readOnly rows={4} value={embedCode} style={{ width: '100%', background: '#070910', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, padding: 12, color: '#38bdf8', fontFamily: 'monospace', fontSize: 12 }} />
            <button
              type="button"
              className="button button-primary"
              style={{ marginTop: 12, width: '100%' }}
              onClick={() => {
                navigator.clipboard?.writeText(embedCode)
                setCopiedEmbed(true)
                notify('Embed snippet copied!')
                window.setTimeout(() => setCopiedEmbed(false), 1500)
              }}
            >
              {copiedEmbed ? <Check size={14} /> : <Copy size={14} />} <span>Copy Embed HTML</span>
            </button>
          </div>
        </div>
      )}

      {showReport && (
        <div className="modal-backdrop" onClick={() => setShowReport(false)}>
          <div className="modal-card" style={{ width: 'min(480px, 92vw)', background: '#10121a', borderRadius: 16, padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Report Project</h3>
              <button type="button" onClick={() => setShowReport(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleReport} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} style={{ background: '#070910', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, padding: 10, color: '#f8fafc' }}>
                <option value="phishing">Phishing or fake login screen</option>
                <option value="malware">Malicious script or redirect</option>
                <option value="copyright">Copyright / unauthorized clone</option>
                <option value="harassment">Harassment or hate content</option>
                <option value="inappropriate">NSFW / inappropriate content</option>
                <option value="other">Other issue</option>
              </select>
              <textarea
                rows={3}
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Briefly describe the issue (optional)…"
                maxLength={500}
                style={{ background: '#070910', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, padding: 10, color: '#f8fafc' }}
              />
              <button type="submit" className="button button-primary" disabled={reporting}>
                {reporting ? 'Submitting…' : 'Submit Safety Report'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
