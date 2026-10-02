import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate, Link } from 'react-router-dom'
import { Code, LoaderCircle, Lock, Mail, TriangleAlert } from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import { extractErrorMessage, isAuthenticated, login } from '../services/api'

export default function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError('Ingresa tu correo y contraseña para continuar.')
      return
    }

    setIsSubmitting(true)
    try {
      await login({ email: email.trim(), password })
      navigate('/dashboard', { replace: true })
    } catch (caught) {
      setError(extractErrorMessage(caught, 'No se pudo iniciar sesión. Inténtalo de nuevo.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-canvas px-4 py-8 sm:py-10">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle variant="block" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(45rem_45rem_at_50%_-10%,rgba(139,92,246,0.20),transparent_65%)]"
      />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white shadow-lg shadow-accent/25">
            <Code className="h-6 w-6" strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">PS Academy</h1>
            <p className="mt-1 text-sm text-muted">Plataforma de aprendizaje de programación</p>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5 shadow-xl shadow-line/60 sm:p-8">
          <h2 className="text-lg font-semibold text-ink">Inicia sesión</h2>
          <p className="mt-1 text-sm text-muted">Accede para continuar con tus ejercicios.</p>

          {error ? (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2.5 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-body">
                Correo electrónico
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="alumno@psacademy.com"
                  className="min-h-11 w-full rounded-xl border border-line-strong bg-surface py-2.5 pl-9 pr-3 text-base sm:text-sm text-ink shadow-sm outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent/10"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-body">
                Contraseña
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="min-h-11 w-full rounded-xl border border-line-strong bg-surface py-2.5 pl-9 pr-3 text-base sm:text-sm text-ink shadow-sm outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent/10"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-base font-semibold sm:text-sm text-white shadow-lg shadow-accent/20 transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-none"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            ¿No tienes cuenta?{' '}
            <Link
              to="/register"
              className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline underline-offset-2 transition hover:text-accent-hover"
            >
              Regístrate aquí
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-faint">
          PS Academy &middot; practicing programming
        </p>
      </div>
    </main>
  )
}