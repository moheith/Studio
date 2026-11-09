import { useState, useMemo, useEffect } from 'react'
import type * as React from 'react'
import {
  BookOpen, Search, Code2, Terminal, Gamepad2, Sparkles, Cpu, KeyRound,
  ShieldCheck, HelpCircle, ExternalLink, Copy, Check, ChevronRight,
  Camera, Download, Globe, User as UserIcon, Layers, Zap, AlertCircle,
  ArrowRight, ArrowLeft, Menu, X, FileText, Smartphone, Monitor,
  Flame, Laptop, Compass, Hash, Info, Lightbulb
} from 'lucide-react'
import type { Page, User } from '../types'
import ProfileMenu from '../components/ProfileMenu'

type DocsPageProps = {
  user: User | null
  setPage: (page: Page) => void
  onOpenStudio?: () => void
  onLogin?: (user: User, csrfToken: string) => void
  onLogout?: () => void
  notify: (msg: string) => void
}

type DocTopic = {
  id: string
  title: string
  category: string
  icon: React.ElementType
  readTime: string
  summary: string
  subsections: { id: string; title: string }[]
}

const DOC_TOPICS: DocTopic[] = [
  // 1. Getting Started
  {
    id: 'overview',
    title: 'What is Yulya Studio?',
    category: 'Getting Started',
    icon: Sparkles,
    readTime: '3 min read',
    summary: 'The browser-native cloud game engine, AI pair programmer, and global player arcade.',
    subsections: [
      { id: 'overview-intro', title: 'Introduction' },
      { id: 'overview-features', title: 'Core Pillars' },
      { id: 'overview-architecture', title: 'High-Level Architecture' },
    ]
  },
  {
    id: 'quickstart',
    title: '5-Minute Quickstart',
    category: 'Getting Started',
    icon: Zap,
    readTime: '4 min read',
    summary: 'From zero to your first playable published web game in under 5 minutes.',
    subsections: [
      { id: 'quickstart-step1', title: '1. Create Account & Username' },
      { id: 'quickstart-step2', title: '2. Connect Gemini API Key' },
      { id: 'quickstart-step3', title: '3. Create Your First Project' },
      { id: 'quickstart-step4', title: '4. Prompt the Copilot & Code' },
      { id: 'quickstart-step5', title: '5. Snap Cover & Publish' },
    ]
  },
  {
    id: 'account-profile',
    title: 'Account & Creator Profiles',
    category: 'Getting Started',
    icon: UserIcon,
    readTime: '3 min read',
    summary: 'Claiming your unique @username, public creator pages, and managing your creations.',
    subsections: [
      { id: 'account-username', title: 'Claiming a Unique @username' },
      { id: 'account-public', title: 'Public Creator Profile (/@username)' },
      { id: 'account-management', title: 'Managing Projects from Profile' },
    ]
  },
  {
    id: 'gemini-key',
    title: 'Connecting Gemini API Key',
    category: 'Getting Started',
    icon: KeyRound,
    readTime: '4 min read',
    summary: 'How to obtain, connect, and safely encrypt your Google Gemini API key.',
    subsections: [
      { id: 'gemini-why', title: 'Why an API Key is Required' },
      { id: 'gemini-how-to-get', title: 'How to Get a Free Key' },
      { id: 'gemini-security', title: 'Zero-Knowledge AES-256 Encryption' },
      { id: 'gemini-validation', title: 'Testing & Key Verification' },
    ]
  },

  // 2. The Studio IDE
  {
    id: 'ide-workspace',
    title: 'Studio IDE Workspace',
    category: 'Studio IDE',
    icon: Laptop,
    readTime: '5 min read',
    summary: 'Anatomy of the VS Code-grade in-browser editor: files, Monaco editor, preview, and AI.',
    subsections: [
      { id: 'ide-layout', title: 'Interface Anatomy' },
      { id: 'ide-monaco', title: 'Monaco Code Editor Features' },
      { id: 'ide-shortcuts', title: 'Essential Keyboard Shortcuts' },
      { id: 'ide-autosave', title: 'Debounced Cloud Autosave' },
    ]
  },
  {
    id: 'file-system',
    title: 'Files & Project Structure',
    category: 'Studio IDE',
    icon: FileText,
    readTime: '4 min read',
    summary: 'Managing project files, folders, auto-linking scripts, and asset imports.',
    subsections: [
      { id: 'file-tree', title: 'Explorer & File Tree Operations' },
      { id: 'file-starter', title: 'Starter Project Anatomy' },
      { id: 'file-autolink', title: 'Automatic JavaScript Auto-Linking' },
      { id: 'file-assets', title: 'Handling Images, Audio & Assets' },
    ]
  },
  {
    id: 'terminal-errors',
    title: 'Terminal & Error Bridge',
    category: 'Studio IDE',
    icon: Terminal,
    readTime: '3 min read',
    summary: 'Real-time telemetry, console logging, and the runtime error capture bridge.',
    subsections: [
      { id: 'terminal-bridge', title: 'The Injected Runtime Error Bridge' },
      { id: 'terminal-logs', title: 'Console Logs & Warnings' },
      { id: 'terminal-autoopen', title: 'Auto-Opening on Unhandled Errors' },
    ]
  },

  // 3. Engine & Runtime
  {
    id: 'preview-testing',
    title: 'Live Sandbox & Device Preview',
    category: 'Engine & Runtime',
    icon: Monitor,
    readTime: '4 min read',
    summary: 'Real-time isolated game execution, responsive device modes, and fullscreen testing.',
    subsections: [
      { id: 'preview-isolation', title: 'Iframe Isolation & Security' },
      { id: 'preview-devices', title: 'Device View Modes (Desktop, Mobile, Tablet)' },
      { id: 'preview-fullscreen', title: 'Fullscreen & New Tab Testing' },
    ]
  },
  {
    id: 'snapshot-engine',
    title: 'Cover Snapshot Camera',
    category: 'Engine & Runtime',
    icon: Camera,
    readTime: '4 min read',
    summary: 'Capturing instant 480×270 WebP game covers with preserved WebGL buffers.',
    subsections: [
      { id: 'snapshot-how', title: 'How Cover Snapshots Work' },
      { id: 'snapshot-webgl', title: 'Preserved WebGL Drawing Buffer Hook' },
      { id: 'snapshot-transparent', title: 'Compositing Transparent Canvas' },
      { id: 'snapshot-storage', title: 'Storage Optimization (Under 40 KiB WebP)' },
    ]
  },
  {
    id: 'engines-libraries',
    title: 'Supported Game Engines',
    category: 'Engine & Runtime',
    icon: Layers,
    readTime: '5 min read',
    summary: 'Using Three.js, Phaser, Kaboom, Pixi, and the Canvas API in your games.',
    subsections: [
      { id: 'engine-csp', title: 'Permitted CDN Whitelist' },
      { id: 'engine-threejs', title: '3D Games with Three.js' },
      { id: 'engine-phaser', title: '2D Games with Phaser or Pixi' },
      { id: 'engine-canvas', title: 'Vanilla Canvas 2D Game Loop' },
    ]
  },
  {
    id: 'code-templates',
    title: 'Ready-to-Use Game Templates',
    category: 'Engine & Runtime',
    icon: Code2,
    readTime: '6 min read',
    summary: 'Copy-and-paste boilerplate templates for 2D arcade, 3D world, and puzzle games.',
    subsections: [
      { id: 'template-2d', title: 'Template 1: 2D Canvas Space Dodger' },
      { id: 'template-3d', title: 'Template 2: 3D Three.js Rotating Planet' },
      { id: 'template-audio', title: 'Template 3: Sound Effects with Web Audio API' },
    ]
  },

  // 4. AI Copilot
  {
    id: 'ai-models',
    title: 'Gemini Models & Features',
    category: 'AI Copilot',
    icon: Cpu,
    readTime: '4 min read',
    summary: 'Selecting between Gemini 2.5 Flash, Gemini 2.5 Pro, and Flash-Lite.',
    subsections: [
      { id: 'ai-comparison', title: 'Model Comparison & Best Uses' },
      { id: 'ai-streaming', title: 'Live Streaming SSE Responses' },
      { id: 'ai-history', title: 'Persistent Project AI Chat History' },
    ]
  },
  {
    id: 'ai-waterfall',
    title: 'Smart Model Waterfall & Telemetry',
    category: 'AI Copilot',
    icon: Flame,
    readTime: '4 min read',
    summary: 'Automatic quota failover, fallback cascades, and token speed telemetry.',
    subsections: [
      { id: 'waterfall-cascade', title: 'How Waterfall Cascading Works' },
      { id: 'waterfall-telemetry', title: 'Live Telemetry & Token Metrics' },
      { id: 'waterfall-custom', title: 'Configuring Your Model Priority Order' },
    ]
  },
  {
    id: 'ai-playtesting',
    title: 'Autonomous AI Playtesting',
    category: 'AI Copilot',
    icon: Gamepad2,
    readTime: '4 min read',
    summary: 'Letting the AI autonomously test and play your game with synthetic inputs.',
    subsections: [
      { id: 'playtest-concept', title: 'What is AI Playtesting?' },
      { id: 'playtest-inputs', title: 'Synthetic Keyboard & Mouse Control' },
      { id: 'playtest-vision', title: 'Visual Inspection & Error Detection' },
    ]
  },

  // 5. Publishing & Arcade
  {
    id: 'arcade-publishing',
    title: 'Publishing to the Arcade',
    category: 'Publishing & Arcade',
    icon: Globe,
    readTime: '4 min read',
    summary: 'Turning private drafts into public playable games accessible worldwide.',
    subsections: [
      { id: 'publish-toggle', title: 'Public vs Private Projects' },
      { id: 'publish-urls', title: 'Direct Playable URLs (/{username}/{slug})' },
      { id: 'publish-seo', title: 'SEO, OpenGraph Cards & Sitemaps' },
      { id: 'publish-arcade', title: 'Arcade Discovery & Spotlight Hero' },
    ]
  },
  {
    id: 'player-count',
    title: 'Click-Only Player Tracking',
    category: 'Publishing & Arcade',
    icon: Flame,
    readTime: '3 min read',
    summary: 'How atomic play counts increment strictly when users click to play.',
    subsections: [
      { id: 'plays-mechanism', title: 'Atomic Play Increment Engine' },
      { id: 'plays-anti-bot', title: 'Anti-Bot & Anti-Inflation Rules' },
      { id: 'plays-profile', title: 'Creator Lifetime Play Totals' },
    ]
  },
  {
    id: 'ownership-export',
    title: 'Source Code Export & Protection',
    category: 'Publishing & Arcade',
    icon: Download,
    readTime: '3 min read',
    summary: 'Exporting your game as a standalone .zip file and creator ownership protections.',
    subsections: [
      { id: 'export-zip', title: 'Owner-Only ZIP File Export' },
      { id: 'export-edit', title: 'Editing Game Profiles & Genres' },
      { id: 'export-ip', title: 'Strict Intellectual Property Protection (No Fork)' },
    ]
  },

  // 6. Security & Architecture
  {
    id: 'security-sandbox',
    title: 'Security & Sandbox Architecture',
    category: 'Security & Architecture',
    icon: ShieldCheck,
    readTime: '4 min read',
    summary: 'Zero-trust private worker tokens, Content Security Policy, and rate limiting.',
    subsections: [
      { id: 'sec-worker', title: 'Private Worker HMAC Preview Tokens' },
      { id: 'sec-csp', title: 'Strict Content Security Policy (CSP)' },
      { id: 'sec-limits', title: 'Rate Limiting & Abuse Prevention' },
    ]
  },

  // 7. Troubleshooting & FAQ
  {
    id: 'troubleshooting-faq',
    title: 'Troubleshooting & FAQ',
    category: 'Troubleshooting & FAQ',
    icon: HelpCircle,
    readTime: '5 min read',
    summary: 'Answers to common questions, audio policies, key errors, and game debugging.',
    subsections: [
      { id: 'faq-audio', title: 'Sound/Audio Does Not Play Automatically' },
      { id: 'faq-gemini-quota', title: 'Gemini Quota Exceeded or Invalid Key' },
      { id: 'faq-black-screen', title: 'Game Shows a Blank or Black Screen' },
      { id: 'faq-delete', title: 'Deleting a Project Permanently' },
      { id: 'faq-general', title: 'General Frequently Asked Questions' },
    ]
  }
]

export default function DocsPage({
  user,
  setPage,
  onOpenStudio,
  onLogin,
  onLogout,
  notify
}: DocsPageProps) {
  const [activeTopicId, setActiveTopicId] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.replace('#', '').trim()
      const found = DOC_TOPICS.find(t => t.id === hash || t.subsections.some(s => s.id === hash))
      if (found) return found.id
    }
    return 'overview'
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null)

  // Listen for hash changes (e.g. browser back/forward or direct link navigation)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '').trim()
      if (!hash) return
      const found = DOC_TOPICS.find(t => t.id === hash || t.subsections.some(s => s.id === hash))
      if (found) {
        setActiveTopicId(found.id)
      }
    }
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  // Filter topics based on search
  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) return DOC_TOPICS
    const q = searchQuery.toLowerCase().trim()
    return DOC_TOPICS.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.summary.toLowerCase().includes(q) ||
      t.subsections.some(s => s.title.toLowerCase().includes(q))
    )
  }, [searchQuery])

  // Group topics by category
  const categories = useMemo(() => {
    const map = new Map<string, DocTopic[]>()
    filteredTopics.forEach(t => {
      const list = map.get(t.category) || []
      list.push(t)
      map.set(t.category, list)
    })
    return Array.from(map.entries())
  }, [filteredTopics])

  const activeTopic = useMemo(() => {
    return DOC_TOPICS.find(t => t.id === activeTopicId) || DOC_TOPICS[0]
  }, [activeTopicId])

  // Topic index for previous / next navigation
  const activeIndex = useMemo(() => {
    return DOC_TOPICS.findIndex(t => t.id === activeTopic.id)
  }, [activeTopic])

  const prevTopic = activeIndex > 0 ? DOC_TOPICS[activeIndex - 1] : null
  const nextTopic = activeIndex < DOC_TOPICS.length - 1 ? DOC_TOPICS[activeIndex + 1] : null

  // Copy code utility
  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCodeId(id)
      notify('Code copied to clipboard')
      setTimeout(() => setCopiedCodeId(null), 2200)
    }).catch(() => notify('Could not copy code'))
  }

  // Scroll to section hash when selecting topic
  const selectTopic = (id: string) => {
    setActiveTopicId(id)
    setMobileMenuOpen(false)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${id}`)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="docs-shell">
      {/* 1. TOP NAVIGATION BAR */}
      <header className="docs-topbar">
        <div className="docs-topbar-left">
          <button className="docs-nav-back-btn" onClick={() => setPage('home')}>
            <ArrowLeft size={16} />
            <span>Home</span>
          </button>

          <div className="docs-brand" onClick={() => setPage('home')}>
            <span className="brand-mark">✳</span>
            <span className="docs-brand-text">yulya<span className="brand-light">studio</span></span>
            <span className="docs-badge">DOCS</span>
          </div>

          <div className="docs-quick-links">
            <button className="docs-link-pill" onClick={() => setPage('arcade')}>
              <Gamepad2 size={13} />
              <span>Arcade</span>
            </button>
            <button className="docs-link-pill" onClick={() => onOpenStudio ? onOpenStudio() : setPage('studio')}>
              <Code2 size={13} />
              <span>Studio IDE</span>
            </button>
          </div>
        </div>

        {/* Global Search in Topbar */}
        <div className="docs-search-bar">
          <Search size={15} className="docs-search-icon" />
          <input
            type="text"
            placeholder="Search documentation, guides, APIs, errors... (e.g. Gemini key, snapshots, Three.js)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="docs-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="docs-topbar-right">
          {user ? (
            <button className="button button-outline button-small docs-studio-btn" onClick={() => onOpenStudio ? onOpenStudio() : setPage('studio')}>
              <Laptop size={13} />
              <span>Open Studio</span>
            </button>
          ) : (
            <button className="button button-primary button-small" onClick={() => setPage('login')}>
              <span>Start Free</span>
              <ArrowRight size={13} />
            </button>
          )}
          <ProfileMenu
            user={user}
            setPage={setPage}
            onOpenStudio={onOpenStudio}
            onLogin={onLogin}
            onLogout={onLogout || (() => {})}
            notify={notify}
          />
          <button
            className="icon-button docs-mobile-toggle"
            aria-label="Toggle docs sidebar"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* 2. MAIN DOCS CONTAINER */}
      <div className="docs-container">
        {/* LEFT SIDEBAR: TOPICS TREE */}
        <aside className={`docs-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <div className="docs-sidebar-header">
            <span className="docs-sidebar-title">
              <BookOpen size={14} />
              <span>Documentation Index</span>
            </span>
            <span className="docs-topic-count">{DOC_TOPICS.length} guides</span>
          </div>

          <div className="docs-nav-scroll">
            {categories.map(([catName, topics]) => (
              <div className="docs-cat-group" key={catName}>
                <div className="docs-cat-heading">{catName}</div>
                <div className="docs-cat-items">
                  {topics.map(t => {
                    const Icon = t.icon
                    const isActive = t.id === activeTopic.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`docs-topic-btn ${isActive ? 'active' : ''}`}
                        onClick={() => selectTopic(t.id)}
                      >
                        <Icon size={14} className="docs-topic-icon" />
                        <span className="docs-topic-title">{t.title}</span>
                        {isActive && <ChevronRight size={13} className="docs-active-indicator" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="docs-sidebar-footer">
            <div className="docs-version-pill">
              <span className="live-dot" />
              <span>v2.5.0 • Powered by Gemini 2.5</span>
            </div>
            <a
              href="https://aistudio.google.com"
              target="_blank"
              rel="noreferrer"
              className="docs-ext-link"
            >
              <span>Google AI Studio</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </aside>

        {/* CENTER PANE: DOCUMENTATION ARTICLE CONTENT */}
        <main className="docs-article-body">
          {/* Breadcrumb Bar */}
          <div className="docs-breadcrumb">
            <span className="breadcrumb-cat">{activeTopic.category}</span>
            <ChevronRight size={12} className="breadcrumb-sep" />
            <span className="breadcrumb-active">{activeTopic.title}</span>
            <span className="breadcrumb-read-time">{activeTopic.readTime}</span>
          </div>

          {/* Topic Hero Title */}
          <div className="docs-article-header">
            <div className="docs-article-badge">
              <activeTopic.icon size={16} />
              <span>{activeTopic.category.toUpperCase()}</span>
            </div>
            <h1 className="docs-article-h1">{activeTopic.title}</h1>
            <p className="docs-article-summary">{activeTopic.summary}</p>
          </div>

          {/* ARTICLE CONTENT RENDERED PER TOPIC */}
          <div className="docs-markdown-body">
            {renderTopicContent(activeTopic.id, copyCode, copiedCodeId, setPage, user, onOpenStudio)}
          </div>

          {/* ARTICLE FOOTER: PREV / NEXT TOPIC BUTTONS */}
          <div className="docs-pager-nav">
            {prevTopic ? (
              <button
                type="button"
                className="docs-pager-btn prev"
                onClick={() => selectTopic(prevTopic.id)}
              >
                <div className="pager-arrow">
                  <ArrowLeft size={16} />
                </div>
                <div className="pager-text">
                  <span className="pager-label">Previous</span>
                  <span className="pager-title">{prevTopic.title}</span>
                </div>
              </button>
            ) : <div />}

            {nextTopic && (
              <button
                type="button"
                className="docs-pager-btn next"
                onClick={() => selectTopic(nextTopic.id)}
              >
                <div className="pager-text">
                  <span className="pager-label">Next</span>
                  <span className="pager-title">{nextTopic.title}</span>
                </div>
                <div className="pager-arrow">
                  <ArrowRight size={16} />
                </div>
              </button>
            )}
          </div>

          {/* Docs Feedback Banner */}
          <div className="docs-feedback-box">
            <div className="feedback-left">
              <Lightbulb size={20} className="text-lilac" />
              <div>
                <h4>Have a question not answered here?</h4>
                <p>Chat directly with the Antigravity Agent in the Studio IDE for live assistance.</p>
              </div>
            </div>
            <button
              className="button button-primary button-small"
              onClick={() => onOpenStudio ? onOpenStudio() : setPage('studio')}
            >
              Ask AI in Studio <ArrowRight size={14} />
            </button>
          </div>
        </main>

        {/* RIGHT SIDEBAR: ON THIS PAGE (TOC) */}
        <aside className="docs-toc-sidebar">
          <div className="docs-toc-heading">
            <Hash size={13} />
            <span>On This Page</span>
          </div>
          <nav className="docs-toc-list">
            {activeTopic.subsections.map(sub => (
              <a
                key={sub.id}
                href={`#${sub.id}`}
                className="docs-toc-link"
                onClick={(e) => {
                  e.preventDefault()
                  const el = document.getElementById(sub.id)
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              >
                {sub.title}
              </a>
            ))}
          </nav>

          <div className="docs-toc-card">
            <div className="toc-card-spark">✦</div>
            <h5>Ready to create?</h5>
            <p>Open the editor, test in real-time, and publish to the global arcade.</p>
            <button
              className="button button-outline button-small"
              onClick={() => onOpenStudio ? onOpenStudio() : setPage('studio')}
            >
              Launch Editor
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

/* =============================================================================
   TOPIC CONTENT RENDERER WITH INTERACTIVE CODE SNIPPETS & CALLOUTS
   ============================================================================= */
function renderTopicContent(
  topicId: string,
  copyCode: (code: string, id: string) => void,
  copiedCodeId: string | null,
  setPage: (p: Page) => void,
  user: User | null,
  onOpenStudio?: () => void
) {
  switch (topicId) {
    case 'overview':
      return (
        <>
          <section id="overview-intro" className="doc-section">
            <h2>Introduction to Yulya Studio</h2>
            <p>
              <strong>Yulya Studio</strong> is a modern, zero-install cloud game creation studio and player arcade designed from the ground up for curious minds, indie game developers, and creative coders.
            </p>
            <p>
              Unlike traditional desktop game development kits that require gigabytes of SDK downloads, toolchains, build systems, and complex exports, Yulya Studio runs 100% inside your browser. Every game you build is instantly playable, shareable with a single link, and published to a vibrant player Arcade with real-time player counts.
            </p>
            <div className="doc-callout note">
              <Info size={16} className="callout-icon" />
              <div>
                <strong>Philosophy: Creation Without Friction</strong>
                <p>
                  Start from a single sentence or prompt. Watch code and visual graphics assemble side by side. Iterate with Gemini 2.5 AI. Click one button to publish to the global arcade where anyone can play without installs or plugins.
                </p>
              </div>
            </div>
          </section>

          <section id="overview-features" className="doc-section">
            <h2>Core Architectural Pillars</h2>
            <div className="docs-pillar-grid">
              <div className="pillar-card">
                <div className="pillar-icon text-lilac"><Code2 size={22} /></div>
                <h3>VS Code-Grade Monaco IDE</h3>
                <p>Full IntelliSense, syntax coloring, multi-file project tree, and automatic asset resolution in your browser.</p>
              </div>
              <div className="pillar-card">
                <div className="pillar-icon text-mint"><Sparkles size={22} /></div>
                <h3>Gemini 2.5 AI Copilot</h3>
                <p>Fast streaming SSE code generation, model waterfall cascading (Flash & Pro), and autonomous playtesting.</p>
              </div>
              <div className="pillar-card">
                <div className="pillar-icon text-cyan"><Gamepad2 size={22} /></div>
                <h3>Roblox & Steam-Style Arcade</h3>
                <p>Curated player hub with spotlight hero games, genre discovery, search, and click-only player tracking.</p>
              </div>
              <div className="pillar-card">
                <div className="pillar-icon text-peach"><ShieldCheck size={22} /></div>
                <h3>Zero-Trust Isolated Sandbox</h3>
                <p>HMAC-SHA256 signed private worker tokens, strict CSP, and full source code zip export for game owners.</p>
              </div>
            </div>
          </section>

          <section id="overview-architecture" className="doc-section">
            <h2>High-Level System Architecture</h2>
            <p>
              The Yulya Studio ecosystem is organized into four interconnected planes:
            </p>
            <ul className="doc-feature-list">
              <li><strong>Frontend Client (React + TypeScript + Vite):</strong> Fast single-page application orchestrating editor state, live preview iframes, Monaco editor bindings, and Arcade views.</li>
              <li><strong>Backend Engine (FastAPI + Async Motor MongoDB):</strong> Authenticated REST API with AES-GCM credential encryption, rate limiting, and project packaging.</li>
              <li><strong>Sandbox Runner:</strong> Isolated iframe execution environment with runtime error bridge, synthetic input dispatch, and preserved WebGL canvas capturing.</li>
              <li><strong>Gemini AI Intelligence Layer:</strong> Google Gemini 2.5 Flash, 2.5 Pro, and Flash-Lite connected via direct Server-Sent Events (SSE).</li>
            </ul>
          </section>
        </>
      )

    case 'quickstart':
      return (
        <>
          <section id="quickstart-step1" className="doc-section">
            <h2>1. Create Your Account & Claim a Username</h2>
            <p>
              Visit the <button className="inline-link" onClick={() => setPage('register')}>Register Page</button> to create an account using your email and password, or sign in via Google One-Tap.
            </p>
            <p>
              Next, claim your unique creator handle (e.g., <code>@neonrider</code>). Your username is your personal branding across Yulya Studio:
            </p>
            <ul>
              <li>Powers your public creator profile at <code>https://yulya.studio/@yourname</code></li>
              <li>Forms the direct URL for all your games: <code>https://yulya.studio/yourname/game-name</code></li>
              <li>Establishes immutable ownership for your game codes and ZIP exports.</li>
            </ul>
          </section>

          <section id="quickstart-step2" className="doc-section">
            <h2>2. Connect Your Google Gemini API Key</h2>
            <p>
              To enable the AI Copilot and Antigravity Agent, connect a free Gemini API key from <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="inline-link">Google AI Studio <ExternalLink size={11} /></a>.
            </p>
            <div className="doc-callout tip">
              <Lightbulb size={16} className="callout-icon" />
              <div>
                <strong>Free of Charge</strong>
                <p>Google AI Studio provides generous free rate limits for Gemini 2.5 Flash and Pro, meaning you can build and iterate games completely free.</p>
              </div>
            </div>
            <p>
              Click <strong>Key</strong> in the top header or in your Profile to paste your key. It is verified live and saved with AES-256-GCM backend encryption.
            </p>
          </section>

          <section id="quickstart-step3" className="doc-section">
            <h2>3. Create Your First Project</h2>
            <p>
              Click <strong>New Project</strong> in your profile or top navigation. Enter a title (e.g., &ldquo;Space Dodger&rdquo;) and choose initial visibility:
            </p>
            <ul>
              <li><strong>Private Draft:</strong> Only you can see and edit the project. Isolated with private preview tokens.</li>
              <li><strong>Public Arcade:</strong> Immediately published to the global arcade and discoverable by players.</li>
            </ul>
            <p>
              Every new project initializes with standard web game starter files: <code>index.html</code>, <code>style.css</code>, and <code>app.js</code>.
            </p>
          </section>

          <section id="quickstart-step4" className="doc-section">
            <h2>4. Prompt the Copilot & Code</h2>
            <p>
              Inside the Studio IDE, use the Copilot chat input on the right side. You can ask for anything from complete game loops to tiny adjustments:
            </p>
            <div className="docs-prompt-box">
              <span className="prompt-label">Example Prompt:</span>
              <p>&ldquo;Turn this into a retro 2D spaceship shooter. Add player controls with Arrow keys / WASD, spawning asteroids, particle explosions on hit, a live score display, and sound effects using Web Audio API.&rdquo;</p>
            </div>
            <p>
              The AI streams code changes directly into your active files. The Live Preview updates instantaneously.
            </p>
          </section>

          <section id="quickstart-step5" className="doc-section">
            <h2>5. Snap Cover & Publish to the Arcade</h2>
            <p>
              Once your game is playable:
            </p>
            <ol>
              <li>Click the <strong>Camera icon</strong> in the preview toolbar. This captures a crisp 480×270 WebP snapshot of the live game.</li>
              <li>Click the <strong>Publish</strong> button in the top menu bar to make your game public.</li>
              <li>Share your link: <code>https://yulya.studio/{user?.username || 'yourname'}/space-dodger</code>. Anyone on desktop or mobile can play immediately!</li>
            </ol>
          </section>
        </>
      )

    case 'account-profile':
      return (
        <>
          <section id="account-username" className="doc-section">
            <h2>Claiming a Unique @username</h2>
            <p>
              Your username is your primary identity on Yulya Studio. It determines the URL where players discover your games and visit your profile.
            </p>
            <ul>
              <li><strong>Length:</strong> 3 to 24 characters.</li>
              <li><strong>Allowed Characters:</strong> Lowercase English letters, digits (0-9), and single hyphens (no trailing or leading hyphens).</li>
              <li><strong>Reserved Words:</strong> System routes like <code>admin</code>, <code>api</code>, <code>arcade</code>, <code>docs</code>, and <code>studio</code> are protected.</li>
            </ul>
            <p>
              You can claim or change your username directly in your <button className="inline-link" onClick={() => setPage('profile')}>Profile Page</button>. When you update your username, all your game URLs and links are automatically updated.
            </p>
          </section>

          <section id="account-public" className="doc-section">
            <h2>Public Creator Profile (/@username)</h2>
            <p>
              Every creator with a username receives an automatic public portfolio page at:
            </p>
            <div className="docs-url-card">
              <span className="url-method">PORTFOLIO</span>
              <code>https://yulya.studio/<b>&#123;username&#125;</b></code>
            </div>
            <p>
              This page showcases:
            </p>
            <ul>
              <li>Your creator bio and avatar.</li>
              <li>All games you have published to the Public Arcade.</li>
              <li>Total cumulative player count across all your creations.</li>
              <li>Join date and verified creator badge.</li>
            </ul>
          </section>

          <section id="account-management" className="doc-section">
            <h2>Managing Projects from Your Profile</h2>
            <p>
              Your personal profile is your command center. For every game in your library, the <strong>3-dots options menu</strong> gives you instant access to:
            </p>
            <ul>
              <li><strong>Edit Game Profile:</strong> Update Title, Description, and Genre category.</li>
              <li><strong>Open in Studio:</strong> Jump directly into the editor at <code>/{'{username}'}/{'{slug}'}/edit</code>.</li>
              <li><strong>Play in Arcade:</strong> Test the live public version.</li>
              <li><strong>Publish / Make Private:</strong> Toggle visibility in one click.</li>
              <li><strong>Download ZIP (.zip):</strong> Export full standalone source code.</li>
              <li><strong>Delete Project:</strong> Permanently purge project and conversation history.</li>
            </ul>
          </section>
        </>
      )

    case 'gemini-key':
      return (
        <>
          <section id="gemini-why" className="doc-section">
            <h2>Why a Gemini API Key is Required</h2>
            <p>
              Yulya Studio integrates directly with Google&rsquo;s state-of-the-art <strong>Gemini 2.5 Flash</strong> and <strong>Gemini 2.5 Pro</strong> models. Rather than charging creators expensive monthly subscription fees with arbitrary token markups, Yulya Studio uses a direct-to-developer model:
            </p>
            <ul>
              <li>You bring your own API key directly from Google AI Studio.</li>
              <li>You receive the full speed, unthrottled context window, and quota provided directly by Google.</li>
              <li>Google AI Studio provides a free tier with high RPM (Requests Per Minute) sufficient for hours of daily game creation.</li>
            </ul>
          </section>

          <section id="gemini-how-to-get" className="doc-section">
            <h2>How to Get a Free Key in 3 Steps</h2>
            <div className="docs-step-cards">
              <div className="step-card">
                <span className="step-num">01</span>
                <h4>Visit Google AI Studio</h4>
                <p>Go to <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="inline-link">aistudio.google.com <ExternalLink size={11} /></a> and sign in with your Google account.</p>
              </div>
              <div className="step-card">
                <span className="step-num">02</span>
                <h4>Click &ldquo;Get API Key&rdquo;</h4>
                <p>In the top left menu, click <strong>Get API key</strong>, then click <strong>Create API key in new project</strong>.</p>
              </div>
              <div className="step-card">
                <span className="step-num">03</span>
                <h4>Paste into Yulya Studio</h4>
                <p>Copy your key string (starts with <code>AIzaSy...</code>), return to Yulya Studio, click <strong>Key</strong> in the top header, paste and click Save.</p>
              </div>
            </div>
          </section>

          <section id="gemini-security" className="doc-section">
            <h2>Zero-Knowledge AES-256 Backend Encryption</h2>
            <p>
              Security of creator credentials is taken with highest priority:
            </p>
            <ul className="doc-feature-list">
              <li><strong>Authenticated AES-256-GCM:</strong> Your API key is encrypted using AES-256-GCM before being stored in the database.</li>
              <li><strong>Zero Plaintext Storage:</strong> Raw plaintext keys are never saved in the database or logged anywhere.</li>
              <li><strong>One-Way Display:</strong> Once saved, your key is never returned to the frontend in full. Only a masked status (<code>has_api_key: true</code>) is shared with the client.</li>
              <li><strong>Immediate Removal:</strong> You can disconnect and permanently purge your key at any moment by clicking &ldquo;Remove Key&rdquo;.</li>
            </ul>
          </section>

          <section id="gemini-validation" className="doc-section">
            <h2>Live Key Verification</h2>
            <p>
              When you submit a key, Yulya Studio performs an instant lightweight handshake with Google&rsquo;s <code>models/gemini-2.5-flash</code> endpoint. If the key is invalid, revoked, or has billing issues, you will immediately receive clear feedback before saving.
            </p>
          </section>
        </>
      )

    case 'ide-workspace':
      return (
        <>
          <section id="ide-layout" className="doc-section">
            <h2>Studio Workspace Layout</h2>
            <p>
              The Studio IDE is engineered for fast, distraction-free game creation. The layout consists of 4 main responsive panes:
            </p>
            <div className="docs-diagram-box">
              <div className="diagram-bar">TOPBAR: Project Name • Visibility Toggle • View Modes • Snapshot Camera • Publish</div>
              <div className="diagram-split">
                <div className="diagram-col col-1">
                  <b>EXPLORER</b>
                  <span>File Tree</span>
                  <span>Add File</span>
                  <span>Delete File</span>
                </div>
                <div className="diagram-col col-2">
                  <b>MONACO EDITOR</b>
                  <span>Multi-Tab Code Editor</span>
                  <span>Syntax Highlighting</span>
                  <span>Auto-Complete</span>
                </div>
                <div className="diagram-col col-3">
                  <b>LIVE PREVIEW</b>
                  <span>Isolated Iframe Runner</span>
                  <span>Device Switcher (16:9 / Mobile)</span>
                  <span>Cover Snapshot Camera</span>
                </div>
                <div className="diagram-col col-4">
                  <b>COPILOT / AGENT</b>
                  <span>Gemini 2.5 Flash / Pro</span>
                  <span>Streaming SSE</span>
                  <span>AI Playtester</span>
                </div>
              </div>
              <div className="diagram-bar">BOTTOM: Interactive Console Terminal & Runtime Error Bridge</div>
            </div>
          </section>

          <section id="ide-monaco" className="doc-section">
            <h2>Monaco Code Editor</h2>
            <p>
              Powered by the same Monaco editor engine found in Microsoft VS Code:
            </p>
            <ul>
              <li><strong>Full Multi-File Tabs:</strong> Open <code>index.html</code>, <code>style.css</code>, and multiple JavaScript scripts simultaneously.</li>
              <li><strong>Syntax Validation:</strong> Real-time linting, bracket matching, code folding, and error squiggly markers.</li>
              <li><strong>IntelliSense:</strong> Rich autocomplete for modern JavaScript, HTML5 Canvas, WebGL, and DOM APIs.</li>
            </ul>
          </section>

          <section id="ide-shortcuts" className="doc-section">
            <h2>Essential Keyboard Shortcuts</h2>
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Shortcut</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><kbd>Ctrl</kbd> + <kbd>S</kbd> / <kbd>Cmd</kbd> + <kbd>S</kbd></td>
                  <td>Instant manual save & reload preview</td>
                </tr>
                <tr>
                  <td><kbd>Ctrl</kbd> + <kbd>P</kbd> / <kbd>Cmd</kbd> + <kbd>P</kbd></td>
                  <td>Quick file switch pallet</td>
                </tr>
                <tr>
                  <td><kbd>Enter</kbd> (in Copilot)</td>
                  <td>Submit AI prompt</td>
                </tr>
                <tr>
                  <td><kbd>Shift</kbd> + <kbd>Enter</kbd> (in Copilot)</td>
                  <td>Insert a new line in prompt composer</td>
                </tr>
                <tr>
                  <td><kbd>Ctrl</kbd> + <kbd>`</kbd> / <kbd>Cmd</kbd> + <kbd>`</kbd></td>
                  <td>Toggle terminal & console panel</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section id="ide-autosave" className="doc-section">
            <h2>Debounced Cloud Autosave</h2>
            <p>
              You never have to worry about losing progress if your browser closes or your connection drops. All code edits are debounced and synchronized to MongoDB automatically every 1,200ms. An indicator in the top menu shows your current sync state (<em>Saved</em> / <em>Saving…</em>).
            </p>
          </section>
        </>
      )

    case 'file-system':
      return (
        <>
          <section id="file-tree" className="doc-section">
            <h2>Explorer & File Tree Operations</h2>
            <p>
              The File Explorer on the left side of the IDE displays all source files for your active project:
            </p>
            <ul>
              <li><strong>New File / Folder:</strong> Click the <code>+</code> button to create new files (e.g. <code>player.js</code>, <code>levels/world1.js</code>).</li>
              <li><strong>Delete File:</strong> Click the trash icon next to any file to remove it.</li>
              <li><strong>Multi-Tab Editing:</strong> Clicking any file opens it as a tab in Monaco editor. Tabs can be closed with the <code>×</code> button.</li>
            </ul>
          </section>

          <section id="file-starter" className="doc-section">
            <h2>Starter Project Anatomy</h2>
            <p>
              Every new game starts with three core files:
            </p>
            <ul>
              <li><code>index.html</code> — The HTML5 canvas or DOM wrapper that loads stylesheets and your game elements.</li>
              <li><code>style.css</code> — Resets margins, applies dark background styling, and handles responsive layout rules.</li>
              <li><code>app.js</code> — The primary game script where event listeners, game loops, player controls, and render logic reside.</li>
            </ul>
          </section>

          <section id="file-autolink" className="doc-section">
            <h2>Automatic JavaScript Script Auto-Linking</h2>
            <div className="doc-callout tip">
              <Lightbulb size={16} className="callout-icon" />
              <div>
                <strong>Zero Boilerplate Injections</strong>
                <p>
                  In traditional web development, every new <code>.js</code> file must be manually linked in <code>index.html</code> with a <code>&lt;script src="..."&gt;</code> tag. In Yulya Studio, the runtime bridge inspects your project tree: any top-level JavaScript files you create (e.g., <code>physics.js</code>, <code>audio.js</code>, <code>enemies.js</code>) are automatically injected and executed in the preview!
                </p>
              </div>
            </div>
          </section>

          <section id="file-assets" className="doc-section">
            <h2>Handling Images, Audio & Assets</h2>
            <p>
              You can integrate assets into your browser games using three convenient methods:
            </p>
            <ul>
              <li><strong>SVG & Canvas Drawing:</strong> Write procedural 2D/3D shapes using the Canvas 2D or WebGL API. This provides ultra-fast loading with zero network overhead.</li>
              <li><strong>Base64 Data URLs:</strong> Embed small sprites or audio snippets directly into your CSS or JS files.</li>
              <li><strong>Whitelisted CDNs:</strong> Load free sprites, 3D models, textures, and sounds over HTTPS from permitted CDN sources.</li>
            </ul>
          </section>
        </>
      )

    case 'terminal-errors':
      return (
        <>
          <section id="terminal-bridge" className="doc-section">
            <h2>The Injected Runtime Error Bridge</h2>
            <p>
              Debugging games running inside an iframe can typically be frustrating if script errors get swallowed silently. Yulya Studio solves this by injecting an automated error bridge into every game execution:
            </p>
            <ul>
              <li>Captures unhandled JavaScript exceptions (<code>window.addEventListener('error')</code>) with exact source filename, line number, and column.</li>
              <li>Intercepts unhandled Promise rejections (<code>window.addEventListener('unhandledrejection')</code>).</li>
              <li>Relays errors via secure <code>window.parent.postMessage</code> directly to the Studio IDE.</li>
            </ul>
          </section>

          <section id="terminal-logs" className="doc-section">
            <h2>Live Console Logs & Warnings</h2>
            <p>
              Whenever your code calls <code>console.log()</code>, <code>console.warn()</code>, or <code>console.error()</code>, the message is routed in real time into the Studio Terminal with precise millisecond timestamps and color-coded severity tags.
            </p>
          </section>

          <section id="terminal-autoopen" className="doc-section">
            <h2>Auto-Opening on Unhandled Errors</h2>
            <p>
              If a script error occurs during gameplay (e.g. <code>TypeError: Cannot read property of undefined</code>), the terminal drawer pops up automatically at the bottom of the screen. You instantly know why your game stopped without having to open browser developer tools.
            </p>
          </section>
        </>
      )

    case 'preview-testing':
      return (
        <>
          <section id="preview-isolation" className="doc-section">
            <h2>Live Sandbox Iframe Isolation</h2>
            <p>
              Your game runs inside a sandboxed iframe. This guarantees that:
            </p>
            <ul>
              <li>Game code cannot access the parent Studio IDE&rsquo;s cookies, local storage, or API credentials.</li>
              <li>Infinite loops or memory leaks in a game will never crash your editor workspace or erase unsaved code.</li>
              <li>Reloading the preview (<kbd>Reload</kbd> button) reinitializes the game state in milliseconds.</li>
            </ul>
          </section>

          <section id="preview-devices" className="doc-section">
            <h2>Device View Modes</h2>
            <p>
              Test how your game feels across different screen resolutions using the device switcher in the preview header:
            </p>
            <div className="docs-device-grid">
              <div className="device-card">
                <Monitor size={20} className="text-lilac" />
                <h4>16:9 HD Desktop</h4>
                <p>Locks preview to standard 16:9 widescreen ratio (1280×720). Ideal for action, platformers, and 3D games.</p>
              </div>
              <div className="device-card">
                <Smartphone size={20} className="text-mint" />
                <h4>Mobile Device</h4>
                <p>Simulates modern smartphone screen proportions (390×844) to test touch controls and vertical arcade layouts.</p>
              </div>
              <div className="device-card">
                <Laptop size={20} className="text-cyan" />
                <h4>Tablet View</h4>
                <p>Simulates iPad / tablet dimensions (820×1180) to ensure user interfaces adapt gracefully to medium viewports.</p>
              </div>
              <div className="device-card">
                <Compass size={20} className="text-peach" />
                <h4>Responsive Mode</h4>
                <p>Fluidly expands to fill the entire available preview pane width and height.</p>
              </div>
            </div>
          </section>

          <section id="preview-fullscreen" className="doc-section">
            <h2>Fullscreen & New Tab Testing</h2>
            <p>
              Use the <strong>Fullscreen</strong> button to test your game in true edge-to-edge display mode, or click <strong>Open in New Tab</strong> to run the isolated game in a standalone browser window.
            </p>
          </section>
        </>
      )

    case 'snapshot-engine':
      return (
        <>
          <section id="snapshot-how" className="doc-section">
            <h2>The Cover Snapshot Engine</h2>
            <p>
              Every game in the Roblox-style Arcade and Creator Profile features a visual cover card. Instead of generic placeholder icons, Yulya Studio features a built-in <strong>Cover Snapshot Camera</strong> located in the preview toolbar.
            </p>
            <p>
              Clicking the camera icon instantly captures the live, rendered gameplay visuals and saves an ultra-optimized <strong>480×270 WebP image</strong> directly to the project document.
            </p>
          </section>

          <section id="snapshot-webgl" className="doc-section">
            <h2>Preserved WebGL Drawing Buffer Hook</h2>
            <div className="doc-callout note">
              <Info size={16} className="callout-icon" />
              <div>
                <strong>The WebGL Blank Screen Challenge Solved</strong>
                <p>
                  In standard WebGL and Three.js engines, browsers clear the GPU drawing buffer immediately after every animation frame (<code>preserveDrawingBuffer: false</code>). Taking an asynchronous screenshot normally results in a solid black or blank frame.
                </p>
              </div>
            </div>
            <p>
              Yulya Studio automatically injects a prototype interceptor into the game iframe runtime before your scripts execute:
            </p>
            <div className="code-block-wrap">
              <button className="copy-code-btn" onClick={() => copyCode(`// Injected automatically by Yulya Studio engine
const _origGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, attribs) {
  if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
    attribs = Object.assign({}, attribs, { preserveDrawingBuffer: true });
  }
  return _origGetContext.call(this, type, attribs);
};`, 'code-webgl')}>
                {copiedCodeId === 'code-webgl' ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedCodeId === 'code-webgl' ? 'Copied' : 'Copy'}</span>
              </button>
              <pre><code>{`// Injected automatically by Yulya Studio engine
const _origGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, attribs) {
  if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
    attribs = Object.assign({}, attribs, { preserveDrawingBuffer: true });
  }
  return _origGetContext.call(this, type, attribs);
};`}</code></pre>
            </div>
            <p>
              This ensures that 3D meshes, particle effects, and shaders are preserved in the canvas buffer, allowing the camera to capture the live frame with 100% fidelity.
            </p>
          </section>

          <section id="snapshot-transparent" className="doc-section">
            <h2>Transparent Canvas Background Compositing</h2>
            <p>
              Many 2D games draw sprites on a transparent canvas, relying on CSS <code>body &#123; background: ... &#125;</code> for the backdrop. Converting a transparent canvas directly to JPEG results in pure black borders.
            </p>
            <p>
              The Yulya Studio snapshot engine reads the computed background color of the game document, composites the canvas over an offscreen buffer, and exports cleanly via PNG before downscaling.
            </p>
          </section>

          <section id="snapshot-storage" className="doc-section">
            <h2>Storage Optimization: 480×270 WebP under 40 KiB</h2>
            <p>
              To maintain instant load times across mobile devices and low database footprint:
            </p>
            <ul>
              <li>The raw capture is cropped and scaled to standard 16:9 widescreen ratio (480×270 pixels).</li>
              <li>Compressed using WebP 0.82 quality, maintaining crisp sharpness while occupying under 35 KiB.</li>
              <li>Stored as an atomic data URL directly in MongoDB, eliminating external S3 bucket lookups and CDN delays.</li>
            </ul>
          </section>
        </>
      )

    case 'engines-libraries':
      return (
        <>
          <section id="engine-csp" className="doc-section">
            <h2>Permitted CDN Whitelist</h2>
            <p>
              For maximum security and performance, game iframes are protected by a strict Content Security Policy. The following CDN domains are pre-approved and can be loaded directly via <code>&lt;script src="..."&gt;</code> in your <code>index.html</code>:
            </p>
            <ul className="docs-cdn-list">
              <li><code>https://cdnjs.cloudflare.com</code> — Phaser, Three.js, GSAP, Howler.js, Lodash, Axios</li>
              <li><code>https://cdn.jsdelivr.net</code> — Pixi.js, Matter.js physics, Tailwind, Chart.js</li>
              <li><code>https://unpkg.com</code> — Modern open source npm packages</li>
              <li><code>https://cdn.skypack.dev</code> — ES Modules</li>
              <li><code>https://esm.sh</code> — Modern ESM CDN for libraries</li>
              <li><code>https://fonts.googleapis.com</code> &amp; <code>fonts.gstatic.com</code> — Google Web Fonts</li>
            </ul>
          </section>

          <section id="engine-threejs" className="doc-section">
            <h2>Building 3D Games with Three.js</h2>
            <p>
              Add Three.js directly to your <code>index.html</code> <code>&lt;head&gt;</code>:
            </p>
            <div className="code-block-wrap">
              <button className="copy-code-btn" onClick={() => copyCode(`<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>`, 'code-three-cdn')}>
                {copiedCodeId === 'code-three-cdn' ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedCodeId === 'code-three-cdn' ? 'Copied' : 'Copy'}</span>
              </button>
              <pre><code>{`<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>`}</code></pre>
            </div>
            <p>
              You can now instantiate scenes, perspective cameras, WebGL renderers, lighting, and 3D geometry in your <code>app.js</code>.
            </p>
          </section>

          <section id="engine-canvas" className="doc-section">
            <h2>Vanilla HTML5 Canvas 2D Game Loop</h2>
            <p>
              Vanilla 2D games have zero external dependencies, start in milliseconds, and run smoothly on any device.
            </p>
            <p>
              The standard pattern uses <code>requestAnimationFrame(gameLoop)</code> with delta-time calculations for frame-rate independent movement.
            </p>
          </section>
        </>
      )

    case 'code-templates':
      return (
        <>
          <section id="template-2d" className="doc-section">
            <h2>Template 1: 2D Canvas Space Dodger</h2>
            <p>
              A complete, self-contained 2D arcade dodging game with keyboard controls, score tracking, and smooth animation loop.
            </p>
            <div className="code-block-wrap">
              <div className="code-block-header">
                <span>app.js (Complete 2D Game Loop)</span>
                <button className="copy-code-btn" onClick={() => copyCode(`const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
document.body.appendChild(canvas);
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let player = { x: canvas.width / 2, y: canvas.height - 60, size: 24, speed: 7 };
let enemies = [];
let score = 0;
let gameOver = false;
let keys = {};

window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

function spawnEnemy() {
  if (!gameOver) {
    enemies.push({
      x: Math.random() * (canvas.width - 30),
      y: -30,
      size: 15 + Math.random() * 20,
      speed: 3 + Math.random() * 4
    });
    setTimeout(spawnEnemy, Math.max(300, 1000 - score * 20));
  }
}
spawnEnemy();

function update() {
  if (gameOver) return;
  if ((keys['ArrowLeft'] || keys['a']) && player.x > player.size) player.x -= player.speed;
  if ((keys['ArrowRight'] || keys['d']) && player.x < canvas.width - player.size) player.x += player.speed;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.y += e.speed;

    // Collision check
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist < player.size + e.size) {
      gameOver = true;
    }

    if (e.y > canvas.height + 50) {
      enemies.splice(i, 1);
      score += 10;
    }
  }
}

function draw() {
  ctx.fillStyle = '#0d0e15';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw player
  ctx.fillStyle = '#c7a6ff';
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
  ctx.fill();

  // Draw enemies
  ctx.fillStyle = '#f87171';
  enemies.forEach(e => {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw score
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px sans-serif';
  ctx.fillText('SCORE: ' + score, 20, 40);

  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff7b72';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);
    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Final Score: ' + score + ' • Refresh to replay', canvas.width / 2, canvas.height / 2 + 25);
  } else {
    requestAnimationFrame(() => { update(); draw(); });
  }
}
draw();`, 'code-2d-template')}>
                  {copiedCodeId === 'code-2d-template' ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedCodeId === 'code-2d-template' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre><code>{`const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
document.body.appendChild(canvas);
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let player = { x: canvas.width / 2, y: canvas.height - 60, size: 24, speed: 7 };
let enemies = [];
let score = 0;
let gameOver = false;
let keys = {};

window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

function spawnEnemy() {
  if (!gameOver) {
    enemies.push({
      x: Math.random() * (canvas.width - 30),
      y: -30,
      size: 15 + Math.random() * 20,
      speed: 3 + Math.random() * 4
    });
    setTimeout(spawnEnemy, Math.max(300, 1000 - score * 20));
  }
}
spawnEnemy();

function update() {
  if (gameOver) return;
  if ((keys['ArrowLeft'] || keys['a']) && player.x > player.size) player.x -= player.speed;
  if ((keys['ArrowRight'] || keys['d']) && player.x < canvas.width - player.size) player.x += player.speed;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.y += e.speed;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    if (Math.hypot(dx, dy) < player.size + e.size) gameOver = true;
    if (e.y > canvas.height + 50) {
      enemies.splice(i, 1);
      score += 10;
    }
  }
}

function draw() {
  ctx.fillStyle = '#0d0e15';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#c7a6ff';
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f87171';
  enemies.forEach(e => {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#ffffff';
  ctx.font = '20px sans-serif';
  ctx.fillText('SCORE: ' + score, 20, 40);

  if (!gameOver) requestAnimationFrame(() => { update(); draw(); });
}
draw();`}</code></pre>
            </div>
          </section>

          <section id="template-3d" className="doc-section">
            <h2>Template 2: 3D Three.js Rotating Planet</h2>
            <p>
              Boilerplate Three.js starter with ambient lighting, point light, orbiting camera, and responsive canvas sizing:
            </p>
            <div className="code-block-wrap">
              <button className="copy-code-btn" onClick={() => copyCode(`// Include in index.html: <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const geometry = new THREE.SphereGeometry(2, 32, 32);
const material = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.4, metalness: 0.6 });
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

const ambientLight = new THREE.AmbientLight(0x404040, 2);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xffffff, 2, 50);
pointLight.position.set(5, 5, 5);
scene.add(pointLight);

camera.position.z = 6;

function animate() {
  requestAnimationFrame(animate);
  sphere.rotation.x += 0.005;
  sphere.rotation.y += 0.01;
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});`, 'code-3d-template')}>
                {copiedCodeId === 'code-3d-template' ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedCodeId === 'code-3d-template' ? 'Copied' : 'Copy'}</span>
              </button>
              <pre><code>{`// 1. Add to index.html: <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const geometry = new THREE.SphereGeometry(2, 32, 32);
const material = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.4, metalness: 0.6 });
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

const ambientLight = new THREE.AmbientLight(0x404040, 2);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xffffff, 2, 50);
pointLight.position.set(5, 5, 5);
scene.add(pointLight);

camera.position.z = 6;

function animate() {
  requestAnimationFrame(animate);
  sphere.rotation.x += 0.005;
  sphere.rotation.y += 0.01;
  renderer.render(scene, camera);
}
animate();`}</code></pre>
            </div>
          </section>

          <section id="template-audio" className="doc-section">
            <h2>Template 3: Zero-Dependency Sound Effects with Web Audio API</h2>
            <p>
              You don&rsquo;t need to upload heavy <code>.mp3</code> files for retro sound effects. The browser&rsquo;s built-in <code>AudioContext</code> can synthesize laser sounds, jump beeps, and explosions programmatically:
            </p>
            <div className="code-block-wrap">
              <button className="copy-code-btn" onClick={() => copyCode(`const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playLaser() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(880, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.15);
}`, 'code-audio-template')}>
                {copiedCodeId === 'code-audio-template' ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedCodeId === 'code-audio-template' ? 'Copied' : 'Copy'}</span>
              </button>
              <pre><code>{`const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playLaser() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(880, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.15);
}`}</code></pre>
            </div>
          </section>
        </>
      )

    case 'ai-models':
      return (
        <>
          <section id="ai-comparison" className="doc-section">
            <h2>Gemini 2.5 Model Comparison</h2>
            <p>
              Yulya Studio integrates directly with Google&rsquo;s flagship generative models:
            </p>
            <div className="docs-pillar-grid">
              <div className="pillar-card">
                <div className="pillar-icon text-lilac"><Zap size={22} /></div>
                <h3>Gemini 2.5 Flash</h3>
                <span className="model-badge">DEFAULT RECOMMENDED</span>
                <p>Lightning-fast generation, 1M token context window, incredible code comprehension. Perfect for 90% of game dev tasks, UI tweaking, and fast iterations.</p>
              </div>
              <div className="pillar-card">
                <div className="pillar-icon text-mint"><Sparkles size={22} /></div>
                <h3>Gemini 2.5 Pro</h3>
                <span className="model-badge pro">MAXIMUM REASONING</span>
                <p>Advanced multi-step reasoning, complex 3D vector math, shader writing, and procedural world algorithms. Ideal for architecting intricate mechanics.</p>
              </div>
              <div className="pillar-card">
                <div className="pillar-icon text-cyan"><Cpu size={22} /></div>
                <h3>Gemini 2.0 Flash-Lite</h3>
                <span className="model-badge lite">HIGH VOLUME</span>
                <p>Ultra-efficient, low-latency responses for quick syntax questions, boilerplate scaffolding, and lightweight helpers.</p>
              </div>
            </div>
          </section>

          <section id="ai-streaming" className="doc-section">
            <h2>Live Server-Sent Events (SSE) Streaming</h2>
            <p>
              When you prompt the Copilot, responses are delivered via raw Server-Sent Events (SSE). You can observe code blocks streaming in real time, with instant markdown syntax highlighting and thinking process collapsible drawers.
            </p>
          </section>

          <section id="ai-history" className="doc-section">
            <h2>Persistent AI Chat History</h2>
            <p>
              The conversation context is saved directly to your project in MongoDB. When you close the browser and return tomorrow, the Copilot remembers previous decisions, player feedback, and past iterations.
            </p>
          </section>
        </>
      )

    case 'ai-waterfall':
      return (
        <>
          <section id="waterfall-cascade" className="doc-section">
            <h2>How the Smart Model Waterfall Works</h2>
            <p>
              Rate limits and quota exhaustion are common pitfalls when building with AI. Yulya Studio implements an automatic <strong>Smart Model Waterfall</strong>:
            </p>
            <div className="docs-waterfall-flow">
              <div className="wf-step">
                <span className="wf-badge primary">Primary</span>
                <b>Gemini 2.5 Flash</b>
                <p>Executes request with maximum speed</p>
              </div>
              <div className="wf-arrow">➔ 429 Quota Exceeded ➔</div>
              <div className="wf-step">
                <span className="wf-badge fallback">Fallback 1</span>
                <b>Gemini 2.5 Pro</b>
                <p>Automatically retries request</p>
              </div>
              <div className="wf-arrow">➔ If Busy ➔</div>
              <div className="wf-step">
                <span className="wf-badge fallback">Fallback 2</span>
                <b>Flash-Lite</b>
                <p>Guarantees response delivery</p>
              </div>
            </div>
            <p>
              If your primary model encounters a temporary <code>429 Resource Exhausted</code> or server overload, the waterfall engine automatically transitions to the next available model in your sequence without interrupting your workflow.
            </p>
          </section>

          <section id="waterfall-telemetry" className="doc-section">
            <h2>Live Token Telemetry & Speed Metrics</h2>
            <p>
              Every AI generation displays a telemetry pill in the chat:
            </p>
            <ul>
              <li><strong>Token Counts:</strong> Detailed breakdown of input prompt tokens and generated output tokens.</li>
              <li><strong>Duration & Speed:</strong> Exact elapsed seconds and generation speed (e.g. <code>94 tokens/sec</code>).</li>
              <li><strong>Cascade Notice:</strong> If a model fallback occurred, a transition badge displays the origin model, target model, and reason.</li>
            </ul>
          </section>
        </>
      )

    case 'ai-playtesting':
      return (
        <>
          <section id="playtest-concept" className="doc-section">
            <h2>What is Autonomous AI Playtesting?</h2>
            <p>
              Instead of manually pressing keys to test every single code edit, Yulya Studio features an <strong>Autonomous Playtest Agent</strong>.
            </p>
            <p>
              Clicking <strong>Start AI Playtest</strong> in the preview toolbar activates the agent. The AI inspects the game screen, identifies interactable elements (such as &ldquo;Start Game&rdquo; or player sprites), and plays the game autonomously!
            </p>
          </section>

          <section id="playtest-inputs" className="doc-section">
            <h2>Synthetic Keyboard & Mouse Control</h2>
            <p>
              The playtesting runtime uses high-fidelity synthetic event dispatchers:
            </p>
            <ul>
              <li><strong>Pointer Coordinates:</strong> Moves a visual cursor dot across the preview canvas and clicks buttons using <code>PointerEvent</code> and <code>MouseEvent</code>.</li>
              <li><strong>Held Keys:</strong> Dispatches real <code>KeyboardEvent</code> (Space, Arrow keys, WASD) with millisecond hold durations (e.g. holding Space to charge a jump).</li>
              <li><strong>Focus Simulation:</strong> Dispatches focus and blur events on canvas and input elements.</li>
            </ul>
          </section>

          <section id="playtest-vision" className="doc-section">
            <h2>Visual Inspection & Diagnostics</h2>
            <p>
              During playtesting, the agent takes live snapshots to verify that rendering remains intact. If an error or crash occurs, the playtester reports it with exact diagnostics directly to the Copilot.
            </p>
          </section>
        </>
      )

    case 'arcade-publishing':
      return (
        <>
          <section id="publish-toggle" className="doc-section">
            <h2>Public vs Private Projects</h2>
            <p>
              Every game in Yulya Studio has a visibility setting:
            </p>
            <table className="docs-table">
              <thead>
                <tr>
                  <th>State</th>
                  <th>Preview Sandbox</th>
                  <th>Public Arcade Link</th>
                  <th>Who Can Play?</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Private Draft</strong></td>
                  <td>Signed HMAC Worker Token</td>
                  <td>None (404 for others)</td>
                  <td>Only project owner</td>
                </tr>
                <tr>
                  <td><strong>Public Arcade</strong></td>
                  <td>Live Isolated Runner</td>
                  <td><code>/{'{username}'}/{'{slug}'}</code></td>
                  <td>Anyone globally via browser</td>
                </tr>
              </tbody>
            </table>
            <p>
              To toggle a project between Private and Public, click the <strong>Publish / Make Private</strong> button in the Studio topbar, or select it from the 3-dots menu on your Profile.
            </p>
          </section>

          <section id="publish-urls" className="doc-section">
            <h2>Clean, SEO-Friendly Game URLs</h2>
            <p>
              When a game is made public, it receives a clean, memorable URL:
            </p>
            <div className="docs-url-card">
              <span className="url-method">GET</span>
              <code>https://yulya.studio/<b>&#123;username&#125;</b>/<b>&#123;game-slug&#125;</b></code>
            </div>
            <p>
              Anyone with this link can play the game immediately on any device (Windows, Mac, iOS, Android, Linux, Chromebook) without needing to log in or install anything.
            </p>
          </section>

          <section id="publish-seo" className="doc-section">
            <h2>Dynamic SEO & OpenGraph Social Sharing</h2>
            <p>
              When you paste your game link on Discord, Twitter/X, Reddit, WhatsApp, or Telegram:
            </p>
            <ul>
              <li>The server dynamically injects OpenGraph meta tags: <code>og:title</code>, <code>og:description</code>, <code>og:type="game"</code>, and <code>og:image</code>.</li>
              <li>A rich card preview appears automatically with your game title, description, and creator badge.</li>
              <li>All public games are automatically indexed in <a href="/sitemap.xml" target="_blank" className="inline-link">sitemap.xml</a> for Google and Bing search indexing.</li>
            </ul>
          </section>

          <section id="publish-arcade" className="doc-section">
            <h2>The Roblox & Steam-Style Arcade</h2>
            <p>
              The Yulya Studio Arcade (accessible at <button className="inline-link" onClick={() => setPage('arcade')}>/arcade</button>) is the central discovery hub for the entire community:
            </p>
            <ul>
              <li><strong>Spotlight Hero:</strong> Prominently highlights featured games with live animated badges.</li>
              <li><strong>Genre Filters:</strong> Filter instantly by ARCADE, ACTION, PUZZLE, PLATFORMER, SHOOTER, RACING, RPG, CASUAL, STRATEGY, and RETRO.</li>
              <li><strong>Sorting Engines:</strong> Sort by Most Played, Newest, or Title A-Z.</li>
            </ul>
          </section>
        </>
      )

    case 'player-count':
      return (
        <>
          <section id="plays-mechanism" className="doc-section">
            <h2>Atomic Click-Only Play Tracking</h2>
            <p>
              Player count is the heartbeat of the Yulya Studio Arcade. It reflects genuine human engagement with games made on the platform.
            </p>
            <div className="doc-callout security">
              <ShieldCheck size={16} className="callout-icon" />
              <div>
                <strong>Click-Only Execution Guarantee</strong>
                <p>
                  Player counts increment <strong>strictly</strong> when a user explicitly clicks to play the game (via an Arcade card, Hero Spotlight, Profile Play button, or Home Showcase dialog).
                </p>
              </div>
            </div>
            <p>
              The tracking engine calls a dedicated atomic backend endpoint:
            </p>
            <div className="docs-url-card">
              <span className="url-method post">POST</span>
              <code>/api/games/&#123;username&#125;/&#123;slug&#125;/play</code>
            </div>
            <p>
              This endpoint performs an atomic MongoDB <code>$inc: &#123; plays: 1 &#125;</code> and returns the updated count.
            </p>
          </section>

          <section id="plays-anti-bot" className="doc-section">
            <h2>Anti-Bot & Anti-Inflation Rules</h2>
            <p>
              To ensure fairness and accurate leaderboard rankings across all games:
            </p>
            <ul>
              <li><strong>No Asset Request Inflation:</strong> Fetching <code>index.html</code>, scripts, or images does NOT increment player counts. Web search engine crawlers (Googlebot, Bingbot) never trigger play counts.</li>
              <li><strong>No Reload Inflation:</strong> Refreshing the preview iframe inside the Studio IDE does NOT count as a play.</li>
              <li><strong>Atomic Concurrency:</strong> Database counters are synchronized atomically, preventing race conditions during viral traffic spikes.</li>
            </ul>
          </section>
        </>
      )

    case 'ownership-export':
      return (
        <>
          <section id="export-zip" className="doc-section">
            <h2>Owner-Only ZIP File Export</h2>
            <p>
              You own everything you create in Yulya Studio. At any time, you can export your entire project as a clean, portable <code>.zip</code> archive:
            </p>
            <ol>
              <li>Go to your <strong>Profile</strong> (<button className="inline-link" onClick={() => setPage('profile')}>/@profile</button>) or the Studio top menu.</li>
              <li>Click the <strong>3-dots menu</strong> on any of your game cards.</li>
              <li>Select <strong>Download ZIP (.zip)</strong>.</li>
            </ol>
            <p>
              The server packages all HTML, CSS, JavaScript, and media assets into a standard zip archive. You can unzip this folder and run it locally with any web server (like VS Code Live Server or Python <code>http.server</code>), host it on GitHub Pages, Vercel, Netlify, or publish it to itch.io!
            </p>
            <div className="doc-callout security">
              <ShieldCheck size={16} className="callout-icon" />
              <div>
                <strong>Strict Owner Verification</strong>
                <p>
                  The export endpoint verifies <code>owner_id == user["id"]</code>. Other players and visitors cannot download your source code zip.
                </p>
              </div>
            </div>
          </section>

          <section id="export-edit" className="doc-section">
            <h2>Editing Game Profiles & Metadata</h2>
            <p>
              Need to rename your game, update its description, or switch its genre?
            </p>
            <ul>
              <li>Click the <strong>3-dots menu</strong> on your game card in the Profile and select <strong>Edit Game Profile</strong>.</li>
              <li>Alternatively, click the small pencil icon right next to the game title.</li>
              <li>You can update:
                <ul>
                  <li><strong>Game Name / Title:</strong> Up to 100 characters.</li>
                  <li><strong>Game Description:</strong> Up to 500 characters describing mechanics, lore, or controls.</li>
                  <li><strong>Genre Category:</strong> Choose from Arcade, Action, Puzzle, Platformer, Shooter, Racing, RPG, Casual, Strategy, or Retro.</li>
                </ul>
              </li>
              <li>Click <strong>Save Game Profile</strong> to instantly sync your changes across the Arcade and Profile.</li>
            </ul>
          </section>

          <section id="export-ip" className="doc-section">
            <h2>Intellectual Property & Anti-Fork Policy</h2>
            <p>
              Unlike platforms that force all projects to be publicly remixable or cloneable, Yulya Studio respects creator ownership. There is <strong>no unauthorized remix or forking</strong>. Other users cannot clone your game into their account without your explicit permission.
            </p>
          </section>
        </>
      )

    case 'security-sandbox':
      return (
        <>
          <section id="sec-worker" className="doc-section">
            <h2>Private Worker HMAC Preview Tokens</h2>
            <p>
              When working on a private draft, how does the preview iframe run without exposing your project code to the public web?
            </p>
            <p>
              Yulya Studio uses cryptographically signed <strong>HMAC-SHA256 preview tokens</strong>:
            </p>
            <div className="docs-url-card">
              <span className="url-method">TOKEN</span>
              <code>/api/worker/private/&#123;uid&#125;/&#123;pid&#125;/<b>&#123;hmac_token&#125;</b>/index.html</code>
            </div>
            <ul>
              <li>Tokens are signed with a server secret and expire automatically after 24 hours (<code>ttl=86400</code>).</li>
              <li>Tokens encode the creator&rsquo;s user ID and project ID. Even if someone guesses the URL structure, the server rejects requests without a valid cryptographic signature.</li>
            </ul>
          </section>

          <section id="sec-csp" className="doc-section">
            <h2>Strict Content Security Policy (CSP)</h2>
            <p>
              Every game response includes a strict Content Security Policy header:
            </p>
            <ul>
              <li><strong>Frame Ancestors:</strong> Restricted to <code>'self'</code> and the Yulya Studio origin. Unapproved third-party websites cannot embed your games in malicious iframes.</li>
              <li><strong>Script Sources:</strong> Limited to <code>'self'</code>, safe inline scripts, and whitelisted CDNs (cdnjs, jsdelivr, unpkg, skypack, esm.sh).</li>
              <li><strong>Cookie Isolation:</strong> The preview iframe has zero access to HTTP-only authentication session cookies.</li>
            </ul>
          </section>

          <section id="sec-limits" className="doc-section">
            <h2>Rate Limiting & Abuse Prevention</h2>
            <p>
              To protect backend infrastructure from DDoS and automated bot spam:
            </p>
            <ul>
              <li>Project creation is rate-limited to 5 projects per minute per user.</li>
              <li>AI Copilot generation requests are rate-limited to 20 requests per minute per user.</li>
              <li>Authentication endpoints enforce brute-force mitigation per IP address.</li>
            </ul>
          </section>
        </>
      )

    case 'troubleshooting-faq':
      return (
        <>
          <section id="faq-audio" className="doc-section">
            <h2>Sound/Audio Does Not Play Automatically</h2>
            <div className="doc-callout warning">
              <AlertCircle size={16} className="callout-icon" />
              <div>
                <strong>Browser Autoplay Policy</strong>
                <p>
                  All modern browsers (Chrome, Edge, Safari, Firefox) strictly forbid audio from playing automatically without an explicit user gesture (such as clicking a &ldquo;Start Game&rdquo; or &ldquo;Mute/Unmute&rdquo; button).
                </p>
              </div>
            </div>
            <p>
              To fix this in your game code, resume the <code>AudioContext</code> on the first user interaction:
            </p>
            <div className="code-block-wrap">
              <pre><code>{`// Recommended AudioContext Resume Pattern
window.addEventListener('click', () => {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}, { once: true });`}</code></pre>
            </div>
          </section>

          <section id="faq-gemini-quota" className="doc-section">
            <h2>Gemini Quota Exceeded or Invalid Key</h2>
            <p>
              If the Copilot reports a rate limit or quota error:
            </p>
            <ul>
              <li><strong>Smart Waterfall Cascade:</strong> If you have multiple models configured, Yulya Studio automatically cascades to the next model (e.g. from Flash to Pro or Flash-Lite).</li>
              <li><strong>Verify in Google AI Studio:</strong> Check <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="inline-link">Google AI Studio</a> to ensure your project has not hit account-level RPM thresholds.</li>
              <li><strong>Update Key:</strong> Click <strong>Key</strong> in the topbar to test or replace your API key at any time.</li>
            </ul>
          </section>

          <section id="faq-black-screen" className="doc-section">
            <h2>Game Shows a Blank or Black Screen</h2>
            <ol>
              <li>Open the <strong>Terminal panel</strong> (<kbd>Ctrl</kbd> + <kbd>`</kbd> or click the Terminal icon at bottom left) to inspect runtime JavaScript errors.</li>
              <li>Verify that your <code>index.html</code> contains a valid <code>&lt;canvas&gt;</code> element or container with proper width and height styling.</li>
              <li>Check that external scripts are from permitted CDN domains (e.g., <code>cdnjs.cloudflare.com</code>, <code>cdn.jsdelivr.net</code>).</li>
            </ol>
          </section>

          <section id="faq-delete" className="doc-section">
            <h2>Deleting a Project Permanently</h2>
            <p>
              To completely purge a project:
            </p>
            <ul>
              <li>Navigate to your Profile (<button className="inline-link" onClick={() => setPage('profile')}>/@profile</button>).</li>
              <li>Click the 3-dots menu on the project card and select <strong>Delete Project</strong>.</li>
              <li>Confirm the purge dialog. This permanently removes the project, all source files, cover snapshots, and AI chat conversation turns from the database.</li>
            </ul>
          </section>

          <section id="faq-general" className="doc-section">
            <h2>Frequently Asked Questions</h2>
            <div className="docs-faq-list">
              <div className="faq-item">
                <h4>Can I play games on my smartphone or tablet?</h4>
                <p>Yes! Every published game runs in any mobile browser with full touch support. You can test touch controls directly in the Studio IDE using the Mobile view mode.</p>
              </div>
              <div className="faq-item">
                <h4>Is Yulya Studio free to use?</h4>
                <p>Yes. Yulya Studio is free to use. You bring your own free Gemini API key from Google AI Studio, meaning you never incur unexpected subscription charges.</p>
              </div>
              <div className="faq-item">
                <h4>Can I import external image assets or sounds?</h4>
                <p>You can create text and SVG files directly in the File Explorer, or load assets over HTTPS from CORS-enabled image hosts and CDNs whitelisted in the CSP.</p>
              </div>
            </div>
          </section>
        </>
      )

    default:
      return (
        <div className="doc-section">
          <h2>Topic Overview</h2>
          <p>Please select a topic from the left sidebar to read detailed guides and technical references.</p>
          <button className="button button-primary button-small" onClick={() => onOpenStudio ? onOpenStudio() : setPage('studio')}>
            Open Studio IDE
          </button>
        </div>
      )
  }
}
