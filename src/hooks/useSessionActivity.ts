import { useEffect, useRef } from 'react'
import { ensureFreshToken, isAuthenticated } from '../services/api'

/**
 * Periodo mínimo entre comprobaciones.
 *
 * `mousemove` dispara decenas de eventos por segundo: sin este tope, cada movimiento
 * llamaría a `ensureFreshToken`. Como la función ya no hace nada cuando el token está
 * lejos de caducar, el coste real es bajo, pero el refresco sigue reservando una
 * promesa y una fecha: mejor comprobar cada 60 s.
 */
const CHECK_INTERVAL_MS = 60_000

/**
 * Mantiene viva la sesión mientras el usuario trabaja.
 *
 * El problema que resuelve: el token de acceso dura 60 minutos y antes, al cumplirse,
 * la sesión se caía aunque el alumno estuviera escribiendo código. Ahora el token se
 * renueva con el refresh token en cuanto se aproxima su caducidad, y solo se descarta
 * la sesión cuando ese refresh token tampoco sirve.
 *
 * Se considera actividad el teclado, el ratón, el scroll, el toque y el foco en la
 * ventana. `visibilitychange` cubre el caso real más frecuente: el alumno deja la
 * pestaña abierta en segundo plano, vuelve a ella y sigue trabajando.
 */
export function useSessionActivity(): void {
  const lastCheckRef = useRef<number>(0)

  useEffect(() => {
    if (!isAuthenticated()) return

    function check() {
      const now = Date.now()
      if (now - lastCheckRef.current < CHECK_INTERVAL_MS) return

      lastCheckRef.current = now
      void ensureFreshToken()
    }

    function onActivity() {
      check()
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') check()
    }

    // Se comprueba también al montar: si la pestaña estuvo abierta desde antes de
    // cargar este hook, el token puede estar ya en su ventana de renovación.
    check()

    window.addEventListener('pointerdown', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity, { passive: true })
    window.addEventListener('wheel', onActivity, { passive: true })
    window.addEventListener('touchstart', onActivity, { passive: true })
    window.addEventListener('focus', onActivity)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
      window.removeEventListener('wheel', onActivity)
      window.removeEventListener('touchstart', onActivity)
      window.removeEventListener('focus', onActivity)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
}
