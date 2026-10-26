import React, { useState, useMemo } from 'react'
import {
  Play, Search, Plus, ArrowLeft,
  Gamepad2, X, Filter, Compass, Sparkles
} from 'lucide-react'
import type { Game, User } from '../types'
import ProfileMenu from '../components/ProfileMenu'

interface ArcadePageProps {
  user: User | null
  games: Game[]
  onSelectGame: (game: Game) => void
  onOpenStudio: (game?: Game) => void
  setPage: (page: 'home' | 'arcade' | 'studio' | 'login' | 'register' | 'profile') => void
  notify: (msg: string) => void
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
  setPage
}: ArcadePageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGenre, setSelectedGenre] = useState('ALL')
  const [selectedSort, setSelectedSort] = useState<'PLAYS' | 'NEWEST' | 'TITLE'>('PLAYS')
  const [featuredIndex, setFeaturedIndex] = useState(0)

  // Dynamically extract genres only from real games
  const availableGenres = useMemo(() => {
    const genres = Array.from(new Set(games.map(g => g.genre.toUpperCase()).filter(Boolean)))
    return ['ALL', ...genres]
  }, [games])

  // Filter and sort the real games list
  const filteredGames = useMemo(() => {
    return games
      .filter(g => {
        const query = searchQuery.trim().toLowerCase()
        const matchSearch =
          query === '' ||
          g.title.toLowerCase().includes(query) ||
          g.creator.toLowerCase().includes(query) ||
          g.description.toLowerCase().includes(query)
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
        if (selectedSort === 'NEWEST') return b.id.localeCompare(a.id)
        return a.title.localeCompare(b.title)
      })
  }, [games, searchQuery, selectedGenre, selectedSort])

  const featuredGame = games.length > 0 ? games[featuredIndex % games.length] : null

  return (
    <div className="roblox-arcade-shell">
      {/* 1. Roblox-style Main Top Navigation Bar */}
      <header className="roblox-topbar">
        <div className="roblox-topbar-left">
          <button className="roblox-back-btn" onClick={() => setPage('home')}>
            <ArrowLeft size={16} />
            <span>Home</span>
          </button>
          <div className="roblox-brand-wrap" onClick={() => setPage('home')}>
            <span className="roblox-logo-icon">❖</span>
            <span className="roblox-brand-name">YULYA<span className="roblox-brand-highlight">ARCADE</span></span>
          </div>
          <nav className="roblox-subnav">
            <button className="roblox-nav-link active">
              <Compass size={14} />
              <span>Discover</span>
            </button>
            <button className="roblox-nav-link" onClick={() => onOpenStudio()}>
              <Plus size={14} />
              <span>Create</span>
            </button>
          </nav>
        </div>

        {/* Center Real Search Bar */}
        <div className="roblox-search-wrap">
          <Search size={16} className="roblox-search-icon" />
          <input
            type="text"
            placeholder="Search experiences by title, creator, or description..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="roblox-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Right User Actions with Zoom-in Profile Menu */}
        <div className="roblox-topbar-right">
          <button className="roblox-create-btn" onClick={() => onOpenStudio()}>
            <Plus size={15} />
            <span>Studio</span>
          </button>
          <ProfileMenu
            user={user}
            setPage={setPage as any}
            onLogout={() => { setPage('home') }}
            onOpenStudio={() => onOpenStudio()}
          />
        </div>
      </header>

      {/* 2. Genre Chips Bar (Derived from Real Games) */}
      {availableGenres.length > 1 && (
        <div className="roblox-genre-strip">
          <div className="roblox-genre-container">
            {availableGenres.map(genre => (
              <button
                key={genre}
                className={`roblox-genre-chip ${selectedGenre === genre ? 'active' : ''}`}
                onClick={() => setSelectedGenre(genre)}
              >
                {genre === 'ALL' && <Compass size={13} />}
                <span>{genre}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="roblox-arcade-content">
        {/* 3. Hero Spotlight Banner (Only for real games) */}
        {!searchQuery && selectedGenre === 'ALL' && featuredGame && (
          <section className="roblox-spotlight-hero">
            <div
              className="spotlight-poster-bg"
              style={{ '--spotlight-color': featuredGame.color } as React.CSSProperties}
            >
              <div className="spotlight-emoji-backdrop">{featuredGame.art}</div>
              <div className="spotlight-gradient-overlay" />
            </div>

            <div className="spotlight-content">
              <div className="spotlight-badges">
                <span className="spotlight-tag-featured">
                  <Sparkles size={12} /> COMMUNITY SPOTLIGHT
                </span>
                <span className="spotlight-tag-live">
                  <Play size={11} fill="currentColor" /> {featuredGame.plays} Plays
                </span>
                <span className="spotlight-genre">{featuredGame.genre}</span>
              </div>

              <h1 className="spotlight-title">{featuredGame.title}</h1>
              <p className="spotlight-desc">{featuredGame.description}</p>
              <div className="spotlight-meta">
                <span className="spotlight-creator">Created by <b>@{featuredGame.creator}</b></span>
              </div>

              <div className="spotlight-cta-row">
                <button
                  className="roblox-play-btn-large"
                  onClick={() => onSelectGame(featuredGame)}
                >
                  <Play size={20} fill="currentColor" />
                  <span>Play Experience</span>
                </button>

                {games.length > 1 && (
                  <div className="spotlight-cycle-dots">
                    {games.slice(0, 5).map((_, idx) => (
                      <button
                        key={idx}
                        className={`cycle-dot ${featuredIndex === idx ? 'active' : ''}`}
                        onClick={() => setFeaturedIndex(idx)}
                        aria-label={`Show game ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 4. Results Bar & Sorting */}
        <div className="roblox-results-bar">
          <div className="results-info">
            <h2>
              {searchQuery
                ? `Search: "${searchQuery}"`
                : selectedGenre === 'ALL'
                ? 'All Experiences'
                : `${selectedGenre} Experiences`}
            </h2>
            <span className="results-count">
              {filteredGames.length} {filteredGames.length === 1 ? 'experience' : 'experiences'}
            </span>
          </div>

          {games.length > 1 && (
            <div className="results-sort">
              <span className="sort-label"><Filter size={13} /> Sort:</span>
              <select
                value={selectedSort}
                onChange={e => setSelectedSort(e.target.value as any)}
                className="roblox-sort-select"
              >
                <option value="PLAYS">Most Plays</option>
                <option value="TITLE">Title (A-Z)</option>
                <option value="NEWEST">Newest</option>
              </select>
            </div>
          )}
        </div>

        {/* 5. Real Games Grid */}
        <section className="roblox-main-grid-section">
          {filteredGames.length > 0 ? (
            <div className="roblox-games-grid">
              {filteredGames.map(game => (
                <RobloxGameCard
                  key={game.projectId ?? game.id}
                  game={game}
                  onClick={() => onSelectGame(game)}
                />
              ))}
            </div>
          ) : (
            <div className="roblox-empty-state">
              <Gamepad2 size={44} className="empty-icon" />
              <h3>{games.length === 0 ? 'No public experiences yet' : 'No experiences found'}</h3>
              <p>
                {games.length === 0
                  ? 'Be the first creator to build and publish a game in Yulya Studio.'
                  : 'Try searching with another keyword or change your genre filter.'}
              </p>
              {games.length === 0 ? (
                <button className="roblox-create-btn" onClick={() => onOpenStudio()}>
                  <Plus size={15} />
                  <span>Open Studio & Create Experience</span>
                </button>
              ) : (
                <button
                  className="roblox-reset-btn"
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedGenre('ALL')
                  }}
                >
                  Clear Search & Filter
                </button>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="roblox-footer">
        <div className="roblox-footer-container">
          <div className="footer-left">
            <span className="roblox-logo-small">❖</span>
            <span>Yulya Arcade • Public Community Experiences</span>
          </div>
          <div className="footer-links">
            <button onClick={() => setPage('home')}>Return to Home</button>
            <button onClick={() => onOpenStudio()}>Create Experience</button>
          </div>
        </div>
      </footer>
    </div>
  )
}

function RobloxGameCard({
  game,
  onClick
}: {
  game: Game
  onClick: () => void
}) {
  return (
    <article
      className="roblox-card"
      onClick={onClick}
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div
        className="roblox-card-thumb"
        style={{ '--thumb-color': game.color } as React.CSSProperties}
      >
        <div className="thumb-art-emoji">{game.art}</div>
        <div className="thumb-stars-watermark">✦ · ✧</div>

        {/* Real Genre Badge */}
        <span className="thumb-badge">{game.genre}</span>

        {/* Real Plays Counter */}
        <div className="thumb-active-players">
          <Play size={10} fill="currentColor" />
          <span>{game.plays} plays</span>
        </div>

        {/* Hover overlay with Roblox-green play button */}
        <div className="thumb-hover-overlay">
          <button className="roblox-instant-play-btn" aria-label={`Play ${game.title}`}>
            <Play size={20} fill="#ffffff" />
          </button>
        </div>
      </div>

      <div className="roblox-card-info">
        <h4 className="roblox-card-title">{game.title}</h4>

        <div className="roblox-card-metrics">
          <span className="metric-creator">by @{game.creator}</span>
        </div>
      </div>
    </article>
  )
}
