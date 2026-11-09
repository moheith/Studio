import { useState, useMemo, useEffect } from 'react'
import {
  Shield, Lock, EyeOff, Scale,
  ArrowLeft, ArrowRight, Printer, Search, Mail, ExternalLink,
  ChevronRight, BookOpen, Database, KeyRound
} from 'lucide-react'
import type { Page, User } from '../types'
import ProfileMenu from '../components/ProfileMenu'

type PrivacyPolicyPageProps = {
  user: User | null
  setPage: (page: Page) => void
  onOpenStudio?: () => void
  onLogin?: (user: User, csrfToken: string) => void
  onLogout?: () => void
  notify: (msg: string) => void
}

type PrivacySection = {
  id: string
  title: string
  plainEnglish: string
  content: React.ReactNode
}

export default function PrivacyPolicyPage({
  user,
  setPage,
  onOpenStudio,
  onLogin,
  onLogout,
  notify
}: PrivacyPolicyPageProps) {
  const [activeSectionId, setActiveSectionId] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.replace('#', '').trim()
      if (hash) return hash
    }
    return 'overview'
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

  const sections: PrivacySection[] = [
    {
      id: 'overview',
      title: '1. Introduction & Our Core Privacy Principles',
      plainEnglish:
        'We believe in zero surveillance capitalism. We build creative tools, not advertising networks. We never sell your data, we never run third-party tracking ads, and you have complete control over your code and account.',
      content: (
        <>
          <p>
            Welcome to the <strong>Privacy Policy</strong> for <strong>Yulya Studio</strong> (“we,” “us,” or “our”),
            available at <code>https://studio.yulya.me</code>. This policy explains in transparent, clear language how we
            collect, use, disclose, protect, and retain personal information when you access our browser-native IDE,
            publish to the Arcade, utilize our AI copilot, or interact with our services.
          </p>
          <p>
            Yulya Studio acts as the <strong>Data Controller</strong> under the European Union General Data Protection
            Regulation (EU GDPR), the United Kingdom GDPR, and applicable global data privacy statutes.
          </p>
          <h4>Our Core Privacy Commitments</h4>
          <ul>
            <li><strong>Zero Sale of Personal Data:</strong> We do NOT sell, rent, monetize, or trade your personal information, source code, or game assets to data brokers, ad exchanges, or marketing firms.</li>
            <li><strong>Zero Invasive Ad Trackers:</strong> We do not embed Facebook Pixels, Google AdSense, cross-site tracking beacons, or behavioural profiling scripts.</li>
            <li><strong>End-to-End Cryptographic Security:</strong> Sensitive user-supplied credentials, such as Google Gemini API keys, are protected with military-grade <strong>AES-256-GCM</strong> authenticated encryption.</li>
            <li><strong>Full Data Portability:</strong> You can export your entire project source code (.zip) at any time, or request complete account erasure with all associated data permanently deleted.</li>
          </ul>
        </>
      )
    },
    {
      id: 'info-collected',
      title: '2. Information We Collect & Why',
      plainEnglish:
        'We only collect the minimum data necessary to run your studio account, save your projects, securely encrypt your API key, and prevent spam bots.',
      content: (
        <>
          <p>
            We collect personal information across three distinct categories, strictly limited to what is necessary to
            operate the platform:
          </p>
          <h4>A. Information You Provide to Us Directly</h4>
          <div className="legal-table-wrapper">
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Data Category</th>
                  <th>Specific Elements</th>
                  <th>Operational Purpose</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Account Credentials</strong></td>
                  <td>Username (@username), email address, salted password hash (one-way Argon2/PBKDF2)</td>
                  <td>Authenticating user sessions, verifying creator identity, and sending password reset tokens.</td>
                </tr>
                <tr>
                  <td><strong>Creator Profile</strong></td>
                  <td>Display name, short bio, avatar URL, social links (optional)</td>
                  <td>Displaying your public portfolio page at <code>/{'{username}'}</code> in the Arcade.</td>
                </tr>
                <tr>
                  <td><strong>Project Code &amp; Assets</strong></td>
                  <td>HTML5, JavaScript, CSS, audio assets, canvas game files, project metadata</td>
                  <td>Saving, bundling, compiling, and hosting your game projects in the Studio IDE.</td>
                </tr>
                <tr>
                  <td><strong>Gemini API Key</strong></td>
                  <td>User-provided Google AI Studio API key (AES-256-GCM encrypted)</td>
                  <td>Communicating directly with Google Gemini endpoints for code generation on your behalf.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4>B. Information Collected Automatically Through Platform Use</h4>
          <ul>
            <li><strong>Session Telemetry:</strong> Ephemeral session tokens (JWT) and CSRF validation tokens required to prevent Cross-Site Request Forgery attacks.</li>
            <li><strong>Strictly Click-to-Play Counter:</strong> When a user clicks to play a game in the Arcade, an atomic counter increments. We record a hashed, non-reversible representation of the IP address with a cooldown timestamp to prevent artificial bot inflation.</li>
            <li><strong>Server Logs &amp; Security Audits:</strong> Standard web server logs containing truncated IP addresses, browser user-agents, HTTP status codes, and timestamps to detect DDoS attacks, unauthorized access attempts, and runtime server errors.</li>
          </ul>
        </>
      )
    },
    {
      id: 'info-not-collected',
      title: '3. Information We Explicitly DO NOT Collect',
      plainEnglish:
        'We do not collect credit cards, home addresses, government IDs, biometric data, or private user location tracking.',
      content: (
        <>
          <p>
            To eliminate unnecessary privacy risks, Yulya Studio operates under strict data minimization rules. We do
            NOT collect or process:
          </p>
          <ul>
            <li><strong>Payment Card Information:</strong> Yulya Studio is free to use. We do not store credit card numbers, CVVs, bank account information, or billing street addresses.</li>
            <li><strong>Government Identification:</strong> We never request Social Security numbers, driver’s licenses, passport scans, or national identity documents.</li>
            <li><strong>Precise Geolocation Data:</strong> We do not track GPS coordinates, Wi-Fi triangulation, or precise physical location.</li>
            <li><strong>Biometric or Health Data:</strong> We never capture facial geometry, voiceprints, fingerprints, or health records.</li>
            <li><strong>Third-Party Social Browsing History:</strong> We do not track websites you visit outside of <code>studio.yulya.me</code>.</li>
          </ul>
        </>
      )
    },
    {
      id: 'legal-bases',
      title: '4. Legal Bases for Processing (EU & UK GDPR Art. 6)',
      plainEnglish:
        'Under European privacy law, we must have a lawful reason to handle your information. We rely on fulfilling our contract with you, platform security, and legal obligations.',
      content: (
        <>
          <p>
            For creators and players residing within the European Economic Area (EEA), the United Kingdom, or
            Switzerland, our legal bases for processing personal data under Article 6 of the General Data Protection
            Regulation (GDPR) are:
          </p>
          <ul>
            <li>
              <strong>Performance of a Contract (Art. 6(1)(b) GDPR):</strong> Processing is necessary to provide the Studio
              IDE, manage your creator account, store project drafts in MongoDB, bundle your game assets, and host your
              published games in the Arcade in accordance with our <a href="/terms" onClick={(e) => { e.preventDefault(); setPage('terms') }}>Terms of Service</a>.
            </li>
            <li>
              <strong>Legitimate Interests (Art. 6(1)(f) GDPR):</strong> Processing is necessary to maintain security,
              prevent DDoS attacks, authenticate preview tokens, detect fraudulent click bots, monitor server stability,
              and protect creators’ intellectual property rights.
            </li>
            <li>
              <strong>Consent (Art. 6(1)(a) GDPR):</strong> When you explicitly connect your Gemini API key or choose to
              publish your creator profile and games publicly to the Arcade. You may revoke consent at any time.
            </li>
            <li>
              <strong>Legal Obligation (Art. 6(1)(c) GDPR):</strong> When compliance with applicable statutory laws,
              formal court subpoenas, or copyright takedown directives (DMCA) is required.
            </li>
          </ul>
        </>
      )
    },
    {
      id: 'how-we-use',
      title: '5. How We Use & Process Your Information',
      plainEnglish:
        'Your information is used strictly to run your IDE, let you build and play games, connect to Gemini AI, and keep the community secure.',
      content: (
        <>
          <p>We process the personal information we collect exclusively for the following purposes:</p>
          <ul>
            <li>To provide, operate, maintain, and enhance the browser IDE and Monaco code editor.</li>
            <li>To authenticate you and verify your email address via 6-digit one-time verification passcodes.</li>
            <li>To encrypt and decrypt your Google Gemini API key on-the-fly during active AI generation turns.</li>
            <li>To render device preview viewports (16:9 HD, Mobile, Tablet, Fullscreen) in isolated sandboxes.</li>
            <li>To capture and composite clean cover snapshots of your games for the Arcade catalog and social preview tags.</li>
            <li>To calculate legitimate, click-only game player totals and display creator achievements.</li>
            <li>To protect our users and infrastructure against malware, automated scraping, bot manipulation, and abuse.</li>
            <li>To communicate vital operational updates, system alerts, or security notifications. (We never send unsolicited promotional spam).</li>
          </ul>
        </>
      )
    },
    {
      id: 'zero-sale',
      title: '6. Zero Sale or Sharing of Personal Information',
      plainEnglish:
        'We never sell your data, ever. We do not participate in cross-context behavioral ad networks or data broker exchanges.',
      content: (
        <>
          <p>
            <strong>We do not sell personal information.</strong> Yulya Studio has never sold, rented, leased, or
            monetized user personal information, source code, game assets, or usage data to any third party, and we will
            never do so.
          </p>
          <p>
            Under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA), the term “sale”
            is broadly defined to include sharing personal information for monetary or other valuable consideration.
            Even under this broad statutory standard, Yulya Studio does NOT sell or share personal information for
            cross-context behavioral advertising.
          </p>
        </>
      )
    },
    {
      id: 'subprocessors',
      title: '7. Third-Party Subprocessors & Data Transfers',
      plainEnglish:
        'We only work with top-tier infrastructure partners like MongoDB for cloud storage, Google Cloud for Gemini AI, and Cloudflare for DDoS protection.',
      content: (
        <>
          <p>
            To deliver an enterprise-grade cloud experience, Yulya Studio partners with specialized third-party service
            providers (“Subprocessors”). Each subprocessor undergoes rigorous security and privacy audits and is bound
            by contractual Data Processing Agreements (DPAs) with strict confidentiality and GDPR Standard Contractual
            Clauses (SCCs):
          </p>

          <div className="legal-table-wrapper">
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Subprocessor</th>
                  <th>Role &amp; Function</th>
                  <th>Data Transferred</th>
                  <th>Location &amp; Safeguards</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>MongoDB Atlas</strong></td>
                  <td>Encrypted Cloud Database</td>
                  <td>User accounts, project files, chat context, metadata</td>
                  <td>United States / EU (SOC 2, ISO 27001, AES-256 encryption at rest)</td>
                </tr>
                <tr>
                  <td><strong>Google Cloud / AI Studio</strong></td>
                  <td>Generative AI Model Inference</td>
                  <td>User prompt text, code snippets sent to Gemini (only when user prompts AI)</td>
                  <td>United States (SOC 2, ISO 27001, TLS 1.3 in-transit encryption)</td>
                </tr>
                <tr>
                  <td><strong>Cloudflare, Inc.</strong></td>
                  <td>Edge CDN, SSL Termination &amp; DDoS Protection</td>
                  <td>IP address, request headers, cached public game bundles</td>
                  <td>Global Edge Network (SOC 2 Type II, ISO 27701, Privacy Pass)</td>
                </tr>
                <tr>
                  <td><strong>Transactional Email Provider</strong></td>
                  <td>Email Delivery Service</td>
                  <td>Recipient email, 6-digit one-time verification passcode</td>
                  <td>United States / EU (GDPR SCCs, TLS encrypted email dispatch)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )
    },
    {
      id: 'cookies-storage',
      title: '8. Client-Side Storage, Cookies & Security Tokens',
      plainEnglish:
        'We only use strictly necessary cookies to keep you logged in and protect against CSRF attacks. No third-party ad tracking cookies.',
      content: (
        <>
          <p>
            Yulya Studio uses strictly functional, security-focused client-side storage mechanisms. In accordance with
            the EU ePrivacy Directive (Directive 2002/58/EC) and EDPB Guidelines, strictly necessary technical cookies do
            not require intrusive consent banners because they are essential for delivering the service requested by the user:
          </p>

          <div className="legal-table-wrapper">
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Name / Key</th>
                  <th>Type</th>
                  <th>Lifespan</th>
                  <th>Technical Purpose</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>session_token</code></td>
                  <td>HTTP-Only Cookie</td>
                  <td>30 Days</td>
                  <td>Secure session identifier; encrypted with <code>SameSite=Lax</code> and <code>Secure</code> flags.</td>
                </tr>
                <tr>
                  <td><code>X-CSRF-Token</code></td>
                  <td>Security Header / Cookie</td>
                  <td>Session</td>
                  <td>Protects against Cross-Site Request Forgery on mutating POST/PUT/DELETE actions.</td>
                </tr>
                <tr>
                  <td><code>yulya-theme</code></td>
                  <td>LocalStorage</td>
                  <td>Persistent</td>
                  <td>Remembers your visual interface preference (Dark / High Contrast IDE theme).</td>
                </tr>
                <tr>
                  <td><code>yulya-verification-email</code></td>
                  <td>SessionStorage</td>
                  <td>Browser Tab</td>
                  <td>Temporarily preserves email during 6-digit OTP verification flow. Cleared immediately upon login.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )
    },
    {
      id: 'data-security',
      title: '9. Data Security, Cryptography & Encryption Standards',
      plainEnglish:
        'We protect your data using TLS 1.3 in transit and AES-256-GCM encryption at rest for sensitive keys. Games run in isolated iframes so malicious code cannot steal your session.',
      content: (
        <>
          <p>
            We implement technical, administrative, and physical safeguards designed to protect personal information and
            creator code from accidental loss, unauthorized access, alteration, and disclosure:
          </p>
          <ul>
            <li><strong>Encryption in Transit:</strong> All web traffic is encrypted using Modern TLS 1.3 / HTTPS with HSTS (HTTP Strict Transport Security) enabled.</li>
            <li><strong>AES-256-GCM Key Encryption:</strong> User-provided Google Gemini API keys are never stored in raw plaintext. Keys are encrypted using authenticated 256-bit Galois/Counter Mode (AES-256-GCM) with unique initialization vectors (IVs) and authentication tags.</li>
            <li><strong>One-Way Salted Passwords:</strong> Passwords are never stored in reversible form. We utilize memory-hard, GPU-resistant hashing algorithms (Argon2 / PBKDF2 with SHA-256) with unique per-user salts.</li>
            <li><strong>Iframe Sandbox Isolation:</strong> Game preview executions take place inside restricted <code>&lt;iframe sandbox="..."&gt;</code> environments with strict Content Security Policies (CSP). Sandboxed games cannot read parent cookies, access parent <code>localStorage</code>, or inspect IDE state.</li>
          </ul>
        </>
      )
    },
    {
      id: 'data-retention',
      title: '10. Data Retention Schedule & Right to Erasure',
      plainEnglish:
        'We keep your project files as long as your account is active. When you delete a project or your account, it is permanently purged from our active databases.',
      content: (
        <>
          <p>
            We retain personal data only for as long as necessary to fulfill the purposes outlined in this Privacy Policy:
          </p>
          <div className="legal-table-wrapper">
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Data Type</th>
                  <th>Retention Period</th>
                  <th>Deletion Trigger</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Account &amp; Profile</strong></td>
                  <td>Duration of active account</td>
                  <td>Permanently deleted within 30 days upon user account deletion request.</td>
                </tr>
                <tr>
                  <td><strong>Project Code &amp; Assets</strong></td>
                  <td>Duration of project existence</td>
                  <td>Immediately purged from active MongoDB storage upon project deletion.</td>
                </tr>
                <tr>
                  <td><strong>Gemini API Key</strong></td>
                  <td>Until deleted by user</td>
                  <td>Instant cryptographic purge upon clicking "Remove Key" in Studio settings.</td>
                </tr>
                <tr>
                  <td><strong>Security &amp; Web Logs</strong></td>
                  <td>30 rolling days</td>
                  <td>Automatically rotated and expunged after 30 days.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )
    },
    {
      id: 'user-rights',
      title: '11. Your Privacy Rights (GDPR & CCPA/CPRA)',
      plainEnglish:
        'You have the legal right to view your data, correct errors, export your code as a ZIP, or request complete account deletion. Just email privacy@yulya.me.',
      content: (
        <>
          <p>
            Regardless of your geographic location, Yulya Studio extends comprehensive privacy rights to all creators:
          </p>
          <h4>Your Rights Under GDPR (EU &amp; UK)</h4>
          <ul>
            <li><strong>Right of Access (Art. 15):</strong> You have the right to request a complete copy of the personal data we hold about you.</li>
            <li><strong>Right to Rectification (Art. 16):</strong> You can update inaccurate profile information directly in your profile settings or request correction.</li>
            <li><strong>Right to Erasure / "To Be Forgotten" (Art. 17):</strong> You may request the permanent deletion of your account and all associated projects.</li>
            <li><strong>Right to Data Portability (Art. 20):</strong> You can download your standalone game source code as a <code>.zip</code> file at any time from your project dashboard.</li>
            <li><strong>Right to Object (Art. 21):</strong> You have the right to object to processing based on legitimate interests.</li>
          </ul>

          <h4>Your Rights Under CCPA / CPRA (California Residents)</h4>
          <ul>
            <li><strong>Right to Know:</strong> The right to request disclosure of categories and specific pieces of personal information collected.</li>
            <li><strong>Right to Delete:</strong> The right to request deletion of personal information collected from you.</li>
            <li><strong>Right to Non-Discrimination:</strong> We will never deny service, charge different prices, or provide inferior service because you exercised your privacy rights.</li>
          </ul>

          <h4>How to Exercise Your Rights</h4>
          <p>
            To submit a privacy or data erasure request, please email our Data Protection Team at{' '}
            <a href="mailto:privacy@yulya.me">privacy@yulya.me</a> with the subject line <em>“Data Rights Request”</em>.
            We will verify your identity via your registered email address and respond within thirty (30) days as required
            by law.
          </p>
        </>
      )
    },
    {
      id: 'children-privacy',
      title: '12. Children’s Privacy (COPPA Compliance)',
      plainEnglish:
        'Yulya Studio is for creators 13 years and older (16 in EU/UK). We do not knowingly collect information from children under 13.',
      content: (
        <>
          <p>
            Yulya Studio is an advanced programming and game development environment intended for general audiences. The
            Service is NOT directed to children under the age of 13 (or under 16 in the European Union and United
            Kingdom).
          </p>
          <p>
            We comply with the Children’s Online Privacy Protection Act (COPPA). We do not knowingly collect, solicit,
            or maintain personal information from children under the statutory age. If we become aware that an account has
            been created by a child under 13 without verified parental consent, we will immediately terminate the
            account and permanently purge all associated personal information and project files from our records.
          </p>
          <p>
            Parents or legal guardians who believe their child has provided personal information to Yulya Studio may
            contact us immediately at <a href="mailto:privacy@yulya.me">privacy@yulya.me</a> to request immediate deletion.
          </p>
        </>
      )
    },
    {
      id: 'contact-updates',
      title: '13. Changes to this Policy & Contact Information',
      plainEnglish:
        'If we make significant updates to this policy, we will update the effective date and notify you on the site. You can reach our privacy team at privacy@yulya.me.',
      content: (
        <>
          <p>
            We may periodically update this Privacy Policy to reflect technical advancements, new platform features, or
            evolving regulatory obligations. When changes are made, we will update the “Effective Date” at the top of
            this document. For material changes that significantly affect your rights, we will provide prominent notice on
            the platform or via email before the changes take effect.
          </p>
          <h4>Contacting Our Data Protection Team</h4>
          <p>
            If you have questions, comments, or formal inquiries regarding this Privacy Policy or our data protection
            practices, please contact us:
          </p>
          <div className="legal-contact-callout">
            <Mail size={16} />
            <span>Email: <a href="mailto:privacy@yulya.me">privacy@yulya.me</a></span>
          </div>
          <p>
            European Union residents have the right to lodge a formal complaint with their national Data Protection
            Supervisory Authority (DPA) if they believe their personal data has been processed in violation of applicable law.
          </p>
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
            <span className="legal-pill">PRIVACY</span>
          </div>
        </div>

        <div className="legal-topbar-center">
          <button className="legal-switch-btn" onClick={() => setPage('terms')}>
            <Scale size={14} />
            <span>Terms of Service</span>
          </button>
          <button className="legal-switch-btn active">
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
            <Shield size={13} />
            <span>GLOBAL PRIVACY COMPLIANT (GDPR &bull; CCPA/CPRA &bull; COPPA) &bull; EFFECTIVE NOVEMBER 9, 2026</span>
          </div>
          <h1>Privacy Policy &amp; Data Transparency</h1>
          <p className="legal-subtitle">
            Zero ad trackers. Zero data brokering. How we safeguard your creator data, encrypt your Gemini API key with AES-256-GCM, and honor your right to be forgotten.
          </p>
          <div className="legal-highlights-grid">
            <div className="legal-hl-card">
              <EyeOff size={16} className="text-peach" />
              <div>
                <strong>Zero Data Sale</strong>
                <span>We never sell or monetize your code, projects, or personal data.</span>
              </div>
            </div>
            <div className="legal-hl-card">
              <KeyRound size={16} className="text-mint" />
              <div>
                <strong>AES-256-GCM Encryption</strong>
                <span>Gemini API keys are protected with military-grade crypto.</span>
              </div>
            </div>
            <div className="legal-hl-card">
              <Database size={16} className="text-lilac" />
              <div>
                <strong>Full Data Erasure</strong>
                <span>Permanent right to be forgotten and one-click ZIP code exports.</span>
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
              placeholder="Search privacy topics..."
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
              <Lock size={15} />
              <span>Data Protection Officer</span>
            </div>
            <a href="mailto:privacy@yulya.me" className="legal-support-link">
              Contact privacy@yulya.me <ExternalLink size={12} />
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
            <h3>Have Questions or Wish to Exercise Your Privacy Rights?</h3>
            <p>
              Our Data Protection Team is dedicated to honoring your rights under GDPR and CCPA:
            </p>
            <div className="legal-emails-row">
              <div className="legal-email-badge">
                <Mail size={15} />
                <span>Privacy Inquiries: <strong>privacy@yulya.me</strong></span>
              </div>
              <div className="legal-email-badge">
                <Database size={15} />
                <span>Data Erasure Requests: <strong>privacy@yulya.me</strong></span>
              </div>
              <div className="legal-email-badge">
                <Scale size={15} />
                <span>Legal Counsel: <strong>legal@yulya.me</strong></span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
