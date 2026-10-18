import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

type AuthLayoutProps = {
  eyebrow: string
  title: string
  description: string
  onBack: () => void
  children: ReactNode
}

export default function AuthLayout({ eyebrow, title, description, onBack, children }: AuthLayoutProps) {
  return (
    <main className="auth-screen">
      <button className="auth-back" onClick={onBack}><ArrowLeft size={16} /> Back to Yulya</button>
      <section className="auth-card" aria-labelledby="auth-title">
        <a className="brand auth-brand" href="/" onClick={(event) => { event.preventDefault(); onBack() }}>
          <span className="brand-mark">✳</span><span>yulya<span className="brand-light">studio</span></span>
        </a>
        <div className="auth-kicker">{eyebrow}</div>
        <h1 id="auth-title">{title}</h1>
        <p>{description}</p>
        {children}
      </section>
      <div className="auth-decoration" aria-hidden="true"><span>✦</span><span>✧</span><span>·</span><span>✳</span></div>
    </main>
  )
}

