import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  Play, Search, Plus, ArrowLeft, Layers, Heart,
  Gamepad2, X, Compass, BookOpen, ChevronLeft, ChevronRight,
  ArrowUpRight, Mail, Flame, Clock, SortAsc
} from 'lucide-react'
import type { Game, User, Page } from '../types'
import ProfileMenu from '../components/ProfileMenu'

interface ArcadePageProps {
  user: User | null
  games: Game[]
  onSelectGame: (game: Game) => void
  onTrackPlay?: (username: string, slug: string) => void
  onOpenStudio: (game?: Game) => void
  onLogout: () => void
  setPage: (page: Page, customPath?: string) => void
  notify: (msg: string) => void
  onLogin?: (user: User, csrf: string) => void
  modal: string | null
  currentGame: Game | null
  setModal: (modal: any) => void
  toast: string
}

export default function ArcadePage({
  user,
  games,
  onSelectGame,
  onOpenStudio,
  onLogout,
  setPage,
  onLogin,
  notify
}: ArcadePageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGenre, setSelectedGenre] = useState('ALL')
  const [selectedSort, setSelectedSort] = useState<'PLAYS' | 'LIKES' | 'NEWEST' | 'TITLE'>('PLAYS')
  const [featuredIndex, setFeaturedIndex] = useState(0)
  const searchRef = useRef<HTMLInputElement | null>(null)

  // Keyboard "/" focuses search cleanly
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const availableGenres = useMemo(() => {
    const genres = Array.from(new Set(games.map(g => (g.genre || 'ARCADE').toUpperCase()).filter(Boolean)))
    return ['ALL', ...genres]
  }, [games])

  const filteredGames = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return games
      .filter(g => {
        const matchSearch =
          !query ||
          g.title.toLowerCase().includes(query) ||
          g.creator.toLowerCase().includes(query) ||
          g.description.toLowerCase().includes(query) ||
          g.genre.toLowerCase().includes(query)
        const matchGenre =
          selectedGenre === 'ALL' || g.genre.toUpperCase() === selectedGenre.toUpperCase()
        return matchSearch && matchGenre
      })
      .sort((a, b) => {
        if (selectedSort === 'PLAYS') {
          const playsA = parseFloat(String(a.plays).replace(/[^0-9.]/g, '')) || 0
          const playsB = parseFloat(String(b.plays).replace(/[^0-9.]/g, '')) || 0
          return playsB - playsA
        }
        if (selectedSort === 'LIKES') {
          return (b.likes_count || 0) - (a.likes_count || 0)
        }
        if (selectedSort === 'NEWEST') return b.id.localeCompare(a.id)
        return a.title.localeCompare(b.title)
      })
  }, [games, searchQuery, selectedGenre, selectedSort])

  const spotlightList = useMemo(() => {
    return [...games]
      .sort((a, b) => (parseFloat(String(b.plays)) || 0) - (parseFloat(String(a.plays)) || 0))
      .slice(0, 5)
  }, [games])

  const featuredGame = spotlightList.length > 0 ? spotlightList[featuredIndex % spotlightList.length] : null

  const openCreator = (e: React.MouseEvent, creator: string) => {
    e.stopPropagation()
    setPage('profile', `/@${encodeURIComponent(creator)}`)
  }

  return (
    <div className="arc-shell">
      {/* Top Navigation */}
      <header className="arc-topbar">
        <div className="arc-topbar-left">
          <button className="arc-icon-back" onClick={() => setPage('home')} aria-label="Back to Home" title="Home">
            <ArrowLeft size={15} />
          </button>
          <button className="arc-brand" onClick={() => setPage('home')}>
            <span className="brand-mark">✳</span>
            <span>yulya<span className="brand-light">arcade</span></span>
          </button>
          <nav className="arc-nav" aria-label="Arcade navigation">
            <button className="arc-nav-item active"><Compass size={14} /><span>Discover</span></button>
            <button className="arc-nav-item" onClick={() => setPage('templates')}><Layers size={14} /><span>Templates</span></button>
            <button className="arc-nav-item" onClick={() => setPage('docs')}><BookOpen size={14} /><span>Docs</span></button>
          </nav>
        </div>

        <div className="arc-search-wrap">
          <Search size={14} className="arc-search-icon" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search games, tools, or @creators… (/)"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search Arcade"
          />
          {searchQuery && (
            <button className="arc-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="arc-topbar-right">
          <button className="button button-alabaster button-small arc-studio-btn" onClick={() => onOpenStudio()}>
            <Plus size={14} />
            <span>Build</span>
          </button>
          <ProfileMenu
            user={user}
            setPage={setPage as any}
            onLogin={onLogin}
            notify={notify}
            onLogout={onLogout}
            onOpenStudio={() => onOpenStudio()}
          />
        </div>
      </header>

      <main className="arc-main">
        {/* Split-Stage Editorial Featured Showcase */}
        {!searchQuery && selectedGenre === 'ALL' && featuredGame && (
          <section className="arc-spotlight" aria-label="Featured Experience">
            <div className="arc-spotlight-media" onClick={() => onSelectGame(featuredGame)}>
              {featuredGame.thumbnail ? (
                <img src={featuredGame.thumbnail} alt={featuredGame.title} className="arc-spotlight-img" />
              ) : (
                <div className="arc-spotlight-placeholder">
                  <span className="arc-placeholder-monogram">{featuredGame.title.slice(0, 2).toUpperCase()}</span>
                  <span className="arc-placeholder-sub">{featuredGame.genre} · Playable Sandbox</span>
                </div>
              )}
              <div className="arc-spotlight-play-chip">
                <Play size={14} fill="currentColor" />
                <span>Play Now</span>
              </div>
            </div>

            <div className="arc-spotlight-info">
              <div className="arc-spotlight-meta-row">
                <span className="arc-genre-tag">{featuredGame.genre}</span>
                <span className="arc-stat-chip tabular-count">
                  <Play size={11} fill="currentColor" /> {featuredGame.plays} plays
                </span>
                {typeof featuredGame.likes_count === 'number' && featuredGame.likes_count > 0 && (
                  <span className="arc-stat-chip tabular-count">
                    <Heart size={11} /> {featuredGame.likes_count}
                  </span>
                )}
              </div>

              <h1 className="arc-spotlight-title">{featuredGame.title}</h1>
              <p className="arc-spotlight-desc">
                {featuredGame.description || 'Interactive browser experience built and published directly in Yulya Studio.'}
              </p>

              <div className="arc-spotlight-creator-row">
                <span>Built by</span>
                <button
                  type="button"
                  className="arc-creator-link"
                  onClick={(e) => openCreator(e, featuredGame.creator)}
                >
                  @{featuredGame.creator}
                </button>
              </div>

              <div className="arc-spotlight-actions">
                <button className="button button-alabaster" onClick={() => onSelectGame(featuredGame)}>
                  <Play size={15} fill="currentColor" />
                  <span>Launch Experience</span>
                </button>

                {spotlightList.length > 1 && (
                  <div className="arc-carousel-controls">
                    <button
                      type="button"
                      className="arc-carousel-btn"
                      onClick={() => setFeaturedIndex((i) => (i - 1 + spotlightList.length) % spotlightList.length)}
                      aria-label="Previous featured project"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="arc-carousel-counter tabular-count">
                      {(featuredIndex % spotlightList.length) + 1} / {spotlightList.length}
                    </span>
                    <button
                      type="button"
                      className="arc-carousel-btn"
                      onClick={() => setFeaturedIndex((i) => (i + 1) % spotlightList.length)}
                      aria-label="Next featured project"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Filter Bar + Sort Pills */}
        <section className="arc-controls-bar" aria-label="Filter and sort experiences">
          <div className="arc-genre-tabs">
            {availableGenres.map((genre) => (
              <button
                key={genre}
                type="button"
                className={`arc-genre-btn ${selectedGenre === genre ? 'active' : ''}`}
                onClick={() => setSelectedGenre(genre)}
              >
                {genre}
              </button>
            ))}
          </div>

          <div className="arc-sort-group">
            <span className="arc-count-label tabular-count">
              {filteredGames.length} {filteredGames.length === 1 ? 'experience' : 'experiences'}
            </span>
            <div className="arc-sort-pills" role="group" aria-label="Sort order">
              <button type="button" className={`arc-sort-pill ${selectedSort === 'PLAYS' ? 'active' : ''}`} onClick={() => setSelectedSort('PLAYS')}>
                <Flame size={12} /> Popular
              </button>
              <button type="button" className={`arc-sort-pill ${selectedSort === 'LIKES' ? 'active' : ''}`} onClick={() => setSelectedSort('LIKES')}>
                <Heart size={12} /> Top Liked
              </button>
              <button type="button" className={`arc-sort-pill ${selectedSort === 'NEWEST' ? 'active' : ''}`} onClick={() => setSelectedSort('NEWEST')}>
                <Clock size={12} /> Newest
              </button>
              <button type="button" className={`arc-sort-pill ${selectedSort === 'TITLE' ? 'active' : ''}`} onClick={() => setSelectedSort('TITLE')}>
                <SortAsc size={12} /> A–Z
              </button>
            </div>
          </div>
        </section>

        {/* Main 16:9 Games Grid */}
        <section className="arc-grid-section">
          {filteredGames.length > 0 ? (
            <div className="arc-grid">
              {filteredGames.map((game) => (
                <article
                  key={game.projectId ?? game.id}
                  className="arc-card"
                  onClick={() => onSelectGame(game)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onSelectGame(game)}
                >
                  <div className="arc-card-media">
                    {game.thumbnail ? (
                      <img src={game.thumbnail} alt={game.title} className="arc-card-img" loading="lazy" />
                    ) : (
                      <div className="arc-card-fallback">
                        <span className="arc-fallback-abbr">{game.title.slice(0, 2).toUpperCase()}</span>
                        <span className="arc-fallback-slug">/{game.id}</span>
                      </div>
                    )}
                    <span className="arc-card-genre">{game.genre}</span>
                    <div className="arc-card-hover">
                      <span className="arc-hover-launch">
                        <Play size={14} fill="currentColor" /> Play
                      </span>
                    </div>
                  </div>

                  <div className="arc-card-body">
                    <h3 className="arc-card-title">{game.title}</h3>
                    <p className="arc-card-desc">{game.description || 'Playable browser experience on Yulya Studio.'}</p>
                    <div className="arc-card-footer">
                      <button
                        type="button"
                        className="arc-card-creator"
                        onClick={(e) => openCreator(e, game.creator)}
                      >
                        @{game.creator}
                      </button>
                      <div className="arc-card-stats tabular-count">
                        <span><Play size={10} fill="currentColor" /> {game.plays}</span>
                        {typeof game.likes_count === 'number' && game.likes_count > 0 && (
                          <span><Heart size={10} /> {game.likes_count}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="arc-empty">
              <Gamepad2 size={32} />
              <h3>{games.length === 0 ? 'No public experiences yet' : 'No matching experiences'}</h3>
              <p>
                {games.length === 0
                  ? 'Publish your first playable project from Yulya Studio to appear on the Community Arcade.'
                  : 'Try a different keyword or reset your category filter.'}
              </p>
              {games.length === 0 ? (
                <button className="button button-alabaster" onClick={() => onOpenStudio()}>
                  <Plus size={15} /> Open Studio &amp; Build
                </button>
              ) : (
                <button className="button button-outline" onClick={() => { setSearchQuery(''); setSelectedGenre('ALL') }}>
                  Reset Filters
                </button>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="arc-footer">
        <div className="arc-footer-inner">
          <div className="arc-footer-left">
            <span className="brand-mark">✳</span>
            <span>Yulya Arcade · Isolated Sandbox on <code>play.yulya.me</code></span>
          </div>
          <div className="arc-footer-links">
            <button type="button" onClick={() => setPage('home')}>Home</button>
            <button type="button" onClick={() => setPage('docs')}>Docs</button>
            <button type="button" onClick={() => setPage('terms')}>Terms</button>
            <button type="button" onClick={() => setPage('privacy')}>Privacy</button>
            <a href="mailto:support@yulya.me"><Mail size={12} /> support@yulya.me</a>
            <a href="https://moheith.tech" target="_blank" rel="noreferrer">moheith.tech <ArrowUpRight size={11} /></a>
          </div>
        </div>
      </footer>
    </div>
  )
}
