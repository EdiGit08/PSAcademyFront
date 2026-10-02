import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import type { OnMount } from '@monaco-editor/react'
import {
  ArrowLeft,
  ChevronDown,
  CircleCheckBig,
  CircleDashed,
  CircleX,
  Code,
  Lightbulb,
  LoaderCircle,
  Play,
  RotateCcw,
  Terminal,
  TriangleAlert,
} from 'lucide-react'
import ConceptCard from '../components/ConceptCard'
import ThemeToggle from '../components/ThemeToggle'
import type {
  Difficulty,
  ExecuteResponse,
  Exercise,
  ExerciseTemplate,
  Language,
  ProgressStatus,
} from '../types'
import {
  executeCode,
  extractErrorMessage,
  getExerciseById,
  getLanguages,
  isAuthenticated,
  saveDraft,
} from '../services/api'
import { registerPseintLanguage } from '../services/monacoLanguages'
import { detectConcepts, getSeenConceptIds, markConceptSeen } from '../services/concepts'
import type { Concept } from '../services/concepts'
import { EDITOR_OPTIONS, toMonacoLanguage } from '../services/editor'

type DraftState = 'idle' | 'saving' | 'saved' | 'error'

interface PendingDraft {
  exerciseId: number
  languageSlug: string
  code: string
}

// Límites de los divisores arrastrables (porcentaje del ancho y píxeles de alto).
const DEFAULT_LEFT_PERCENT = 40
const LEFT_MIN_PERCENT = 22
const LEFT_MAX_PERCENT = 70
const DEFAULT_CONSOLE_HEIGHT = 220
const CONSOLE_MIN_HEIGHT = 80
const EDITOR_MIN_HEIGHT = 160

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

const DIFFICULTY_STYLES: Record<Difficulty, { label: string; badge: string }> = {
  Easy: { label: 'Fácil', badge: 'bg-success-soft text-success ring-success-line' },
  Medium: { label: 'Medio', badge: 'bg-warning-soft text-warning ring-warning-line' },
  Hard: { label: 'Difícil', badge: 'bg-danger-soft text-danger ring-danger-line' },
}

function normalizeExercise(data: Exercise): Exercise {
  return { ...data, templates: data.templates ?? [] }
}

function isUsableTemplate(template: ExerciseTemplate): boolean {
  return Boolean(template?.language)
}

function toExerciseError(caught: unknown): string {
  return extractErrorMessage(caught, 'No se pudo cargar el ejercicio.')
}

function toInitialCode(exercise: Exercise): Record<string, string> {
  const initialCode: Record<string, string> = {}
  for (const template of exercise.templates) {
    if (!isUsableTemplate(template)) continue
    initialCode[template.language.slug] = template.starterCode ?? ''
  }
  // El borrador guardado tiene prioridad sobre el código inicial: así el alumno
  // continúa exactamente donde lo dejó.
  for (const draft of exercise.drafts ?? []) {
    initialCode[draft.languageSlug] = draft.code
  }
  return initialCode
}

export default function Workspace() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const navigate = useNavigate()

  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [selectedSlug, setSelectedSlug] = useState('')
  const [activeLanguages, setActiveLanguages] = useState<Language[]>([])
  const [codeBySlug, setCodeBySlug] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ExecuteResponse | null>(null)
  const [userStatus, setUserStatus] = useState<ProgressStatus | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [draftState, setDraftState] = useState<DraftState>('idle')
  const saveTimerRef = useRef<number | null>(null)
  const pendingDraftRef = useRef<PendingDraft | null>(null)

  // Layout ajustable tipo VS Code: divisor vertical (izq/der) y horizontal (editor/consola).
  const [leftPercent, setLeftPercent] = useState(DEFAULT_LEFT_PERCENT)
  const [consoleHeight, setConsoleHeight] = useState(DEFAULT_CONSOLE_HEIGHT)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rightPanelRef = useRef<HTMLDivElement | null>(null)

  const startDrag = useCallback(
    (onMove: (event: PointerEvent) => void) => {
      document.body.style.userSelect = 'none'
      const stop = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', stop)
        document.body.style.userSelect = ''
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', stop)
    },
    [],
  )

  const handleHorizontalDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = containerRef.current
      if (!container) return
      event.preventDefault()
      const rect = container.getBoundingClientRect()
      startDrag((moveEvent) => {
        const percent = ((moveEvent.clientX - rect.left) / rect.width) * 100
        setLeftPercent(clamp(percent, LEFT_MIN_PERCENT, LEFT_MAX_PERCENT))
      })
    },
    [startDrag],
  )

  const handleVerticalDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const panel = rightPanelRef.current
      if (!panel) return
      event.preventDefault()
      const rect = panel.getBoundingClientRect()
      const maxHeight = Math.max(CONSOLE_MIN_HEIGHT, rect.height - EDITOR_MIN_HEIGHT)
      startDrag((moveEvent) => {
        setConsoleHeight(clamp(rect.bottom - moveEvent.clientY, CONSOLE_MIN_HEIGHT, maxHeight))
      })
    },
    [startDrag],
  )

  // Sin `pointerup` (el ratón se soltó fuera de la ventana) el body se quedaba
  // con `user-select: none`, así que la limpieza también ocurre al desmontar.
  useEffect(
    () => () => {
      document.body.style.userSelect = ''
    },
    [],
  )

  const fetchExercise = useCallback(async (): Promise<Exercise> => {
    if (!exerciseId) throw new Error('No se encontró el identificador del ejercicio.')
    return normalizeExercise(await getExerciseById(Number(exerciseId)))
  }, [exerciseId])

  const applyExercise = useCallback((data: Exercise): void => {
    setResult(null)
    setRunError(null)
    setDraftState('idle')
    setExercise(data)
    // `GET /exercises/{id}` rellena userStatus solo si la petición lleva JWT.
    setUserStatus(data.userStatus ?? null)
    setCodeBySlug(toInitialCode(data))
    setSelectedSlug(data.templates[0]?.language.slug ?? '')
  }, [])

  useEffect(() => {
    let isActive = true

    fetchExercise()
      .then((data) => {
        if (!isActive) return
        applyExercise(data)
      })
      .catch((caught: unknown) => {
        if (isActive) setLoadError(toExerciseError(caught))
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [applyExercise, fetchExercise])

  // El catálogo público ya filtra los inactivos y define el orden del selector.
  useEffect(() => {
    let isActive = true

    getLanguages()
      .then((data) => {
        if (isActive) setActiveLanguages(data)
      })
      .catch(() => undefined)

    return () => {
      isActive = false
    }
  }, [])

  function handleRetryExercise() {
    setIsLoading(true)
    setLoadError(null)

    fetchExercise()
      .then(applyExercise)
      .catch((caught: unknown) => setLoadError(toExerciseError(caught)))
      .finally(() => setIsLoading(false))
  }

  const templates = useMemo(
    () => (exercise?.templates ?? []).filter(isUsableTemplate),
    [exercise],
  )

  const templateBySlug = useMemo(() => {
    const bySlug = new Map<string, ExerciseTemplate>()
    for (const template of templates) {
      bySlug.set(template.language.slug, template)
    }
    return bySlug
  }, [templates])

  // El selector ofrece el catálogo activo (Java, PSeint, Python) aunque el ejercicio
  // todavía no tenga plantilla para alguno: el alumno puede escribir desde cero y el
  // backend traduce PSeint. Si el catálogo no responde, se usan las plantillas.
  const languageOptions = useMemo(() => {
    const catalog: Language[] =
      activeLanguages.length > 0
        ? activeLanguages
        : templates.map((template) => template.language)

    const seen = new Set<string>()
    const options: Array<{ slug: string; name: string }> = []
    for (const language of catalog) {
      if (!language?.slug || language.isActive === false || seen.has(language.slug)) continue
      seen.add(language.slug)
      options.push({ slug: language.slug, name: language.name })
    }
    return options
  }, [activeLanguages, templates])

  // `selectedSlug` puede quedar obsoleto al cargar el catálogo; el slug efectivo
  // siempre apunta a una opción válida del selector.
  const effectiveSlug = useMemo(
    () =>
      languageOptions.some((option) => option.slug === selectedSlug)
        ? selectedSlug
        : (languageOptions[0]?.slug ?? ''),
    [languageOptions, selectedSlug],
  )

  const currentTemplate = templateBySlug.get(effectiveSlug) ?? null

  const currentCode = codeBySlug[effectiveSlug] ?? currentTemplate?.starterCode ?? ''
  const difficulty = exercise ? (DIFFICULTY_STYLES[exercise.difficulty] ?? DIFFICULTY_STYLES.Easy) : null

  // El backend marca hasError cuando el ejecutor devuelve compilación o runtime error;
  // en ese caso actualOutput suele venir vacío y el mensaje útil va en errorOutput.
  const hasExecutionError = Boolean(result?.hasError || result?.errorOutput?.trim())

  const persistDraft = useCallback(
    (slug: string, code: string) => {
      if (!exercise || !isAuthenticated()) return
      saveDraft(exercise.id, { languageSlug: slug, code })
        .then(() => setDraftState('saved'))
        .catch(() => setDraftState('error'))
    },
    [exercise],
  )

  // Autoguardado con retardo: el borrador del lenguaje se guarda 1.2s después de
  // la última pulsación, sin bloquear la escritura.
  const scheduleDraftSave = useCallback(
    (slug: string, code: string) => {
      if (!exercise || !isAuthenticated()) return
      pendingDraftRef.current = { exerciseId: exercise.id, languageSlug: slug, code }
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
      setDraftState('saving')
      saveTimerRef.current = window.setTimeout(() => {
        const pending = pendingDraftRef.current
        pendingDraftRef.current = null
        if (pending) persistDraft(pending.languageSlug, pending.code)
      }, 1200)
    },
    [exercise, persistDraft],
  )

  // Al cambiar de lenguaje o al salir de la página, lo pendiente se guarda en el
  // acto: si no, el alumno perdería las últimas pulsaciones al navegar.
  const flushPendingDraft = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const pending = pendingDraftRef.current
    pendingDraftRef.current = null
    if (!pending || !isAuthenticated()) return
    // Sin `await`: en una navegación solo importa que la petición llegue al backend.
    void saveDraft(pending.exerciseId, {
      languageSlug: pending.languageSlug,
      code: pending.code,
    }).catch(() => undefined)
  }, [])

  const handleCodeChange = useCallback(
    (value: string | undefined) => {
      const nextCode = value ?? ''
      setCodeBySlug((previous) => ({ ...previous, [effectiveSlug]: nextCode }))
      scheduleDraftSave(effectiveSlug, nextCode)
    },
    [effectiveSlug, scheduleDraftSave],
  )

  useEffect(() => flushPendingDraft, [flushPendingDraft])

  // El editor se monta una vez y se reutiliza: `layout()` explícito para que el
  // caret y las líneas visibles coincidan con el modelo tras cambiar el tamaño
  // del panel o redimensionar la ventana.
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const handleEditorMount = useCallback<OnMount>((editor) => {
    editorRef.current = editor
    editor.layout()
  }, [])

  // Constructor(es) nueva(s) que hay que explicar antes del primer intento.
  const hasCheckedConcepts = useRef(false)
  const [conceptsToShow, setConceptsToShow] = useState<Concept[]>([])

  const handleAcknowledgeConcept = useCallback((conceptId: string) => {
    markConceptSeen(conceptId)
    setConceptsToShow((previous) => previous.filter((concept) => concept.id !== conceptId))
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    const container = editor?.getContainerDomNode()?.parentElement ?? null
    if (!editor || !container) return

    const syncLayout = () => editor.layout()
    window.addEventListener('resize', syncLayout)
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncLayout) : null
    observer?.observe(container)

    return () => {
      window.removeEventListener('resize', syncLayout)
      observer?.disconnect()
    }
  }, [exercise, effectiveSlug])

  const handleLanguageChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      flushPendingDraft()
      setSelectedSlug(event.target.value)
      setResult(null)
      setRunError(null)
      setDraftState('idle')
    },
    [flushPendingDraft],
  )

  const handleResetCode = useCallback(() => {
    if (!effectiveSlug) return
    const starterCode = currentTemplate?.starterCode ?? ''
    setCodeBySlug((previous) => ({ ...previous, [effectiveSlug]: starterCode }))
    setResult(null)
    setRunError(null)
    // Sin esto, al recargar volvería el borrador previo al restablecimiento.
    scheduleDraftSave(effectiveSlug, starterCode)
  }, [currentTemplate, effectiveSlug, scheduleDraftSave])

  const handleRun = useCallback(async () => {
    if (!exercise || isRunning || !effectiveSlug) return

    // Antes del primer intento se comprueba si el código usa alguna construcción
    // que el alumno todavía no ha visto: en ese caso se explica y se espera a
    // que pulse "Entendido" en lugar de ejecutar a ciegas.
    if (!hasCheckedConcepts.current) {
      const pending = detectConcepts(currentCode, effectiveSlug).filter(
        (concept) => !getSeenConceptIds().has(concept.id),
      )

      if (pending.length > 0) {
        setConceptsToShow(pending)
        return
      }

      hasCheckedConcepts.current = true
    }

    setIsRunning(true)
    setResult(null)
    setRunError(null)

    try {
      const response = await executeCode(exercise.id, {
        languageSlug: effectiveSlug,
        code: currentCode,
      })
      setResult(response)
      // El backend devuelve el progreso tras este envío: "completed" al acertar,
      // "attempted" al intentar sin cumplir la salida esperada.
      if (response.userStatus) setUserStatus(response.userStatus)
    } catch (caught) {
      setRunError(extractErrorMessage(caught, 'No se pudo ejecutar el código.'))
    } finally {
      setIsRunning(false)
    }
  }, [exercise, isRunning, effectiveSlug, currentCode])

  // `handleRun` cambia en cada pulsación (depende de `currentCode`); con el ref el
  // listener de `window` se registra una vez y no se desmonta con cada tecla.
  const runRef = useRef(handleRun)

  useEffect(() => {
    runRef.current = handleRun
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        void runRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-canvas">
        <div className="flex items-center gap-3 text-sm text-muted">
          <LoaderCircle className="h-5 w-5 animate-spin text-accent-ink" />
          Cargando ejercicio...
        </div>
      </div>
    )
  }

  if (loadError || !exercise) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
          <TriangleAlert className="mx-auto h-10 w-10 text-danger" />
          <h1 className="mt-4 text-lg font-semibold text-ink">No pudimos abrir el ejercicio</h1>
          <p className="mt-2 text-sm text-muted">{loadError}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-body transition hover:bg-inset"
            >
              Volver al dashboard
            </button>
            <button
              type="button"
              onClick={handleRetryExercise}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex h-screen w-screen overflow-hidden bg-canvas">
      {/* PANEL IZQUIERDO — Enunciado */}
      <section
        style={{ width: `${leftPercent}%` }}
        className="flex h-full min-w-0 shrink-0 flex-col bg-surface"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-6 py-4">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted transition hover:bg-inset hover:text-ink focus:outline-none focus:ring-4 focus:ring-line"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al dashboard
          </button>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {conceptsToShow.length > 0 ? (
            <section className="mb-6 space-y-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-accent-ink" />
                <h2 className="text-sm font-semibold text-ink">
                  Antes de ejecutar: {conceptsToShow.length === 1 ? 'un concepto nuevo' : 'conceptos nuevos'}
                </h2>
              </div>

              {conceptsToShow.map((concept) => (
                <ConceptCard key={concept.id} concept={concept} onAcknowledge={handleAcknowledgeConcept} />
              ))}

              <p className="text-xs text-muted">
                Cuando los hayas leído, vuelve a pulsar Ejecutar para ver la salida de tu código.
              </p>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-ink">
              {exercise.title}
            </h1>
            {difficulty ? (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${difficulty.badge}`}
              >
                {difficulty.label}
              </span>
            ) : null}
            {userStatus === 'completed' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success ring-1 ring-inset ring-success-line">
                <CircleCheckBig className="h-3.5 w-3.5" />
                Completado
              </span>
            ) : userStatus === 'attempted' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-info-soft px-2.5 py-0.5 text-xs font-semibold text-info ring-1 ring-inset ring-info-line">
                <CircleDashed className="h-3.5 w-3.5" />
                En progreso
              </span>
            ) : null}
          </div>

          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
              Enunciado
            </h2>
            <div className="prose prose-slate prose-sm mt-2 max-w-none whitespace-pre-line leading-relaxed text-[15px] text-body">
              {exercise.description}
            </div>
          </div>

          <div className="mt-8">
            <div className="rounded-xl bg-editor p-4 shadow-inner">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                <Terminal className="h-3.5 w-3.5" />
                Salida Esperada
              </p>
              <pre className="mt-2.5 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-code-ink/80">
                {exercise.expectedOutput?.trim() ? exercise.expectedOutput : '(sin salida)'}
              </pre>
            </div>
          </div>

          {exercise.inputs && exercise.inputs.length > 0 ? (
            <div className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
                Valores del leer
              </h2>
              <p className="mt-1 text-xs text-muted">
                Tu programa recibirá estos valores por entrada, en este orden.
              </p>
              <ul className="mt-3 space-y-1.5">
                {exercise.inputs.map((input) => (
                  <li
                    key={input.orderIndex}
                    className="flex items-center gap-3 rounded-lg border border-line bg-inset px-3 py-2"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface text-[11px] font-semibold text-muted ring-1 ring-inset ring-line">
                      {input.orderIndex + 1}
                    </span>
                    <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">
                      {input.value}
                    </code>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        input.valueType === 'Number'
                          ? 'bg-accent/10 text-accent-ink ring-accent/20'
                          : 'bg-info-soft text-info ring-info-line'
                      }`}
                    >
                      {input.valueType === 'Number' ? 'Número' : 'Texto'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      {/* Divisor vertical: enunciado ↔ editor */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar ancho del enunciado"
        onPointerDown={handleHorizontalDragStart}
        onDoubleClick={() => setLeftPercent(DEFAULT_LEFT_PERCENT)}
        className="group relative z-10 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-line/70 transition hover:bg-accent/60"
      >
        <span className="h-8 w-0.5 rounded-full bg-line-strong transition group-hover:bg-accent" />
      </div>

      {/* PANEL DERECHO — Editor + Consola */}
      <section ref={rightPanelRef} className="flex h-full min-w-0 flex-1 flex-col bg-editor">
        {/* Barra superior */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-code-chrome px-4">
          <div className="flex min-w-0 items-center gap-2 text-sm text-code-ink/60">
            <Code className="h-4 w-4 shrink-0" />
            <span className="truncate font-mono">
              {effectiveSlug || 'main'}.txt
            </span>
            {draftState === 'saving' ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-code-ink/50">
                <LoaderCircle className="h-3 w-3 animate-spin" />
                Guardando…
              </span>
            ) : draftState === 'saved' ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                <CircleCheckBig className="h-3 w-3" />
                Guardado
              </span>
            ) : draftState === 'error' ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-red-400">
                <TriangleAlert className="h-3 w-3" />
                Sin guardar
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <label htmlFor="language-select" className="text-xs font-medium text-code-ink/60">
              Lenguaje
            </label>
            <div className="relative">
              <select
                id="language-select"
                value={effectiveSlug}
                onChange={handleLanguageChange}
                disabled={languageOptions.length === 0}
                className="appearance-none rounded-lg border border-white/10 bg-code-input py-1.5 pl-3 pr-9 text-sm font-medium text-code-ink outline-none transition hover:bg-code-input-hover focus:border-accent focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {languageOptions.length === 0 ? (
                  <option value="">Sin lenguajes</option>
                ) : (
                  languageOptions.map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {option.name}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-code-ink/60" />
            </div>

            <button
              type="button"
              onClick={handleResetCode}
              disabled={!effectiveSlug}
              title="Restaurar código inicial"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-sm font-medium text-code-ink/70 transition hover:bg-white/5 hover:text-code-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="relative min-h-0 flex-1">
          <Editor
            height="100%"
            theme="vs-dark"
            beforeMount={registerPseintLanguage}
            language={toMonacoLanguage(effectiveSlug)}
            value={currentCode}
            onChange={handleCodeChange}
            onMount={handleEditorMount}
            loading={
              <div className="flex h-full items-center justify-center bg-editor text-sm text-faint">
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Cargando editor...
              </div>
            }
            options={EDITOR_OPTIONS}
          />
        </div>

        {/* Divisor horizontal: editor ↔ consola */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Ajustar alto de la consola"
          onPointerDown={handleVerticalDragStart}
          onDoubleClick={() => setConsoleHeight(DEFAULT_CONSOLE_HEIGHT)}
          className="group relative z-10 flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-t border-white/10 bg-code-chrome transition hover:bg-accent/60"
        >
          <span className="h-0.5 w-8 rounded-full bg-white/20 transition group-hover:bg-accent" />
        </div>

        {/* Consola */}
        <div style={{ height: consoleHeight }} className="flex shrink-0 flex-col bg-code">
          <div className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-code-chrome px-4">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-code-ink/70">Consola</span>
              {isRunning ? (
                <span className="flex items-center gap-1.5 text-xs text-amber-400">
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                  Ejecutando...
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={isRunning || !effectiveSlug}
              className="inline-flex items-center gap-2 rounded-lg bg-success-solid px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-success-solid/25 transition hover:bg-success-solid-hover focus:outline-none focus:ring-4 focus:ring-success-solid/30 disabled:cursor-not-allowed disabled:bg-success-solid/60 disabled:shadow-none"
            >
              {isRunning ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {isRunning ? 'Ejecutando...' : 'Ejecutar Código'}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {runError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <p className="text-sm text-red-300">{runError}</p>
              </div>
            ) : null}

            {!runError && result ? (
              <div className="space-y-3">
                {hasExecutionError ? (
                  <>
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-300">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <p className="text-sm">
                        Tu código se ejecutó pero produjo un error. Corrígelo y vuelve a intentarlo.
                      </p>
                    </div>
                    {result.errorOutput ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/80">
                          Error de compilación / ejecución
                        </p>
                        <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-amber-200">
                          {result.errorOutput}
                        </pre>
                      </div>
                    ) : null}
                  </>
                ) : result.isCorrect ? (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-300">
                    <CircleCheckBig className="h-4 w-4 shrink-0" />
                    <p className="text-sm font-semibold">¡Correcto! Ejercicio superado 🎉</p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-300">
                    <CircleX className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className="text-sm">
                      La salida no coincide con la esperada. Revisa tu solución e inténtalo de nuevo.
                    </p>
                  </div>
                )}

                {!hasExecutionError && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Salida de tu código
                    </p>
                    <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-code-ink">
                      {result.actualOutput?.trim() ? result.actualOutput : '(sin salida)'}
                    </pre>
                  </div>
                )}

                {!result.isCorrect && result.expectedOutput && !hasExecutionError ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      Salida esperada
                    </p>
                    <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-code-ink/60">
                      {result.expectedOutput}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!runError && !result ? (
              <p className="font-mono text-[13px] text-muted">
                <span className="text-emerald-500">$</span> Pulsa{' '}
                <span className="text-faint">Ejecutar Código</span> (o{' '}
                <span className="text-faint">Ctrl + Enter</span>) para ver el resultado de tu
                solución.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}