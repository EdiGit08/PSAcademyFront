import { BookMarked, CircleCheckBig, Lightbulb } from 'lucide-react'
import type { Concept } from '../services/concepts'

/**
 * Tarjeta de explicación de una construcción nueva.
 *
 * Se muestra en el workspace antes del primer intento del alumno, una vez por
 * construcción: al pulsing "Entendido" se marca como vista (localStorage) y no
 * vuelve a aparecer.
 */
export default function ConceptCard({
  concept,
  onAcknowledge,
}: {
  concept: Concept
  onAcknowledge: (id: string) => void
}) {
  return (
    <article className="rounded-xl border border-accent-line bg-accent-soft p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
          <Lightbulb className="h-4.5 w-4.5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-ink">
            Concepto nuevo
          </p>
          <h4 className="mt-0.5 font-semibold text-ink">{concept.title}</h4>
          <p className="mt-1 text-sm text-body">{concept.summary}</p>

          <div className="mt-3 overflow-hidden rounded-lg border border-line bg-code">
            <p className="flex items-center gap-1.5 border-b border-white/10 bg-code-chrome px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-code-ink/50">
              <BookMarked className="h-3 w-3" />
              Cómo se escribe
            </p>
            <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[13px] leading-relaxed text-code-ink">
              <code>{concept.syntax}</code>
            </pre>
          </div>

          <div className="mt-2.5 overflow-hidden rounded-lg border border-line bg-inset">
            <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[13px] leading-relaxed text-body">
              <code>{concept.example}</code>
            </pre>
          </div>

          <button
            type="button"
            onClick={() => onAcknowledge(concept.id)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/20"
          >
            <CircleCheckBig className="h-4 w-4" />
            Entendido
          </button>
        </div>
      </div>
    </article>
  )
}