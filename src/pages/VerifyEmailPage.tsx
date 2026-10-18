import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import { api } from '../api'
import type { User } from '../types'

type VerifyEmailPageProps = {
  email: string
  onBack: () => void
  onLogin: (user: User, csrf: string) => void
  notify: (message: string) => void
}

export default function VerifyEmailPage({ email, onBack, onLogin, notify }: VerifyEmailPageProps) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api<{ user: User; csrf_token: string }>('/api/auth/verify-email', {
        method: 'POST', body: JSON.stringify({ email, code }),
      })
      onLogin(result.user, result.csrf_token)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not verify your email')
    } finally {
      setBusy(false)
    }
  }

  return <AuthLayout eyebrow="ONE QUICK CHECK" title="Check your email." description={`Enter the six-digit verification code sent to ${email}.`} onBack={onBack}>
    <form className="auth-form" onSubmit={submit}>
      <label>Verification code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="000000" /></label>
      <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify email'} <ArrowRight size={15} /></button>
      <p className="auth-switch">Wrong email? <button type="button" onClick={onBack}>Go back</button></p>
    </form>
  </AuthLayout>
}
