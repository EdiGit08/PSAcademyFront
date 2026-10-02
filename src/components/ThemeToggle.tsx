import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

type Props = {
  /** `icon` para headers de app, `block` para pantallas de auth centradas. */
  variant?: 'icon' | 'block'
  className?: string
}

export default function ThemeToggle({ variant = 'icon', className = '' }: Props) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  const label = isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'

  if (variant === 'block') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-body shadow-sm sm:min-h-0 transition hover:bg-inset hover:text-ink focus:outline-none focus:ring-4 focus:ring-line ${className}`}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        {isDark ? 'Tema claro' : 'Tema oscuro'}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line-strong bg-surface text-body transition hover:bg-inset hover:text-ink focus:outline-none focus:ring-4 focus:ring-line sm:h-9 sm:w-9 ${className}`}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
