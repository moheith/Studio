import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import { api } from '../api'
import type { User } from '../types'

type LoginPageProps = {
  onBack: () => void
  onRegister: () => void
  onLogin: (user: User, csrf: string) => void
  notify: (message: string) => void
}

export default function LoginPage({ onBack, onRegister, onLogin, notify }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api<{ user: User; csrf_token: string }>('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      })
      onLogin(result.user, result.csrf_token)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return <AuthLayout eyebrow="YOUR NEXT LITTLE BIG THING" title="Welcome back." description="Sign in to your studio and make an idea playable." onBack={onBack}>
    <form className="auth-form" onSubmit={submit}>
      <div className="auth-separator"><span />email sign-in<span /></div>
      <label>Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /></label>
      <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={15} /></button>
      <p className="auth-switch">New to Yulya? <button type="button" onClick={onRegister}>Create an account</button></p>
      <div className="auth-legal">Email accounts require verification.</div>
    </form>
  </AuthLayout>
}

