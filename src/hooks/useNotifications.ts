import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppNotification } from '../types'
import { getNotifications, markNotificationRead, isAuthenticated } from '../services/api'

/** Frecuencia del sondeo: suficiente para que el admin vea el envío casi al instante. */
const POLL_INTERVAL_MS = 30_000

interface NotificationsState {
  notifications: AppNotification[]
  unreadCount: number
}

const EMPTY: NotificationsState = { notifications: [], unreadCount: 0 }

export function useNotifications() {
  const [state, setState] = useState<NotificationsState>(EMPTY)
  const pollRef = useRef<number | null>(null)

  // El sondeo solo tiene sentido con sesión abierta: sin token la respuesta sería un 401
  // en cada ciclo. Se lee aquí (fuera del efecto) para que sea también el valor de
  // render, en lugar de provocar un `setState` dentro del efecto.
  const isSessionOpen = isAuthenticated()

  const refresh = useCallback(async () => {
    try {
      const { notifications, unreadCount } = await getNotifications()
      setState({ notifications, unreadCount })
    } catch {
      // Un fallo puntual del sondeo no se muestra: la campana mostraría un error
      // parpadeante en cada fallo de red. El siguiente ciclo lo reintenta solo.
    }
  }, [])

  useEffect(() => {
    if (!isSessionOpen) return

    // La primera lectura va dentro de una tarea asíncrona: escribir estado en el cuerpo
    // del efecto provocaría un render en cascada, y el `await` deja el setState para
    // cuando la respuesta haya llegado.
    void (async () => {
      await Promise.resolve()
      await refresh()
    })()

    pollRef.current = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [isSessionOpen, refresh])

  /**
   * Marca una notificación como leída y descuenta el contador al instante.
   *
   * El decremento es optimista: la campana no debe esperar al servidor para quitar el
   * punto rojo. Si el PATCH falla, `refresh` vuelve a pedir la lista y el contador real
   * sustituye al estimado.
   */
  const markRead = useCallback(async (notificationId: number) => {
    setState((previous) => {
      const target = previous.notifications.find((item) => item.id === notificationId)
      if (!target || target.isRead) return previous

      return {
        unreadCount: Math.max(0, previous.unreadCount - 1),
        notifications: previous.notifications.map((item) =>
          item.id === notificationId ? { ...item, isRead: true } : item,
        ),
      }
    })

    try {
      await markNotificationRead(notificationId)
    } catch {
      void refresh()
    }
  }, [refresh])

  if (!isSessionOpen) return { ...EMPTY, refresh, markRead }

  return { ...state, refresh, markRead }
}
