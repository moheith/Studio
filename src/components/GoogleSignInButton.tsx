import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { User } from '../types'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void
          prompt: (momentListener?: (notification: unknown) => void) => void
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

interface GoogleSignInButtonProps {
  onLogin: (user: User, csrf: string, needsUsername?: boolean) => void
  notify: (msg: string) => void
  onError?: (msg: string) => void
  text?: 'signin' | 'signup' | 'continue'
  width?: number
}

const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ||
  '317604926106-n8ktfn1aplm9tkfuoe9fgdlgre18frab.apps.googleusercontent.com'

export default function GoogleSignInButton({
  onLogin,
  notify,
  onError,
  text = 'continue',
  width
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let interval: number

    const initGoogle = () => {
      if (window.google?.accounts?.id && containerRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: async (response: { credential?: string }) => {
              if (!response.credential) {
                const msg = 'Google sign-in did not provide credentials'
                if (onError) onError(msg)
                notify(msg)
                return
              }
              setBusy(true)
              try {
                const result = await api<{ user: User; csrf_token: string; needs_username: boolean }>(
                  '/api/auth/google',
                  {
                    method: 'POST',
                    body: JSON.stringify({ credential: response.credential })
                  }
                )
                onLogin(result.user, result.csrf_token, result.needs_username)
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Google authentication failed'
                if (onError) onError(msg)
                notify(msg)
              } finally {
                setBusy(false)
              }
            }
          })

          // Render Google's official compliant button into container
          containerRef.current.innerHTML = ''
          const measuredWidth = containerRef.current.clientWidth || 340
          const computedWidth = width ? Math.max(200, Math.min(400, width)) : Math.max(200, Math.min(400, measuredWidth))

          window.google.accounts.id.renderButton(containerRef.current, {
            theme: 'filled_black',
            size: 'large',
            shape: 'rectangular',
            width: computedWidth,
            text: text === 'signup' ? 'signup_with' : 'continue_with'
          })

          setReady(true)
          if (interval) clearInterval(interval)
        } catch {
          // Retry if not yet ready
        }
      }
    }

    initGoogle()
    interval = window.setInterval(initGoogle, 300)

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [text, width, onLogin, notify, onError])

  const label =
    text === 'signup'
      ? 'Sign up with Google'
      : text === 'signin'
      ? 'Sign in with Google'
      : 'Continue with Google'

  return (
    <div className="google-auth-wrap">
      {/* Google official rendered button container */}
      <div ref={containerRef} className={`google-rendered-btn ${ready ? 'ready' : 'loading'}`} />

      {/* Styled Fallback / Loading button if Google script is loading */}
      {!ready && (
        <button
          type="button"
          className="google-custom-btn"
          disabled={busy}
          onClick={() => {
            if (window.google?.accounts?.id) {
              window.google.accounts.id.prompt()
            } else {
              notify('Loading Google services… please try again in a few seconds.')
            }
          }}
        >
          <svg className="google-g-icon" viewBox="0 0 24 24" width="18" height="18">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{busy ? 'Signing in with Google…' : label}</span>
        </button>
      )}
    </div>
  )
}
