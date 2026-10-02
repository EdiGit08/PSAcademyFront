import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { LoaderCircle, Lock, Mail, TriangleAlert, UserPlus } from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import { extractErrorMessage, isAuthenticated, register } from '../services/api'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Refleja las reglas de `RegisterDto` en el backend (StringLength + RegularExpression),
// para fallar al instante en lugar de recibir un 400.
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 100
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/

function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`
  }
  if (!PASSWORD_PATTERN.test(password)) {
    return 'La contraseña debe incluir al menos una minúscula, una mayúscula, un dígito y un símbolo.'
  }
  return null
}

export default function Register() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const trimmedEmail = email.trim()

    if (!trimmedEmail || !password || !confirmPassword) {
      setError('Completa todos los campos para crear tu cuenta.')
      return
    }

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError('Ingresa un correo electrónico válido.')
      return
    }

    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setIsSubmitting(true)
    try {
      await register({ email: trimmedEmail, password })
      navigate('/dashboard', { replace: true })
    } catch (caught) {
      setError(extractErrorMessage(caught, 'No se pudo crear la cuenta. Inténtalo de nuevo.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClassName =
    'min-h-11 w-full rounded-xl border bg-surface py-2.5 pl-9 pr-3 text-base text-ink sm:text-sm shadow-sm outline-none transition placeholder:text-faint focus:ring-4'

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
            <UserPlus className="h-6 w-6" strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              Crea tu cuenta
            </h1>
            <p className="mt-1 text-sm text-muted">
              Regístrate en PS Academy y empieza a practicar
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5 shadow-xl shadow-line/60 sm:p-8">
          {error ? (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2.5 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
                  className={`${inputClassName} border-line-strong focus:border-accent focus:ring-accent/10`}
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
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={`Entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres`}
                  className={`${inputClassName} border-line-strong focus:border-accent focus:ring-accent/10`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-body">
                Confirmar contraseña
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="••••••••"
                  aria-invalid={confirmPassword.length > 0 && confirmPassword !== password}
                  className={`${inputClassName} focus:border-accent focus:ring-accent/10 ${
                    confirmPassword.length > 0 && confirmPassword !== password
                      ? 'border-danger-line'
                      : 'border-line-strong'
                  }`}
                />
              </div>
              {confirmPassword.length > 0 && confirmPassword !== password ? (
                <p className="mt-1.5 text-xs text-danger">Las contraseñas no coinciden.</p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-base font-semibold sm:text-sm text-white shadow-lg shadow-accent/25 transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-none"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Creando cuenta...
                </>
              ) : (
                'Crear cuenta'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            ¿Ya tienes cuenta?{' '}
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline underline-offset-2 transition hover:text-accent-hover"
            >
              Inicia sesión
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