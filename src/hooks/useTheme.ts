import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'psacademy.theme'

function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    // localStorage puede estar bloqueado (modo privado); no es crítico.
    return null
  }
}

/**
 * El script inline de index.html ya aplicó la clase antes del primer paint.
 * Aquí solo leemos lo que quedó en el DOM para no provocar un segundo cambio.
 */
function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  const apply = useCallback((next: Theme) => {
    const root = document.documentElement
    root.classList.toggle('dark', next === 'dark')
    root.style.colorScheme = next
    // Marca el documento para habilitar las transiciones de color.
    requestAnimationFrame(() => root.classList.add('theme-ready'))
  }, [])

  const toggle = useCallback(() => {
    setTheme((previous) => {
      const next: Theme = previous === 'dark' ? 'light' : 'dark'
      apply(next)
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Sin persistencia el toggle sigue funcionando en la sesión actual.
      }
      return next
    })
  }, [apply])

  // Si el usuario nunca eligió un tema, seguimos la preferencia del sistema.
  useEffect(() => {
    if (readStoredTheme()) return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      const next: Theme = event.matches ? 'dark' : 'light'
      apply(next)
      setTheme(next)
    }

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [apply])

  return { theme, toggle }
}
