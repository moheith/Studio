import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import { api } from '../api'

type RegisterPageProps = {
  onBack: () => void
  onLogin: () => void
  onRegistered: (email: string) => void
  notify: (message: string) => void
}

export default function RegisterPage({ onBack, onLogin, onRegistered, notify }: RegisterPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) })
      onRegistered(email.trim().toLowerCase())
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not create your account')
    } finally {
      setBusy(false)
    }
  }

  return <AuthLayout eyebrow="YOUR NEXT LITTLE BIG THING" title="Let’s make something." description="Create an email account to save your studio." onBack={onBack}>
    <form className="auth-form" onSubmit={submit}>
      <div className="auth-separator"><span />create with email<span /></div>
      <label>Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      <label>Password<input required type="password" autoComplete="new-password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 10 characters" /></label>
      <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'} <ArrowRight size={15} /></button>
      <p className="auth-switch">Already have a studio? <button type="button" onClick={onLogin}>Log in</button></p>
      <div className="auth-legal">We’ll email you a verification code.</div>
    </form>
  </AuthLayout>
}

