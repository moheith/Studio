import { useState, useMemo, useEffect } from 'react'
import {
  Shield, CheckCircle2, Scale, Lock,
  ArrowLeft, ArrowRight, Printer, Search, Mail, ExternalLink,
  HelpCircle, ChevronRight, BookOpen, Flame
} from 'lucide-react'
import type { Page, User } from '../types'
import ProfileMenu from '../components/ProfileMenu'

type TermsPageProps = {
  user: User | null
  setPage: (page: Page) => void
  onOpenStudio?: () => void
  onLogin?: (user: User, csrfToken: string) => void
  onLogout?: () => void
  notify: (msg: string) => void
}

type TermSection = {
  id: string
  title: string
  plainEnglish: string
  content: React.ReactNode
}

export default function TermsPage({
  user,
  setPage,
  onOpenStudio,
  onLogin,
  onLogout,
  notify
}: TermsPageProps) {
  const [activeSectionId, setActiveSectionId] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.replace('#', '').trim()
      if (hash) return hash
    }
    return 'acceptance'
  })
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '').trim()
      if (hash) setActiveSectionId(hash)
    }
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  const sections: TermSection[] = [
    {
      id: 'acceptance',
      title: '1. Introduction, Definitions & Acceptance of Terms',
      plainEnglish:
        'By using Yulya Studio, creating an account, or playing games in the Arcade, you agree to these Terms. If you do not agree, you cannot use the platform.',
      content: (
        <>
          <p>
            Welcome to <strong>Yulya Studio</strong> (“we,” “our,” “us,” or the “Platform”), operated at{' '}
            <code>https://studio.yulya.me</code>. These Terms of Service (these “Terms”) constitute a legally
            binding contract between you (“User,” “Creator,” “you”) and Yulya Studio regarding your access to and
            use of our browser-native game engine, Monaco code editor, cloud-saved project workspace (the “Studio
            IDE”), community games showcase (the “Arcade”), AI coding assistant bridges, and associated software,
            APIs, and digital experiences (collectively, the “Service”).
          </p>
          <p>
            BY CLICKING “CREATE ACCOUNT,” “START CREATING,” “LOG IN,” ACCESSING THE STUDIO IDE, SAVING PROJECTS,
            OR PLAYING GAMES PUBLISHED ON THE PLATFORM, YOU EXPRESSLY AGREE TO BE BOUND BY THESE TERMS, OUR{' '}
            <a href="/privacy" onClick={(e) => { e.preventDefault(); setPage('privacy') }}>Privacy Policy</a>, AND
            ANY COMMUNITY GUIDELINES INCORPORATED HEREIN. IF YOU DO NOT AGREE TO BE BOUND BY ALL PROVISIONS OF
            THESE TERMS, DO NOT ACCESS OR USE THE SERVICE.
          </p>
          <h4>Key Definitions</h4>
          <ul>
            <li><strong>“Creator”</strong> means any registered user who author, builds, tests, or publishes games or interactive scripts on Yulya Studio.</li>
            <li><strong>“User”</strong> or <strong>“Player”</strong> means any individual who browses the platform, tests games, or plays games in the Arcade.</li>
            <li><strong>“User-Generated Content” (UGC)</strong> means all HTML5, CSS, TypeScript/JavaScript, WebGL shaders, 2D sprites, 3D meshes, audio samples, project titles, descriptions, and cover snapshots created, uploaded, or compiled by a Creator.</li>
            <li><strong>“Gemini API”</strong> refers to the generative AI models and endpoints provided by Google LLC accessible via user-supplied API keys.</li>
          </ul>
        </>
      )
    },
    {
      id: 'eligibility',
      title: '2. Eligibility, Accounts & Profile Handles (@username)',
      plainEnglish:
        'You must be at least 13 years old (or 16 in the EU/UK) to use Yulya Studio. You are responsible for safeguarding your credentials, and you cannot claim deceptive or trademark-infringing usernames.',
      content: (
        <>
          <p>
            To use Yulya Studio, you must meet the following eligibility standards:
          </p>
          <ul>
            <li>
              <strong>Age Requirement:</strong> You must be at least 13 years of age (or 16 years of age if you reside in the European Union or United Kingdom). If you are between the ages of 13 and the age of legal majority in your jurisdiction, you represent that your parent or legal guardian has reviewed and agreed to these Terms on your behalf.
            </li>
            <li>
              <strong>Account Integrity:</strong> You agree to provide true, accurate, and current information during registration. You may not register automated bot accounts or create accounts to evade previous bans or restrictions.
            </li>
            <li>
              <strong>Credential Security:</strong> You are solely responsible for maintaining the confidentiality of your session tokens, password hashes, and Gemini API keys. Any activity performed under your account is deemed performed by you.
            </li>
            <li>
              <strong>Username Ownership (@username):</strong> We grant you a revocable, non-exclusive license to use a unique creator handle. You may not register usernames for speculative resale (“username squatting”), misrepresent your identity, impersonate another creator or trademark holder, or select offensive handles. Yulya Studio reserves the absolute right to reclaim, rename, or reassign handles that infringe trademarks or violate these Terms.
            </li>
          </ul>
        </>
      )
    },
    {
      id: 'studio-runtime',
      title: '3. Studio IDE, Browser Runtime & Sandbox Security',
      plainEnglish:
        'Games run in a secure, isolated sandbox inside your browser. You may not use the studio to build malware, crypto miners, exploit browser security, or mount denial-of-service attacks.',
      content: (
        <>
          <p>
            Yulya Studio provides an in-browser code editor based on the Monaco engine paired with a sandboxed
            live execution frame (<code>&lt;iframe&gt;</code>) protected by Content Security Policies (CSP) and
            cryptographic preview tokens.
          </p>
          <p>When utilizing the Studio IDE, you agree not to compile, run, or publish:</p>
          <ul>
            <li>Cryptocurrency miners, distributed computing scripts, or background battery/processor exhaustion routines.</li>
            <li>Malicious code, rootkits, keystroke loggers, credential stealers, or exploits targeting WebGL, Web Audio, or browser vulnerabilities.</li>
            <li>Code that attempts to break out of the <code>&lt;iframe&gt;</code> sandbox, access parent window <code>localStorage</code>, or bypass cross-origin restrictions.</li>
            <li>Scripts that mount automated denial-of-service (DoS) attacks, flood external APIs, or probe internal networks.</li>
            <li>Intrusive advertising, pop-up storms, deceptive redirection loops, or phishing dialogs styled to mimic platform login screens.</li>
          </ul>
          <p>
            We reserve the right to immediately terminate preview execution and revoke projects exhibiting abusive computational patterns or malicious security triggers.
          </p>
        </>
      )
    },
    {
      id: 'gemini-ai',
      title: '4. AI Coding Assistant & Google Gemini API (BYOK Model)',
      plainEnglish:
        'Our AI assistant runs using your connected Google Gemini API key. Your key is encrypted with AES-256-GCM. AI code is provided "as is" and you are responsible for testing and validating any AI-generated code before publishing.',
      content: (
        <>
          <p>
            Yulya Studio incorporates an artificial intelligence copilot and autonomous playtesting engine powered by
            Google Gemini models (e.g., Gemini 2.5 Flash, Gemini 2.5 Pro).
          </p>
          <h4>Bring-Your-Own-Key (BYOK) Responsibility</h4>
          <p>
            Creators connect their personal Gemini API key obtained from Google AI Studio. By connecting a key:
          </p>
          <ul>
            <li>Your key is encrypted in transit and at rest using authenticated <strong>AES-256-GCM</strong> encryption. We never sell, share, or log raw plaintext keys.</li>
            <li>You are solely responsible for all API requests dispatched through your key, including adherence to Google’s Generative AI Prohibited Use Policy and any billing incurred under your Google Cloud / Google AI Studio account.</li>
            <li>You may rotate, update, or permanently delete your stored API key at any time from the Studio settings modal.</li>
          </ul>
          <h4>Nature of AI-Generated Content & Code Disclaimer</h4>
          <p>
            Artificial intelligence models output probabilistic responses. Yulya Studio makes NO representations or
            warranties regarding the accuracy, completeness, security, non-infringement, or fitness of code generated
            by the AI assistant. You acknowledge that:
          </p>
          <ul>
            <li>AI suggestions may contain syntax bugs, logic errors, security vulnerabilities, or suboptimal performance characteristics.</li>
            <li>You bear sole responsibility for reviewing, testing, auditing, and debugging any code produced with the assistance of the AI copilot prior to publishing it publicly.</li>
            <li>AI outputs do not convey independent copyright protection to the exclusion of third-party open-source licenses.</li>
          </ul>
        </>
      )
    },
    {
      id: 'ip-ownership',
      title: '5. Intellectual Property & Creator Ownership of UGC',
      plainEnglish:
        'You own what you create. All original game code, art, music, and design authored by you belong to you 100%. We do not claim ownership of your games.',
      content: (
        <>
          <p>
            We firmly believe in empowering creators. You retain complete intellectual property ownership, copyright,
            title, and interest in and to all original code, scripts, storyboards, 2D canvas graphics, 3D assets, sound
            effects, and game concepts that you author in Yulya Studio (“Creator IP”).
          </p>
          <p>
            Nothing in these Terms shall be construed as transferring ownership of your original games, codebases, or
            intellectual property to Yulya Studio.
          </p>
          <h4>Creator Warranties</h4>
          <p>You represent and warrant that:</p>
          <ul>
            <li>You own or possess all necessary rights, licenses, and permissions to author, compile, and publish your game.</li>
            <li>Your game and its assets (textures, music, fonts, libraries) do not infringe, misappropriate, or violate any patent, copyright, trademark, trade secret, or privacy right of any third party.</li>
            <li>Open-source libraries imported via CDNs (such as Three.js, Phaser, PixiJS, Kaboom) comply with their respective open-source licenses (e.g., MIT, Apache 2.0).</li>
          </ul>
        </>
      )
    },
    {
      id: 'platform-license',
      title: '6. License Granted to Yulya Studio for Platform Operation',
      plainEnglish:
        'To host your game, show it in the Arcade, generate previews, and let people play it online, you grant us a worldwide license to run and display your game on our platform.',
      content: (
        <>
          <p>
            By saving projects, uploading files, or publishing games to public visibility on Yulya Studio, you grant
            Yulya Studio a worldwide, non-exclusive, royalty-free, sublicensable, and transferable license to:
          </p>
          <ul>
            <li>Host, store, cache, execute, bundle, transcode, and serve your game files and assets on our servers and edge content delivery networks (CDNs).</li>
            <li>Display, showcase, and run your game inside our web-based Arcade, device previews, and public search directories.</li>
            <li>Capture, resize, and display cover snapshot thumbnails to represent your game in the Arcade catalog, social media OpenGraph cards, and search engine snippets.</li>
            <li>Index metadata (game title, description, creator username, tags) for on-site search, Google, Bing, and XML sitemaps.</li>
          </ul>
          <p>
            This license exists solely for the technical operation, hosting, optimization, discovery, and promotion of
            the Service. You may revoke this license for future distribution at any time by toggling your project’s
            visibility to “Private” or permanently deleting the project from your dashboard.
          </p>
        </>
      )
    },
    {
      id: 'player-counts',
      title: '7. Strictly Click-to-Play Tracking & Anti-Bot Policy',
      plainEnglish:
        'Player counts only increase when a real person clicks to play a game. Using bots, click-farms, or automated scripts to fake game plays is strictly banned.',
      content: (
        <>
          <p>
            Yulya Studio operates a transparent, merit-based Arcade. Play counters are engineered with atomic increment
            rules designed to reflect genuine human engagement:
          </p>
          <ul>
            <li><strong>Click-to-Play Activation:</strong> A play count increment is triggered solely when a user initiates active gameplay (such as clicking “Play Game” or launching full-screen mode). Mere page impressions or crawler visits never increment play counters.</li>
            <li><strong>Anti-Inflation & Rate Limiting:</strong> Rapid repeated clicks from identical sessions or hashed IPs within short cooldown windows are deduplicated.</li>
            <li><strong>Prohibition of Artificial Inflation:</strong> You agree not to deploy automated bots, headless scrapers, traffic exchange networks, micro-task click farms, or scripts designed to artificially inflate play counts, likes, or discovery ranks.</li>
          </ul>
          <p>
            Accounts found manipulating telemetry or falsifying engagement will have their play counts reset to zero,
            and repeated offenses will result in permanent delisting from the Arcade and account termination.
          </p>
        </>
      )
    },
    {
      id: 'source-protection',
      title: '8. Source Code Protection, Export & Anti-Fork Policy',
      plainEnglish:
        'Only the game owner can download the complete project ZIP. Other users cannot clone or re-upload your game without your express permission.',
      content: (
        <>
          <p>
            Unlike open-remix scratchpads that expose raw source code to anyone without permission, Yulya Studio enforces
            strict intellectual property safeguards:
          </p>
          <ul>
            <li><strong>Owner-Exclusive ZIP Export:</strong> The full standalone project package (.zip), including all HTML, TypeScript/JavaScript, CSS, and asset manifests, can ONLY be downloaded by the authenticated creator who owns the project.</li>
            <li><strong>Anti-Fork & Anti-Scraping Protection:</strong> Public games in the Arcade are served as bundled client experiences for play. We do not provide a one-click “Remix” or “Fork” button that duplicates private project trees without creator authorization.</li>
            <li><strong>Prohibition on Plagiarism:</strong> Scraping, reverse-engineering, or ripping assets from another creator’s published game to re-upload it as your own creation is a direct breach of these Terms and ground for immediate takedown and account suspension.</li>
          </ul>
        </>
      )
    },
    {
      id: 'acceptable-use',
      title: '9. Acceptable Use Policy & Community Standards',
      plainEnglish:
        'Do not post hateful content, harassment, pornography, scams, copyright-infringing content, or anything illegal. Keep the platform creative, safe, and fun.',
      content: (
        <>
          <p>
            Yulya Studio is dedicated to maintaining an inspiring, inclusive, and high-performance environment for all
            game makers. You agree that you will not author, publish, or link to any content or games that:
          </p>
          <ul>
            <li>Contain or promote Child Sexual Abuse Material (CSAM), child exploitation, or sexual grooming of minors (reported immediately to NCMEC and law enforcement).</li>
            <li>Incite violence, promote terrorism, or attack individuals based on race, ethnicity, religion, disability, sexual orientation, gender identity, or national origin.</li>
            <li>Constitute cyberbullying, stalking, dox personal contact details, or incite targeted harassment against any person.</li>
            <li>Depict non-consensual sexual content, explicit pornography, or gore designed to shock.</li>
            <li>Promote fraudulent investment schemes, pyramid systems, deceptive giveaways, or unauthorized commercial gambling.</li>
            <li>Interfere with, disable, or tamper with our servers, authentication mechanisms, CSRF tokens, or rate-limiting guards.</li>
          </ul>
        </>
      )
    },
    {
      id: 'dmca',
      title: '10. DMCA Copyright Infringement & Takedown Procedure',
      plainEnglish:
        'We respect intellectual property. If someone published your copyrighted game, art, or music without permission, contact our designated DMCA agent to request a takedown.',
      content: (
        <>
          <p>
            Yulya Studio complies with the Digital Millennium Copyright Act of 1998 (17 U.S.C. § 512, “DMCA”) and
            applicable international copyright directives. If you believe your copyrighted work has been copied,
            distributed, or showcased on the Platform in a manner that constitutes infringement, please submit a written
            notification to our Designated DMCA Copyright Agent.
          </p>
          <h4>Submitting a Valid DMCA Notice</h4>
          <p>To be effective under 17 U.S.C. § 512(c)(3), your notice must include:</p>
          <ol>
            <li>A physical or electronic signature of a person authorized to act on behalf of the owner of the copyright interest.</li>
            <li>Identification of the copyrighted work claimed to have been infringed (or a representative list if multiple works).</li>
            <li>Identification of the material claimed to be infringing, including the specific URL on Yulya Studio (e.g., <code>https://studio.yulya.me/username/game-slug</code>).</li>
            <li>Information reasonably sufficient to permit us to contact you (legal name, address, telephone number, and email address).</li>
            <li>A statement that you have a good-faith belief that use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law.</li>
            <li>A statement that the information in the notification is accurate, and under penalty of perjury, that you are authorized to act on behalf of the owner.</li>
          </ol>
          <div className="legal-contact-callout">
            <Mail size={16} />
            <span>Designated DMCA Agent Email: <a href="mailto:dmca@yulya.me">dmca@yulya.me</a></span>
          </div>
          <h4>Counter-Notification & Repeat Infringer Policy</h4>
          <p>
            If your project was removed due to a DMCA notice and you believe this was an error or misidentification, you
            may submit a formal Counter-Notification under § 512(g)(3). In accordance with the DMCA, Yulya Studio
            maintains a strict policy of terminating the accounts of repeat copyright infringers.
          </p>
        </>
      )
    },
    {
      id: 'warranty-disclaimer',
      title: '11. Disclaimer of Warranties ("AS IS" & "AS AVAILABLE")',
      plainEnglish:
        'Yulya Studio is provided without warranties of any kind. While we do our best to maintain 100% uptime and protect your data, you use the service at your own risk.',
      content: (
        <>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED UNDER APPLICABLE LAW, YULYA STUDIO, ITS AFFILIATES, OFFICERS, DIRECTORS,
            EMPLOYEES, AND LICENSORS PROVIDE THE PLATFORM, STUDIO IDE, ARCADE, HOSTING INFRASTRUCTURE, AND AI
            ASSISTANTS ON AN “AS IS” AND “AS AVAILABLE” BASIS, WITH ALL FAULTS AND DEFECTS, WITHOUT WARRANTY OF ANY
            KIND.
          </p>
          <p>
            WE EXPRESSLY DISCLAIM ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WITHOUT
            LIMITATION THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, QUIET
            ENJOYMENT, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT:
          </p>
          <ul>
            <li>The Service will meet your specific technical or creative requirements.</li>
            <li>The Service will operate uninterrupted, secure, bug-free, or compatible with all browser versions or mobile devices.</li>
            <li>Project drafts, autosaved code files, or game state will never experience corruption, loss, or downtime.</li>
            <li>AI-generated code suggestions will compile cleanly or achieve specific framerates.</li>
          </ul>
        </>
      )
    },
    {
      id: 'limitation-liability',
      title: '12. Limitation of Liability & User Indemnification',
      plainEnglish:
        'Our legal liability is limited to the fullest extent permitted by law. You agree to hold us harmless if someone sues us because of a game or code you created.',
      content: (
        <>
          <p>
            UNDER NO CIRCUMSTANCES SHALL YULYA STUDIO, ITS OPERATORS, FOUNDERS, AFFILIATES, OR CONTRACTORS BE LIABLE TO
            YOU OR ANY THIRD PARTY FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, PUNITIVE, OR EXEMPLARY DAMAGES,
            INCLUDING DAMAGES FOR LOSS OF REVENUE, PROFITS, BUSINESS GOODWILL, DATA LOSS, DEVICE CORRUPTION, OR COSTS OF
            SUBSTITUTE GOODS, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OR INABILITY TO USE THE SERVICE.
          </p>
          <p>
            IN NO EVENT SHALL OUR AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE EXCEED THE
            GREATER OF: (A) FIFTY UNITED STATES DOLLARS ($50.00 USD), OR (B) THE TOTAL AMOUNT PAID BY YOU TO YULYA
            STUDIO IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
          </p>
          <h4>Creator Indemnification</h4>
          <p>
            You agree to defend, indemnify, and hold harmless Yulya Studio and its officers from and against any claims,
            liabilities, damages, losses, costs, or reasonable legal fees arising out of: (i) your User-Generated Content;
            (ii) your breach of these Terms; or (iii) your violation of any third-party intellectual property or privacy right.
          </p>
        </>
      )
    },
    {
      id: 'termination',
      title: '13. Account Suspension, Deletion & Termination',
      plainEnglish:
        'You can delete your account at any time. We may suspend or terminate accounts that violate our rules, endanger security, or break the law.',
      content: (
        <>
          <p>
            <strong>Termination by You:</strong> You have the right to terminate your account and relationship with Yulya
            Studio at any time. You may delete projects individually or request full account termination by contacting{' '}
            <a href="mailto:support@yulya.me">support@yulya.me</a>.
          </p>
          <p>
            <strong>Termination by Us:</strong> We reserve the right to temporarily suspend, restrict, or permanently
            terminate your access to the Service at any time, with or without prior notice, if:
          </p>
          <ul>
            <li>You breach any material provision of these Terms or our Acceptable Use Policy.</li>
            <li>We are required to do so by court order, statutory directive, or government authority.</li>
            <li>Your actions introduce severe technical vulnerabilities, DDoS attacks, or security threats to our platform or other creators.</li>
          </ul>
          <p>
            Upon termination, your right to use the Studio IDE ceases immediately. Provisions regarding Intellectual Property
            ownership, Disclaimers, Limitations of Liability, and Indemnification shall survive termination.
          </p>
        </>
      )
    },
    {
      id: 'governing-law',
      title: '14. Governing Law, Dispute Resolution & Miscellaneous',
      plainEnglish:
        'These terms are governed by standard applicable commercial laws. Any dispute will be resolved on an individual basis. If one part of these terms is invalid, the rest remains in effect.',
      content: (
        <>
          <p>
            <strong>Governing Law:</strong> These Terms and any disputes arising out of or related to your use of Yulya
            Studio shall be governed by and construed in accordance with the laws of the State of California, United
            States, without giving effect to conflict of law principles.
          </p>
          <p>
            <strong>Informal Resolution:</strong> Before initiating formal proceedings, you and Yulya Studio agree to
            first attempt to resolve any dispute, claim, or controversy informally by sending a written notice of dispute to{' '}
            <a href="mailto:legal@yulya.me">legal@yulya.me</a> detailing the nature of the claim and requested relief.
          </p>
          <p>
            <strong>Class Action Waiver:</strong> TO THE EXTENT PERMITTED BY LAW, ALL CLAIMS MUST BE BROUGHT IN THE
            PARTIES’ INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS OR REPRESENTATIVE
            PROCEEDING.
          </p>
          <p>
            <strong>Severability & Entire Agreement:</strong> If any provision of these Terms is held invalid or
            unenforceable, that provision will be enforced to the maximum extent permissible, and the remaining provisions
            will remain in full force. These Terms constitute the complete understanding between you and Yulya Studio
            regarding the Service.
          </p>
          <div className="legal-contact-callout">
            <Mail size={16} />
            <span>Legal Department Email: <a href="mailto:legal@yulya.me">legal@yulya.me</a></span>
          </div>
        </>
      )
    }
  ]

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections
    const q = searchQuery.toLowerCase().trim()
    return sections.filter(
      s => s.title.toLowerCase().includes(q) || s.plainEnglish.toLowerCase().includes(q)
    )
  }, [searchQuery, sections])

  const selectSection = (id: string) => {
    setActiveSectionId(id)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${id}`)
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="legal-shell">
      {/* 1. TOPBAR */}
      <header className="legal-topbar">
        <div className="legal-topbar-left">
          <button className="legal-nav-back-btn" onClick={() => setPage('home')} title="Return to Home">
            <ArrowLeft size={16} />
            <span>Home</span>
          </button>
          <div className="legal-brand" onClick={() => setPage('home')}>
            <span className="brand-mark">✳</span>
            <span className="brand-text">yulya<span className="brand-light">studio</span></span>
            <span className="legal-pill">LEGAL</span>
          </div>
        </div>

        <div className="legal-topbar-center">
          <button className="legal-switch-btn active">
            <Scale size={14} />
            <span>Terms of Service</span>
          </button>
          <button className="legal-switch-btn" onClick={() => setPage('privacy')}>
            <Shield size={14} />
            <span>Privacy Policy</span>
          </button>
        </div>

        <div className="legal-topbar-right">
          <button
            className="legal-action-btn"
            onClick={() => window.print()}
            title="Print or Save PDF"
          >
            <Printer size={15} />
            <span className="hide-mobile">Print / PDF</span>
          </button>
          <button className="button button-primary button-small" onClick={() => setPage('arcade')}>
            Arcade <ArrowRight size={14} />
          </button>
          <ProfileMenu
            user={user}
            setPage={setPage}
            onLogout={onLogout || (() => {})}
            onOpenStudio={onOpenStudio || (() => setPage('studio'))}
            onLogin={onLogin || (() => {})}
            notify={notify}
          />
        </div>
      </header>

      {/* 2. HERO HEADER */}
      <div className="legal-hero">
        <div className="legal-hero-inner">
          <div className="legal-meta-badge">
            <Scale size={13} />
            <span>BINDING LEGAL CONTRACT &bull; EFFECTIVE NOVEMBER 9, 2026</span>
          </div>
          <h1>Terms of Service &amp; Conditions</h1>
          <p className="legal-subtitle">
            Everything you need to know about your rights as a creator, platform rules, sandbox security, and our zero-fork intellectual property protection.
          </p>
          <div className="legal-highlights-grid">
            <div className="legal-hl-card">
              <CheckCircle2 size={16} className="text-mint" />
              <div>
                <strong>100% Creator Ownership</strong>
                <span>You own all code, art, and music you write in the Studio.</span>
              </div>
            </div>
            <div className="legal-hl-card">
              <Lock size={16} className="text-peach" />
              <div>
                <strong>Zero-Fork Source Protection</strong>
                <span>Only you can export your complete project source code (.zip).</span>
              </div>
            </div>
            <div className="legal-hl-card">
              <Flame size={16} className="text-lilac" />
              <div>
                <strong>Click-Only Play Tracking</strong>
                <span>Legitimate atomic plays without automated bots or click-farms.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. MAIN BODY & TOC SIDEBAR */}
      <div className="legal-container">
        {/* Sticky Sidebar Navigation */}
        <aside className="legal-sidebar">
          <div className="legal-search-box">
            <Search size={14} className="legal-search-icon" />
            <input
              type="text"
              placeholder="Search legal terms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="legal-search-input"
            />
          </div>

          <div className="legal-toc-title">TABLE OF CONTENTS</div>
          <nav className="legal-toc-nav">
            {filteredSections.map((sec) => (
              <button
                key={sec.id}
                className={`legal-toc-link ${activeSectionId === sec.id ? 'active' : ''}`}
                onClick={() => selectSection(sec.id)}
              >
                <ChevronRight size={13} className="toc-arrow" />
                <span>{sec.title}</span>
              </button>
            ))}
          </nav>

          <div className="legal-sidebar-footer">
            <div className="legal-need-help">
              <HelpCircle size={15} />
              <span>Have legal questions?</span>
            </div>
            <a href="mailto:legal@yulya.me" className="legal-support-link">
              Contact legal@yulya.me <ExternalLink size={12} />
            </a>
          </div>
        </aside>

        {/* Legal Text Articles */}
        <main className="legal-content">
          {filteredSections.map((sec) => (
            <article key={sec.id} id={sec.id} className="legal-article">
              <h2>{sec.title}</h2>

              {/* Plain English Summary Callout */}
              <div className="plain-english-box">
                <div className="plain-english-header">
                  <BookOpen size={14} />
                  <span>IN PLAIN ENGLISH (SUMMARY)</span>
                </div>
                <p>{sec.plainEnglish}</p>
              </div>

              <div className="legal-body">
                {sec.content}
              </div>
            </article>
          ))}

          {/* Bottom Contact Section */}
          <div className="legal-contact-footer">
            <h3>Questions or Concerns Regarding These Terms?</h3>
            <p>
              If you have any questions, trademark inquiries, or DMCA notifications, our legal team is available:
            </p>
            <div className="legal-emails-row">
              <div className="legal-email-badge">
                <Mail size={15} />
                <span>General Legal: <strong>legal@yulya.me</strong></span>
              </div>
              <div className="legal-email-badge">
                <Shield size={15} />
                <span>DMCA &amp; IP: <strong>dmca@yulya.me</strong></span>
              </div>
              <div className="legal-email-badge">
                <Lock size={15} />
                <span>Privacy &amp; Security: <strong>privacy@yulya.me</strong></span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
