import { useState, useRef, useEffect } from 'react'
import {
  User as UserIcon, LogIn, UserPlus, LogOut,
  Sparkles, Gamepad2, ArrowRight, Code2
} from 'lucide-react'
import type { User, Page } from '../types'

interface ProfileMenuProps {
  user: User | null
  setPage: (page: Page) => void
  onLogout: () => void
  onOpenStudio?: () => void
}

export default function ProfileMenu({
  user,
  setPage,
  onLogout,
  onOpenStudio
}: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const navigateTo = (page: Page) => {
    setIsOpen(false)
    setPage(page)
  }

  return (
    <div className="profile-menu-container" ref={menuRef}>
      {/* 1. The Circular Profile Trigger Button */}
      {user ? (
        <button
          className={`profile-round-avatar ${isOpen ? 'active-ring' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          aria-label={`Open profile menu for @${user.username}`}
          title={`@${user.username} (Click to open profile)`}
        >
          {user.avatar ? (
            <img src={user.avatar} alt={user.username} className="avatar-img-circle" />
          ) : (
            <span className="avatar-text-circle">
              {user.username[0]?.toUpperCase()}
            </span>
          )}
          <span className="avatar-online-dot" />
        </button>
      ) : (
        <button
          className={`profile-round-guest ${isOpen ? 'active-ring' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Account menu"
          title="Sign in or create account"
        >
          <UserIcon size={17} className="guest-icon" />
        </button>
      )}

      {/* 2. Zoom-in Profile Popover Menu */}
      {isOpen && (
        <div className="profile-popover-menu animate-zoom-in" role="dialog" aria-modal="true">
          {user ? (
            /* --- LOGGED IN VIEW --- */
            <div className="popover-logged-in">
              <div className="popover-user-card" onClick={() => navigateTo('profile')}>
                <div className="popover-avatar-large">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.username} />
                  ) : (
                    <span>{user.username[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div className="popover-user-meta">
                  <span className="popover-username">@{user.username}</span>
                  <span className="popover-email">{user.email}</span>
                  <span className="popover-badge">CREATOR</span>
                </div>
              </div>

              <div className="popover-divider" />

              <div className="popover-actions-list">
                <button className="popover-item" onClick={() => navigateTo('profile')}>
                  <UserIcon size={15} className="text-lilac" />
                  <span>My Profile & Projects</span>
                  <ArrowRight size={13} className="item-arrow" />
                </button>

                <button
                  className="popover-item"
                  onClick={() => {
                    setIsOpen(false)
                    if (onOpenStudio) onOpenStudio()
                    else setPage('studio')
                  }}
                >
                  <Code2 size={15} className="text-mint" />
                  <span>Open Studio IDE</span>
                  <ArrowRight size={13} className="item-arrow" />
                </button>

                <button className="popover-item" onClick={() => navigateTo('arcade')}>
                  <Gamepad2 size={15} className="text-peach" />
                  <span>Roblox Arcade</span>
                  <ArrowRight size={13} className="item-arrow" />
                </button>
              </div>

              <div className="popover-divider" />

              <button
                className="popover-item popover-logout"
                onClick={() => {
                  setIsOpen(false)
                  onLogout()
                }}
              >
                <LogOut size={15} />
                <span>Log Out</span>
              </button>
            </div>
          ) : (
            /* --- NOT LOGGED IN VIEW --- */
            <div className="popover-guest">
              <div className="guest-header">
                <div className="guest-header-icon">
                  <Sparkles size={18} />
                </div>
                <h4>Welcome to Yulya</h4>
                <p>Sign in to create, save, and publish your browser games.</p>
              </div>

              <div className="guest-actions">
                <button
                  className="button button-primary guest-btn"
                  onClick={() => navigateTo('login')}
                >
                  <LogIn size={15} />
                  <span>Log In</span>
                </button>

                <button
                  className="button button-outline guest-btn"
                  onClick={() => navigateTo('register')}
                >
                  <UserPlus size={15} />
                  <span>Create Account</span>
                </button>
              </div>

              <div className="popover-divider" />

              <button
                className="popover-item quiet-link"
                onClick={() => navigateTo('arcade')}
              >
                <Gamepad2 size={14} className="text-mint" />
                <span>Play games as guest in Arcade</span>
                <ArrowRight size={12} className="item-arrow" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
