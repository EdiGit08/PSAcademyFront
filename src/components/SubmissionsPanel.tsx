import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CircleCheckBig,
  CircleX,
  Clock,
  Code,
  Inbox,
  LoaderCircle,
  MessageSquareWarning,
  RefreshCw,
  User,
} from 'lucide-react'
import type { AdminSubmission, SubmissionStatus } from '../types'
import { extractErrorMessage, getAdminSubmissions, gradeSubmission } from '../services/api'

type QueueFilter = SubmissionStatus | 'All'

const FILTERS: Array<{ value: QueueFilter; label: string }> = [
  { value: 'Pending', label: 'Pendientes' },
  { value: 'Correct', label: 'Aprobados' },
  { value: 'Incorrect', label: 'Devueltos' },
  { value: 'All', label: 'Todos' },
]

const STATUS_BADGE: Record<SubmissionStatus, string> = {
  Pending: 'bg-warning-soft text-warning ring-warning-line',
  Correct: 'bg-success-soft text-success ring-success-line',
  Incorrect: 'bg-danger-soft text-danger ring-danger-line',
}

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  Pending: 'Pendiente',
  Correct: 'Aprobado',
  Incorrect: 'Devuelto',
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function SubmissionCard({
  submission,
  onGraded,
}: {
  submission: AdminSubmission
  onGraded: (id: number) => void
}) {
  const isPending = submission.status === 'Pending'
  // El estado del formulario pertenece a este envío: la `key` del padre incluye el id y
  // el estado, así que al cambiar de fila o al calificar se monta de nuevo con la
  // justificación correcta. Sincronizarlo con un efecto provocaría un render en cascada.
  const [feedback, setFeedback] = useState(submission.feedback ?? '')
  const [isGrading, setIsGrading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Califica el envío.
   *
   * La justificación es obligatoria en el "no": es lo que le dice al alumno qué corregir,
   * y sin ella no hay forma de que el reintento sea útil. El backend la exige con un 400,
   * pero se comprueba aquí para no dejar al admin con un error de servidor tras escribir.
   */
  async function grade(correct: boolean) {
    const trimmedFeedback = feedback.trim()

    if (!correct && trimmedFeedback.length === 0) {
      setError('Escribe la justificación para que el alumno sepa qué corregir.')
      return
    }

    setIsGrading(true)
    setError(null)

    try {
      await gradeSubmission(submission.id, {
        correct,
        feedback: correct ? undefined : trimmedFeedback,
      })
      onGraded(submission.id)
    } catch (caught) {
      setError(extractErrorMessage(caught, 'No se pudo guardar la calificación.'))
    } finally {
      setIsGrading(false)
    }
  }

  return (
    <article className="rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">{submission.exerciseTitle}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {submission.userEmail}
            </span>
            <span className="inline-flex items-center gap-1">
              <Code className="h-3.5 w-3.5" />
              {submission.languageName}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDateTime(submission.submittedAt)}
            </span>
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_BADGE[submission.status]}`}
        >
          {STATUS_LABEL[submission.status]}
        </span>
      </header>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            Codigo enviado
          </p>
          <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-editor p-3 font-mono text-xs leading-relaxed text-code-ink">
            {submission.code || '(vacio)'}
          </pre>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Salida esperada
            </p>
            <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-inset p-3 font-mono text-xs leading-relaxed text-body">
              {submission.expectedOutput?.trim() || '(sin salida)'}
            </pre>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Salida obtenida
            </p>
            <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-inset p-3 font-mono text-xs leading-relaxed text-body">
              {submission.actualOutput?.trim() || '(sin salida)'}
            </pre>
          </div>
        </div>
      </div>

      {isPending ? (
        <div className="mt-4 border-t border-line pt-4">
          <label
            htmlFor={`feedback-${submission.id}`}
            className="text-sm font-medium text-ink"
          >
            Justificacion para el alumno
          </label>
          <p className="mt-0.5 text-xs text-muted">
            Obligatoria si lo devuelves. Es lo que vera junto al ejercicio al volver a
            intentarlo.
          </p>
          <textarea
            id={`feedback-${submission.id}`}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={3}
            placeholder="Explica que falla y como corregirlo..."
            className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/30"
          />

          {error ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
              <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void grade(true)}
              disabled={isGrading}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-success-solid px-4 py-2 text-sm font-semibold text-white transition hover:bg-success-solid-hover focus:outline-none focus:ring-4 focus:ring-success-solid/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGrading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <CircleCheckBig className="h-4 w-4" />
              )}
              Aprobar
            </button>
            <button
              type="button"
              onClick={() => void grade(false)}
              disabled={isGrading}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-danger-solid px-4 py-2 text-sm font-semibold text-white transition hover:bg-danger-solid-hover focus:outline-none focus:ring-4 focus:ring-danger-solid/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGrading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <MessageSquareWarning className="h-4 w-4" />
              )}
              Devolver con justificacion
            </button>
          </div>
        </div>
      ) : (
        <footer className="mt-4 border-t border-line pt-4 text-sm">
          {submission.status === 'Correct' ? (
            <p className="flex items-center gap-2 text-success">
              <CircleCheckBig className="h-4 w-4 shrink-0" />
              Aprobado por {submission.gradedByEmail ?? 'un administrador'} el{' '}
              {submission.gradedAt ? formatDateTime(submission.gradedAt) : '—'}
            </p>
          ) : (
            <div className="rounded-lg bg-danger-soft px-3 py-2">
              <p className="flex items-center gap-2 text-xs font-semibold text-danger">
                <CircleX className="h-4 w-4 shrink-0" />
                Devuelto por {submission.gradedByEmail ?? 'un administrador'} el{' '}
                {submission.gradedAt ? formatDateTime(submission.gradedAt) : '—'}
              </p>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-body">
                {submission.feedback || 'Sin justificacion registrada.'}
              </p>
            </div>
          )}
        </footer>
      )}
    </article>
  )
}

/**
 * Bandeja de calificacion del administrador.
 *
 * Muestra los envios de los alumnos, ordenados por fecha, y permite aprobarlos o
 * devolverlos con justificacion. El filtro por defecto es la cola de pendientes: es la
 * unica vista que cambia con el trabajo del dia, mientras que aprobados y devueltos son
 * historial de consulta.
 */
export default function SubmissionsPanel() {
  const [filter, setFilter] = useState<QueueFilter>('Pending')
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([])
  // Último filtro cuyos datos están en pantalla. Sirve además de bandera de carga: si no
  // coincide con el filtro activo, lo que se ve es de la consulta anterior.
  const [loadedFilter, setLoadedFilter] = useState<QueueFilter | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isLoading = loadedFilter !== filter

  /**
   * Pide los envíos de un filtro. Es asíncrona y solo escribe estado cuando la respuesta
   * llega, de modo que llamarla desde un efecto no provoca un render en cascada.
   */
  const fetchSubmissions = useCallback(async (target: QueueFilter) => {
    try {
      const data = await getAdminSubmissions(target)
      setSubmissions(data)
      setLoadedFilter(target)
      setError(null)
    } catch (caught) {
      setError(extractErrorMessage(caught, 'No se pudieron cargar los envios.'))
    }
  }, [])

  useEffect(() => {
    let isCurrent = true

    void (async () => {
      const data = await getAdminSubmissions(filter).catch((caught: unknown) => {
        if (isCurrent) {
          setError(extractErrorMessage(caught, 'No se pudieron cargar los envios.'))
        }
        return null
      })

      if (!isCurrent || data === null) return

      setSubmissions(data)
      setLoadedFilter(filter)
      setError(null)
    })()

    // Al cambiar de filtro antes de que llegue la respuesta, el estado de la petición
    // antigua se descarta para no pintar la lista del filtro anterior.
    return () => {
      isCurrent = false
    }
  }, [filter])

  /**
   * Al calificar, el envio sale de la cola de pendientes. En los filtros de historial se
   * actualiza en su sitio para no perder la posicion del admin, y el badge de "Todos" no
   * cambia porque la fila sigue existiendo.
   */
  const handleGraded = useCallback((id: number) => {
    setSubmissions((previous) => {
      if (filter === 'Pending') return previous.filter((item) => item.id !== id)

      const gradedStatus: SubmissionStatus = filter === 'Correct' ? 'Correct' : 'Incorrect'

      return previous.map((item) =>
        item.id === id
          ? {
              ...item,
              status: gradedStatus,
              feedback: gradedStatus === 'Correct' ? null : item.feedback,
              gradedAt: new Date().toISOString(),
            }
          : item,
      )
    })
  }, [filter])

  const pendingCount = useMemo(
    () => submissions.filter((item) => item.status === 'Pending').length,
    [submissions],
  )

  return (
    <section aria-label="Calificaciones" className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-xl bg-recess/70 p-1">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                filter === option.value ? 'bg-surface text-ink shadow-sm' : 'text-body hover:text-ink'
              }`}
            >
              {option.value === 'Pending' ? <Clock className="h-4 w-4" /> : null}
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void fetchSubmissions(filter)}
          disabled={isLoading}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium text-body transition hover:bg-inset hover:text-ink disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-4 py-3">
          <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-medium text-ink">No se pudo cargar la bandeja</p>
            <p className="mt-0.5 text-sm text-body">{error}</p>
          </div>
        </div>
      ) : null}

      {isLoading && submissions.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface py-16 text-sm text-muted">
          <LoaderCircle className="h-5 w-5 animate-spin text-accent-ink" />
          Cargando envios...
        </div>
      ) : submissions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
          <Inbox className="mx-auto h-9 w-9 text-faint" />
          <p className="mt-3 text-sm font-medium text-body">
            {filter === 'Pending' ? 'No hay envios pendientes' : 'No hay envios en este filtro'}
          </p>
          <p className="mt-1 text-sm text-muted">
            {filter === 'Pending'
              ? 'Los alumnos veran sus avisos aqui en cuanto envien una solucion correcta.'
              : 'Cambia de filtro para ver el resto del historial.'}
          </p>
        </div>
      ) : (
        <>
          {filter === 'Pending' && pendingCount > 0 ? (
            <p className="text-sm text-muted">
              {pendingCount === 1
                ? '1 envio esperando calificacion.'
                : `${pendingCount} envios esperando calificacion.`}
            </p>
          ) : null}

          <div className="space-y-4">
            {submissions.map((submission) => (
              <SubmissionCard
                key={`${submission.id}-${submission.status}`}
                submission={submission}
                onGraded={handleGraded}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}