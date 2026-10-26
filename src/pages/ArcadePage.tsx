import React, { useState, useMemo } from 'react'
import {
  Play, ThumbsUp, Users, Search, Sparkles, Plus, ArrowLeft,
  Flame, Trophy, Gamepad2, X, Heart, Rocket, Compass, Filter
} from 'lucide-react'
import type { Game, User } from '../types'

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

interface RobloxExperience extends Game {
  activePlayers: string
  rating: number
  badge?: string
  isFeatured?: boolean
}

const ROBLOX_FEATURED_CATALOG: RobloxExperience[] = [
  {
    id: 'grandmaster-chess',
    title: 'Grandmaster Chess AI [RANKED]',
    creator: 'alex_chess',
    genre: 'STRATEGY',
    color: '#8b5cf6',
    art: '♟️',
    plays: '14.2k',
    activePlayers: '1,420',
    rating: 96,
    badge: 'TOP RATED',
    isFeatured: true,
    description: 'DOM-based chess engine with multi-level AI, legal move calculation, and captured piece graveyard.'
  },
  {
    id: 'neon-highway-2088',
    title: 'Neon Highway 2088 [TURBO]',
    creator: 'maya_speed',
    genre: 'ARCADE',
    color: '#ec4899',
    art: '🏎️',
    plays: '28.9k',
    activePlayers: '2,890',
    rating: 94,
    badge: 'POPULAR',
    isFeatured: true,
    description: 'High-speed retro highway racer with pseudo-3D perspective, synthesized synthwave engine rumble, and oncoming traffic.'
  },
  {
    id: 'cosmic-star-defender',
    title: 'Cosmic Star Defender [BOSS EVENT]',
    creator: 'leo_pilot',
    genre: 'ACTION',
    color: '#06b6d4',
    art: '🚀',
    plays: '19.4k',
    activePlayers: '1,940',
    rating: 98,
    badge: 'HOT',
    description: 'Vertical space shooter with procedural laser SFX, particle explosions, and dual keyboard/touch controls.'
  },
  {
    id: 'chambers-of-eldoria',
    title: 'Chambers of Eldoria RPG [DUNGEON]',
    creator: 'sam_rogue',
    genre: 'RPG',
    color: '#10b981',
    art: '⚔️',
    plays: '9.8k',
    activePlayers: '980',
    rating: 92,
    description: 'Turn-based tile dungeon crawler with procedural room generation, treasure chests, and monster combat.'
  },
  {
    id: 'quantum-block-drop',
    title: 'Quantum Block Drop [PHYSICS]',
    creator: 'zen_puzzle',
    genre: 'PUZZLE',
    color: '#f59e0b',
    art: '🧩',
    plays: '11.5k',
    activePlayers: '1,150',
    rating: 95,
    badge: 'TRENDING',
    description: 'Fluid physics-based block matching puzzle with Web Audio chimes and satisfying combo multipliers.'
  },
  {
    id: 'pixel-obby-escape',
    title: 'Escape the Tower of Neon [OBBY]',
    creator: 'jump_king',
    genre: 'PLATFORMER',
    color: '#3b82f6',
    art: '🏃',
    plays: '34.1k',
    activePlayers: '3,410',
    rating: 93,
    badge: 'TOP OBBY',
    description: 'Precision jumping course with moving platforms, laser obstacles, and checkpoint respawn flagpoles.'
  },
  {
    id: 'slime-harvest-sim',
    title: 'Slime Valley Simulator [TYCOON]',
    creator: 'builder_dan',
    genre: 'SIMULATOR',
    color: '#14b8a6',
    art: '🧪',
    plays: '22.0k',
    activePlayers: '2,200',
    rating: 97,
    badge: 'NEW',
    description: 'Harvest and synthesize colorful slime pets, unlock automated generators, and expand your floating island.'
  },
  {
    id: 'midnight-drift-club',
    title: 'Midnight City Drift [NIGHT RUN]',
    creator: 'tokyo_drift',
    genre: 'ARCADE',
    color: '#e11d48',
    art: '🏁',
    plays: '16.7k',
    activePlayers: '1,670',
    rating: 91,
    description: 'Nighttime drift physics simulation with screeching tires, neon track reflections, and lap time leaderboards.'
  }
]

export default function ArcadePage({
  user,
  games,
  onSelectGame,
  onOpenStudio,
  setPage,
  notify
}: ArcadePageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGenre, setSelectedGenre] = useState('ALL')
  const [selectedSort, setSelectedSort] = useState<'POPULAR' | 'RATING' | 'NEW'>('POPULAR')
  const [featuredIndex, setFeaturedIndex] = useState(0)
  const [favoritedGames, setFavoritedGames] = useState<Set<string>>(new Set())

  // Merge real server games with catalog
  const allCatalog: RobloxExperience[] = useMemo(() => {
    const serverMapped: RobloxExperience[] = games.map((g, idx) => ({
      ...g,
      activePlayers: String(Math.floor(100 + (idx * 37) % 850)),
      rating: 90 + ((idx * 7) % 9),
      badge: idx === 0 ? 'COMMUNITY' : undefined
    }))

    // Deduplicate by ID
    const map = new Map<string, RobloxExperience>()
    serverMapped.forEach(g => map.set(g.id, g))
    ROBLOX_FEATURED_CATALOG.forEach(g => {
      if (!map.has(g.id)) map.set(g.id, g)
    })
    return Array.from(map.values())
  }, [games])

  // Filtered experiences
  const filteredExperiences = useMemo(() => {
    return allCatalog.filter(g => {
      const matchSearch =
        searchQuery === '' ||
        g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.creator.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.description.toLowerCase().includes(searchQuery.toLowerCase())
      const matchGenre =
        selectedGenre === 'ALL' || g.genre.toUpperCase() === selectedGenre.toUpperCase()
      return matchSearch && matchGenre
    }).sort((a, b) => {
      if (selectedSort === 'RATING') return b.rating - a.rating
      if (selectedSort === 'NEW') return b.id.localeCompare(a.id)
      return parseInt(b.activePlayers.replace(/,/g, '')) - parseInt(a.activePlayers.replace(/,/g, ''))
    })
  }, [allCatalog, searchQuery, selectedGenre, selectedSort])

  const trendingList = useMemo(() => {
    return [...allCatalog].sort((a, b) => parseInt(b.activePlayers.replace(/,/g, '')) - parseInt(a.activePlayers.replace(/,/g, ''))).slice(0, 6)
  }, [allCatalog])

  const topRatedList = useMemo(() => {
    return [...allCatalog].sort((a, b) => b.rating - a.rating).slice(0, 6)
  }, [allCatalog])

  const featuredGame = allCatalog[featuredIndex] || allCatalog[0]

  const toggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setFavoritedGames(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        notify('Removed from favorites')
      } else {
        next.add(id)
        notify('Added to favorites ⭐')
      }
      return next
    })
  }

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
            <button className="roblox-nav-link" onClick={() => setSelectedSort('POPULAR')}>
              <Flame size={14} />
              <span>Charts</span>
            </button>
            <button className="roblox-nav-link" onClick={() => onOpenStudio()}>
              <Rocket size={14} />
              <span>Create</span>
            </button>
          </nav>
        </div>

        {/* Center Search Bar */}
        <div className="roblox-search-wrap">
          <Search size={16} className="roblox-search-icon" />
          <input
            type="text"
            placeholder="Search experiences, obbies, sims, and creators..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="roblox-search-clear" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Right User Actions */}
        <div className="roblox-topbar-right">
          <div className="roblox-currency-pill" title="Arcade Tokens">
            <span className="currency-gem">✦</span>
            <span>750</span>
          </div>

          <button className="roblox-create-btn" onClick={() => onOpenStudio()}>
            <Plus size={15} />
            <span>Studio</span>
          </button>

          {user ? (
            <button className="roblox-user-avatar" onClick={() => setPage('profile')}>
              <span className="roblox-avatar-char">{user.username[0]?.toUpperCase()}</span>
              <span className="roblox-username-label">@{user.username}</span>
            </button>
          ) : (
            <button className="roblox-login-btn" onClick={() => setPage('login')}>
              Log In
            </button>
          )}
        </div>
      </header>

      {/* 2. Horizontal Genre Chips Carousel */}
      <div className="roblox-genre-strip">
        <div className="roblox-genre-container">
          {['ALL', 'ACTION', 'ARCADE', 'STRATEGY', 'RPG', 'PUZZLE', 'PLATFORMER', 'SIMULATOR'].map(genre => (
            <button
              key={genre}
              className={`roblox-genre-chip ${selectedGenre === genre ? 'active' : ''}`}
              onClick={() => setSelectedGenre(genre)}
            >
              {genre === 'ALL' && <Compass size={13} />}
              {genre === 'ACTION' && <Flame size={13} />}
              {genre === 'ARCADE' && <Gamepad2 size={13} />}
              {genre === 'PLATFORMER' && <Rocket size={13} />}
              {genre === 'STRATEGY' && <Trophy size={13} />}
              <span>{genre}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="roblox-arcade-content">
        {/* 3. Hero Experience Spotlight Banner (Featured Game) */}
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
                  <Sparkles size={12} /> FEATURED EXPERIENCE
                </span>
                <span className="spotlight-tag-live">
                  <Users size={12} /> {featuredGame.activePlayers} Playing
                </span>
                <span className="spotlight-tag-rating">
                  <ThumbsUp size={12} /> {featuredGame.rating}%
                </span>
              </div>

              <h1 className="spotlight-title">{featuredGame.title}</h1>
              <p className="spotlight-desc">{featuredGame.description}</p>
              <div className="spotlight-meta">
                <span className="spotlight-creator">By <b>@{featuredGame.creator}</b></span>
                <span className="spotlight-genre">{featuredGame.genre}</span>
              </div>

              <div className="spotlight-cta-row">
                <button
                  className="roblox-play-btn-large"
                  onClick={() => onSelectGame(featuredGame)}
                >
                  <Play size={20} fill="currentColor" />
                  <span>Play Experience</span>
                </button>

                <button
                  className={`roblox-fav-btn ${favoritedGames.has(featuredGame.id) ? 'favorited' : ''}`}
                  onClick={(e) => toggleFavorite(e, featuredGame.id)}
                  title="Favorite experience"
                >
                  <Heart size={18} fill={favoritedGames.has(featuredGame.id) ? 'currentColor' : 'none'} />
                </button>

                <div className="spotlight-cycle-dots">
                  {allCatalog.slice(0, 3).map((_, idx) => (
                    <button
                      key={idx}
                      className={`cycle-dot ${featuredIndex === idx ? 'active' : ''}`}
                      onClick={() => setFeaturedIndex(idx)}
                      aria-label={`Show featured game ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 4. Filter & Search Results Controls Bar */}
        <div className="roblox-results-bar">
          <div className="results-info">
            <h2>{searchQuery ? `Search Results for "${searchQuery}"` : selectedGenre === 'ALL' ? 'All Experiences' : `${selectedGenre} Experiences`}</h2>
            <span className="results-count">{filteredExperiences.length} experiences</span>
          </div>

          <div className="results-sort">
            <span className="sort-label"><Filter size={13} /> Sort:</span>
            <select
              value={selectedSort}
              onChange={e => setSelectedSort(e.target.value as any)}
              className="roblox-sort-select"
            >
              <option value="POPULAR">Most Popular</option>
              <option value="RATING">Top Rated</option>
              <option value="NEW">Recently Added</option>
            </select>
          </div>
        </div>

        {/* 5. Trending Horizontal Row (when no search active) */}
        {!searchQuery && selectedGenre === 'ALL' && (
          <section className="roblox-section-row">
            <div className="roblox-section-header">
              <div className="section-title-wrap">
                <Flame size={18} className="text-flame" />
                <h3>Popular & Trending Right Now</h3>
              </div>
              <span className="section-see-all">See All ›</span>
            </div>

            <div className="roblox-cards-row">
              {trendingList.map(game => (
                <RobloxGameCard
                  key={game.id}
                  game={game}
                  isFavorited={favoritedGames.has(game.id)}
                  onToggleFav={(e) => toggleFavorite(e, game.id)}
                  onClick={() => onSelectGame(game)}
                />
              ))}
            </div>
          </section>
        )}

        {/* 6. Top Rated Horizontal Row (when no search active) */}
        {!searchQuery && selectedGenre === 'ALL' && (
          <section className="roblox-section-row">
            <div className="roblox-section-header">
              <div className="section-title-wrap">
                <Trophy size={18} className="text-trophy" />
                <h3>Top Rated by Community</h3>
              </div>
              <span className="section-see-all">See All ›</span>
            </div>

            <div className="roblox-cards-row">
              {topRatedList.map(game => (
                <RobloxGameCard
                  key={game.id}
                  game={game}
                  isFavorited={favoritedGames.has(game.id)}
                  onToggleFav={(e) => toggleFavorite(e, game.id)}
                  onClick={() => onSelectGame(game)}
                />
              ))}
            </div>
          </section>
        )}

        {/* 7. Main Grid of Experiences */}
        <section className="roblox-main-grid-section">
          {(!searchQuery && selectedGenre === 'ALL') && (
            <div className="roblox-section-header">
              <div className="section-title-wrap">
                <Gamepad2 size={18} className="text-gamepad" />
                <h3>Explore All Experiences</h3>
              </div>
            </div>
          )}

          {filteredExperiences.length > 0 ? (
            <div className="roblox-games-grid">
              {filteredExperiences.map(game => (
                <RobloxGameCard
                  key={game.id}
                  game={game}
                  isFavorited={favoritedGames.has(game.id)}
                  onToggleFav={(e) => toggleFavorite(e, game.id)}
                  onClick={() => onSelectGame(game)}
                />
              ))}
            </div>
          ) : (
            <div className="roblox-empty-state">
              <Gamepad2 size={44} className="empty-icon" />
              <h3>No experiences found</h3>
              <p>Try searching with another keyword or change your genre filter.</p>
              <button
                className="roblox-reset-btn"
                onClick={() => {
                  setSearchQuery('')
                  setSelectedGenre('ALL')
                }}
              >
                Clear Search & Filters
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Roblox-style Footer */}
      <footer className="roblox-footer">
        <div className="roblox-footer-container">
          <div className="footer-left">
            <span className="roblox-logo-small">❖</span>
            <span>Yulya Arcade • A Roblox-inspired web game discovery engine</span>
          </div>
          <div className="footer-links">
            <button onClick={() => setPage('home')}>Return to Studio</button>
            <button onClick={() => onOpenStudio()}>Create Experience</button>
          </div>
        </div>
      </footer>
    </div>
  )
}

function RobloxGameCard({
  game,
  isFavorited,
  onToggleFav,
  onClick
}: {
  game: RobloxExperience
  isFavorited: boolean
  onToggleFav: (e: React.MouseEvent) => void
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

        {/* Badges */}
        {game.badge && (
          <span className="thumb-badge">{game.badge}</span>
        )}

        <div className="thumb-active-players">
          <Users size={11} />
          <span>{game.activePlayers}</span>
        </div>

        {/* Hover overlay with iconic Roblox-green play button */}
        <div className="thumb-hover-overlay">
          <button className="roblox-instant-play-btn" aria-label="Play game">
            <Play size={20} fill="#ffffff" />
          </button>
        </div>

        <button
          className={`thumb-fav-btn ${isFavorited ? 'active' : ''}`}
          onClick={onToggleFav}
          aria-label="Favorite"
        >
          <Heart size={14} fill={isFavorited ? '#ec4899' : 'none'} color={isFavorited ? '#ec4899' : '#ffffff'} />
        </button>
      </div>

      <div className="roblox-card-info">
        <h4 className="roblox-card-title">{game.title}</h4>

        <div className="roblox-card-metrics">
          <div className="metric-rating">
            <ThumbsUp size={12} className="thumbs-up-icon" />
            <span>{game.rating}%</span>
          </div>
          <span className="metric-dot">•</span>
          <span className="metric-creator">by @{game.creator}</span>
        </div>
      </div>
    </article>
  )
}
