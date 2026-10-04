import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import type { AppNotification } from '../types'
import { useNotifications } from '../hooks/useNotifications'

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const diffMinutes = Math.round((Date.now() - then) / 60_000)

  if (diffMinutes < 1) return 'hace un momento'
  if (diffMinutes < 60) return `hace ${diffMinutes} min`

  const hours = Math.round(diffMinutes / 60)
  if (hours < 24) return `hace ${hours} h`

  const days = Math.round(hours / 24)
  return days === 1 ? 'ayer' : `hace ${days} días`
}

function parseExerciseId(notification: AppNotification): number | null {
  if (!notification.data) return null
  try {
    const parsed = JSON.parse(notification.data) as { exerciseId?: number }
    return typeof parsed.exerciseId === 'number' ? parsed.exerciseId : null
  } catch {
    // `data` es texto libre que produce el backend; si algún día cambia de forma, la
    // notificación debe seguir siendo legible aunque el enlace no se pueda armar.
    return null
  }
}

/**
 * Campana de notificaciones en la cabecera.
 *
 * El contador llega por sondeo (ver `useNotifications`), no por push: para un panel de
 * revisión de ejercicios son unos pocos eventos por minuto y un GET cada 30 s es
 * suficiente sin montar un canal de WebSocket.
 *
 * Cuando la notificación trae `exerciseId` (los avisos de calificación), el clic abre
 * directamente el workspace del ejercicio para que el alumno no tenga que buscarlo.
 */
export default function NotificationBell({ className = '' }: { className?: string }) {
  const { notifications, unreadCount, markRead } = useNotifications()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Cierra al pulsar fuera o con Escape: el desplegable es un panel-modal informal y
  // dejarlo abierto detrás de otra interacción hace difícil volver a encontrarlo.
  useEffect(() => {
    if (!isOpen) return

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        aria-label={
          unreadCount > 0
            ? `Notificaciones: ${unreadCount} sin leer`
            : 'Notificaciones'
        }
        aria-expanded={isOpen}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line-strong bg-surface text-body transition hover:bg-inset hover:text-ink focus:outline-none focus:ring-4 focus:ring-line"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-solid px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold text-ink">Notificaciones</p>
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No tienes notificaciones todavía.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notifications.map((notification) => {
                const exerciseId = parseExerciseId(notification)
                const isPendingGrade =
                  notification.type === 'SubmissionGraded' && exerciseId !== null

                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => {
                        void markRead(notification.id)
                        if (isPendingGrade && exerciseId !== null) {
                          window.location.assign(`/workspace/${exerciseId}`)
                        }
                      }}
                      className={`flex w-full flex-col gap-1 border-b border-line px-4 py-3 text-left transition last:border-b-0 hover:bg-inset ${
                        notification.isRead ? '' : 'bg-accent-soft/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink">
                          {notification.title}
                        </span>
                        {!notification.isRead ? (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                        ) : null}
                      </div>
                      <p className="text-xs leading-relaxed text-body">{notification.message}</p>
                      <p className="text-[11px] text-faint">
                        {formatRelative(notification.createdAt)}
                        {isPendingGrade ? ' · Toca para abrir el ejercicio' : ''}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
