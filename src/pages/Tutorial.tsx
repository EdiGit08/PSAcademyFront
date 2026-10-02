import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleCheckBig,
  CircleDashed,
  CircleX,
  GraduationCap,
  Lightbulb,
  LoaderCircle,
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
  TriangleAlert,
  Trophy,
} from 'lucide-react'
import Markdown from '../components/Markdown'
import ThemeToggle from '../components/ThemeToggle'
import type { ExecuteResponse, TutorialExercise, TutorialStep } from '../types'
import {
  executeCode,
  extractErrorMessage,
  getFirstExerciseOfCategory,
  getTutorialExercises,
} from '../services/api'
import { EDITOR_OPTIONS, toMonacoLanguage } from '../services/editor'
import { PSEINT_LANGUAGE_ID, registerPseintLanguage } from '../services/monacoLanguages'

/** Categoría que se habilita al completar el 100% de las lecciones. */
const NEXT_CATEGORY_NAME = 'Fundamentos'

function toTutorialError(caught: unknown): string {
  return extractErrorMessage(caught, 'No se pudo cargar el tutorial.')
}

function hasExecutionError(result: ExecuteResponse | null): boolean {
  return Boolean(result?.hasError) || Boolean(result?.errorOutput)
}

/**
 * Tutorial guiado de PS Academy.
 *
 * Cada lección son cuatro pasos de PSeint: el panel de la izquierda explica el
 * concepto y el paso actual; a la derecha el alumno edita y ejecuta. El backend
 * valida cada paso contra su salida esperada y solo marca la lección como
 * superada en el último paso, así que avanzar exige ejecutar algo correcto.
 *
 * Las lecciones pueden hacerse en cualquier orden: terminar la última lección
 * NO cierra el tutorial. El tutorial se da por terminado (felicitación y acceso
 * a Fundamentos) únicamente cuando el progreso llega al 100%.
 *
 * Al entrar a /tutorial se muestra siempre la galería de lecciones; la lección
 * activa solo se define cuando el alumno elige una (o pulsa el botón principal).
 */
export default function Tutorial() {
  const navigate = useNavigate()

  const [lessons, setLessons] = useState<TutorialExercise[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Empieza en null a propósito: así se ve la galería y no la lección 1.
  const [activeLessonId, setActiveLessonId] = useState<number | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  /** Código por paso: se guarda para no perder lo escrito al volver atrás. */
  const [codeByStep, setCodeByStep] = useState<Record<number, string>>({})
  const [solvedStepIds, setSolvedStepIds] = useState<number[]>([])
  const [completedLessonIds, setCompletedLessonIds] = useState<number[]>([])

  const [result, setResult] = useState<ExecuteResponse | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [isOpeningNext, setIsOpeningNext] = useState(false)

  const fetchTutorial = useCallback((): Promise<TutorialExercise[]> => {
    return getTutorialExercises()
      .then((data) => {
        setLessons(data)
        setCompletedLessonIds(
          data.filter((lesson) => lesson.userStatus === 'completed').map((lesson) => lesson.id),
        )
        return data
      })
      .catch((caught: unknown) => {
        setLessons([])
        setLoadError(toTutorialError(caught))
        return []
      })
  }, [])

  function handleRetryTutorial() {
    setIsLoading(true)
    setLoadError(null)
    void fetchTutorial().finally(() => setIsLoading(false))
  }

  useEffect(() => {
    let isActive = true

    void getTutorialExercises()
      .then((data) => {
        if (!isActive) return
        setLessons(data)
        setCompletedLessonIds(
          data.filter((lesson) => lesson.userStatus === 'completed').map((lesson) => lesson.id),
        )
      })
      .catch((caught: unknown) => {
        if (!isActive) return
        setLessons([])
        setLoadError(toTutorialError(caught))
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [])

  const activeLesson = useMemo(
    () => lessons.find((lesson) => lesson.id === activeLessonId) ?? null,
    [activeLessonId, lessons],
  )

  const steps: TutorialStep[] = useMemo(
    () => activeLesson?.tutorialSteps ?? [],
    [activeLesson],
  )

  const step: TutorialStep | null = steps[stepIndex] ?? null
  const isLastStep = step !== null && stepIndex === steps.length - 1

  /** El tutorial solo está terminado cuando TODAS las lecciones están completadas (100%). */
  const allLessonsCompleted =
    lessons.length > 0 && lessons.every((lesson) => completedLessonIds.includes(lesson.id))

  const code = step ? (codeByStep[step.id] ?? step.codeSnippet) : ''
  const isStepSolved = step !== null && solvedStepIds.includes(step.id)
  const canContinue = isStepSolved

  // `handleRun` se recrea en cada cambio de código; con el ref el listener de
  // Ctrl+Enter se registra una sola vez y siempre llama a la versión actual.
  const runRef = useRef<() => void>(() => {})

  const resetStepOutput = useCallback(() => {
    setResult(null)
    setRunError(null)
  }, [])

  function openLesson(lesson: TutorialExercise, index = 0) {
    setActiveLessonId(lesson.id)
    setStepIndex(Math.min(index, Math.max(lesson.tutorialSteps.length - 1, 0)))
    setIsFinished(false)
    resetStepOutput()
  }

  function backToLessons() {
    setActiveLessonId(null)
    setIsFinished(false)
    resetStepOutput()
  }

  function handleCodeChange(value: string | undefined) {
    if (!step) return
    setCodeByStep((previous) => ({ ...previous, [step.id]: value ?? '' }))
  }

  function handleResetCode() {
    if (!step) return
    setCodeByStep((previous) => {
      const next = { ...previous }
      delete next[step.id]
      return next
    })
    resetStepOutput()
  }

  async function handleRun() {
    if (!step || !activeLesson || isRunning) return

    setIsRunning(true)
    setRunError(null)
    setResult(null)

    try {
      const response = await executeCode(activeLesson.id, {
        languageSlug: PSEINT_LANGUAGE_ID,
        code,
        tutorialStepId: step.id,
      })

      setResult(response)

      if (response.isCorrect) {
        setSolvedStepIds((previous) =>
          previous.includes(step.id) ? previous : [...previous, step.id],
        )
        // El backend solo marca la lección como superada al superar el último
        // paso; aquí reflejamos ese mismo avance para pintar el progreso.
        if (isLastStep) {
          setCompletedLessonIds((previous) =>
            previous.includes(activeLesson.id) ? previous : [...previous, activeLesson.id],
          )
        }
      }
    } catch (caught: unknown) {
      setRunError(extractErrorMessage(caught, 'No se pudo ejecutar el código.'))
    } finally {
      setIsRunning(false)
    }
  }

  useEffect(() => {
    runRef.current = () => {
      void handleRun()
    }
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || event.key !== 'Enter') return
      if (!step) return
      event.preventDefault()
      runRef.current()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [step])

  function handleContinue() {
    if (!step || !activeLesson) return

    if (!isLastStep) {
      setStepIndex((previous) => previous + 1)
      resetStepOutput()
      return
    }

    // Último paso de la lección: el tutorial solo termina si ya está al 100%.
    // Si no, se vuelve a la galería para que el alumno elija otra lección.
    if (allLessonsCompleted) {
      setIsFinished(true)
      return
    }

    backToLessons()
  }

  async function handleGoToNextCategory() {
    setIsOpeningNext(true)
    try {
      const first = await getFirstExerciseOfCategory(NEXT_CATEGORY_NAME)
      if (first) {
        navigate(`/workspace/${first.id}`)
        return
      }
      navigate('/dashboard')
    } catch {
      navigate('/dashboard')
    } finally {
      setIsOpeningNext(false)
    }
  }

  // ------------------------------------------------------------- Render

  const header = (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white shadow-md shadow-accent/20">
            <GraduationCap className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-ink">Tutorial guiado</h1>
            <p className="text-xs text-muted">Cinco lecciones para aprender a programar</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-body sm:min-h-0 transition hover:bg-inset hover:text-ink focus:outline-none focus:ring-4 focus:ring-line"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Volver al panel</span>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-canvas">
        {header}
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 py-20 text-sm text-muted sm:px-6">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Cargando el tutorial...
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-canvas">
        {header}
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p>{loadError}</p>
              <button
                type="button"
                onClick={handleRetryTutorial}
                className="mt-1 inline-flex min-h-11 items-center font-semibold text-danger underline underline-offset-2 hover:text-danger sm:min-h-0"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (lessons.length === 0) {
    return (
      <div className="min-h-screen bg-canvas">
        {header}
        <div className="mx-auto max-w-3xl px-4 py-12 text-center sm:px-6 sm:py-20">
          <div className="rounded-xl border border-dashed border-line-strong bg-surface p-6 sm:p-10">
            <BookOpen className="mx-auto h-9 w-9 text-faint" />
            <p className="mt-3 text-sm font-medium text-body">El tutorial todavía no está disponible</p>
            <p className="mt-1 text-sm text-muted">
              Vuelve en unos minutos o revisa las categorías desde el panel.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------- Galería

  if (!activeLesson) {
    const finishedCount = lessons.filter((lesson) => completedLessonIds.includes(lesson.id)).length
    const allDone = allLessonsCompleted

    const galleryEyebrow = allDone
      ? 'Tutorial completado'
      : finishedCount > 0
        ? 'Tutorial en progreso'
        : 'Empieza por aquí'

    const galleryCta = allDone
      ? 'Repetir el tutorial'
      : finishedCount > 0
        ? 'Continuar donde lo dejaste'
        : 'Empezar la lección 1'

    function handleMainAction() {
      // Repetir: vuelve a la lección 1. Continuar/Empezar: primera lección pendiente.
      const target = allDone
        ? lessons[0]
        : (lessons.find((lesson) => !completedLessonIds.includes(lesson.id)) ?? lessons[0])
      openLesson(target, 0)
    }

    return (
      <div className="min-h-screen bg-canvas">
        {header}

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <section className="overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-accent-soft via-surface to-surface p-5 sm:p-8">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
              <Sparkles className="h-3.5 w-3.5" />
              {galleryEyebrow}
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Aprende a programar desde cero, paso a paso
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-body">
              Cada lección explica un concepto nuevo, te muestra el código y te deja ejecutarlo
              hasta que la salida sea la correcta. No necesitas saber nada: solo sigue el orden.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <div className="min-w-[9rem] flex-1 sm:min-w-[12rem]">
                <div className="flex items-center justify-between text-xs font-medium text-muted">
                  <span>
                    {finishedCount} de {lessons.length} lecciones
                  </span>
                  <span>{Math.round((finishedCount / lessons.length) * 100)}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-inset">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${(finishedCount / lessons.length) * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleMainAction}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/20"
                >
                  {galleryCta}
                  <ArrowRight className="h-4 w-4" />
                </button>

                {allDone ? (
                  <button
                    type="button"
                    onClick={() => void handleGoToNextCategory()}
                    disabled={isOpeningNext}
                    className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold text-body transition hover:bg-inset hover:text-ink focus:outline-none focus:ring-4 focus:ring-line disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isOpeningNext ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    Ir a {NEXT_CATEGORY_NAME}
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <h3 className="mt-8 text-lg font-semibold tracking-tight text-ink">Lecciones</h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lessons.map((lesson, index) => {
              const isDone = completedLessonIds.includes(lesson.id)
              return (
                <li key={lesson.id}>
                  <button
                    type="button"
                    onClick={() => openLesson(lesson, 0)}
                    className="group flex h-full w-full flex-col rounded-xl border border-line bg-surface p-4 text-left transition hover:border-accent-line hover:shadow-md hover:shadow-line/60 focus:outline-none focus:ring-4 focus:ring-accent/15"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-accent-ink">
                        Lección {index + 1}
                      </span>
                      {isDone ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success ring-1 ring-inset ring-success-line">
                          <CircleCheckBig className="h-3.5 w-3.5" />
                          Lista
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-inset px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-inset ring-line">
                          <CircleDashed className="h-3.5 w-3.5" />
                          {lesson.tutorialSteps.length} pasos
                        </span>
                      )}
                    </div>

                    <p className="mt-2 font-medium text-ink">{lesson.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{lesson.description}</p>

                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-ink">
                      {isDone ? 'Repasar lección' : 'Abrir lección'}
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </main>
      </div>
    )
  }

  // ------------------------------------------------------------- Cierre

  if (isFinished) {
    return (
      <div className="min-h-screen bg-canvas">
        {header}

        <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <div className="rounded-2xl border border-success-line bg-success-soft p-6 text-center sm:p-8">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-success-solid text-white shadow-lg shadow-success-solid/25">
              <Trophy className="h-8 w-8" />
            </span>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
              ¡Felicitaciones, completaste el tutorial!
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-body">
              Ya sabes escribir un programa, pedir datos con Leer, guardar información en
              variables y mostrar resultados. Las cinco lecciones quedan completadas al 100%: la
              sección de {NEXT_CATEGORY_NAME} ya está habilitada para ti.
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => void handleGoToNextCategory()}
                disabled={isOpeningNext}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isOpeningNext ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Ir a {NEXT_CATEGORY_NAME}
              </button>

              <button
                type="button"
                onClick={backToLessons}
                className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-body transition hover:bg-inset hover:text-ink focus:outline-none focus:ring-4 focus:ring-line"
              >
                <ArrowLeft className="h-4 w-4" />
                Repasar las lecciones
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // ------------------------------------------------------------- Lección

  if (!step) {
    return (
      <div className="min-h-screen bg-canvas">
        {header}
        <main className="mx-auto max-w-3xl px-4 py-12 text-center sm:px-6 sm:py-20">
          <div className="rounded-xl border border-dashed border-line-strong bg-surface p-6 sm:p-10">
            <BookOpen className="mx-auto h-9 w-9 text-faint" />
            <p className="mt-3 text-sm font-medium text-body">Esta lección aún no tiene pasos</p>
            <p className="mt-1 text-sm text-muted">
              Vuelve al listado y elige otra lección del tutorial.
            </p>
            <button
              type="button"
              onClick={backToLessons}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-body transition hover:bg-inset hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a las lecciones
            </button>
          </div>
        </main>
      </div>
    )
  }

  const lessonIndex = lessons.findIndex((lesson) => lesson.id === activeLesson.id)

  return (
    <div className="min-h-screen bg-canvas">
      {header}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={backToLessons}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition hover:bg-inset hover:text-ink focus:outline-none focus:ring-4 focus:ring-line sm:min-h-0"
          >
            <ArrowLeft className="h-4 w-4" />
            Todas las lecciones
          </button>

          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">
              Lección {lessonIndex + 1} de {lessons.length}
            </span>
            {' · '}
            {activeLesson.title}
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
          {/* Explicación del paso */}
          <section className="space-y-4">
            <div className="rounded-xl border border-line bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-ink">
                  Paso {stepIndex + 1} de {steps.length}
                </p>
                {isLastStep ? (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink ring-1 ring-inset ring-accent-line">
                    Reto final
                  </span>
                ) : null}
              </div>

              <h2 className="mt-2 text-lg font-semibold tracking-tight text-ink">{step.title}</h2>

              {step.task ? (
                <p className="mt-3 rounded-lg border border-line bg-inset px-3 py-2 text-sm text-body">
                  {step.task}
                </p>
              ) : null}

              <div className="mt-4">
                <Markdown text={step.body} />
              </div>

              {step.stdin ? (
                <div className="mt-4 rounded-lg border border-line bg-inset px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Datos que recibirá tu programa
                  </p>
                  <pre className="mt-1.5 overflow-x-auto font-mono text-sm text-code-ink">
                    {step.stdin}
                  </pre>
                </div>
              ) : null}

              {step.tip ? (
                <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-warning-line bg-warning-soft px-3 py-2.5">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <p className="text-sm text-body">{step.tip}</p>
                </div>
              ) : null}
            </div>

            {/* Navegación entre pasos */}
            <ol className="flex flex-wrap gap-2">
              {steps.map((item, index) => {
                const isCurrent = index === stepIndex
                const isSolved = solvedStepIds.includes(item.id)
                const isUnlocked = index <= stepIndex || isSolved

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={!isUnlocked}
                      onClick={() => {
                        setStepIndex(index)
                        resetStepOutput()
                      }}
                      className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-4 sm:min-h-0 ${
                        isCurrent
                          ? 'border-accent bg-accent text-white shadow-sm shadow-accent/25'
                          : isUnlocked
                            ? 'border-line-strong bg-surface text-body hover:border-accent-line hover:text-ink'
                            : 'cursor-not-allowed border-line bg-inset text-faint'
                      }`}
                    >
                      {isSolved && !isCurrent ? (
                        <CircleCheckBig className="h-3.5 w-3.5" />
                      ) : (
                        <span className="tabular-nums">{index + 1}</span>
                      )}
                      <span className="hidden sm:inline">{item.title}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>

          {/* Editor + consola */}
          {/* El alto tiene que ser definitivo, no un min-height: Monaco recibe height="100%",
              y un padre cuya altura solo depende de su min-height resuelve ese 100% a 0,
              dejando el editor aplastado a 5px. */}
          <section className="flex h-[32rem] flex-col overflow-hidden rounded-xl border border-line bg-code shadow-lg shadow-line/40 sm:h-[34rem] lg:h-[36rem]">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-code-chrome px-4 py-2 sm:flex-nowrap lg:h-12 lg:py-0">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-code-ink/70">Pseudocódigo PSeint</span>
              </div>

              <div className="flex w-full items-center gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={handleResetCode}
                  title="Restaurar el código del ejemplo"
                  aria-label="Restaurar el código del ejemplo"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 text-sm font-medium text-code-ink/70 transition hover:bg-white/5 hover:text-code-ink sm:h-auto sm:w-auto sm:gap-1.5 sm:px-2.5 sm:py-1.5"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => void handleRun()}
                  disabled={isRunning}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-success-solid px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-success-solid/25 transition hover:bg-success-solid-hover focus:outline-none focus:ring-4 focus:ring-success-solid/30 disabled:cursor-not-allowed disabled:bg-success-solid/60 disabled:shadow-none sm:flex-none"
                >
                  {isRunning ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isRunning ? 'Ejecutando...' : 'Ejecutar'}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <Editor
                height="100%"
                theme="vs-dark"
                beforeMount={registerPseintLanguage}
                language={toMonacoLanguage(PSEINT_LANGUAGE_ID)}
                value={code}
                onChange={handleCodeChange}
                loading={
                  <div className="flex h-full items-center justify-center bg-editor text-sm text-faint">
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Cargando editor...
                  </div>
                }
                options={EDITOR_OPTIONS}
              />
            </div>

            <div className="flex max-h-[38%] min-h-[7rem] shrink-0 flex-col border-t border-white/10 bg-code sm:max-h-[45%] sm:min-h-[9rem]">
              <div className="flex h-12 items-center justify-between gap-4 border-b border-white/10 bg-code-chrome px-4">
                <span className="text-sm font-medium text-code-ink/70">Consola</span>
                {isStepSolved ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <CircleCheckBig className="h-3.5 w-3.5" />
                    Paso superado
                  </span>
                ) : null}
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
                    {hasExecutionError(result) ? (
                      <>
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-300">
                          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                          <p className="text-sm">
                            Tu código se ejecutó pero produjo un error. Corrígelo y vuelve a
                            intentarlo.
                          </p>
                        </div>
                        {result.errorOutput ? (
                          <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-amber-200">
                            {result.errorOutput}
                          </pre>
                        ) : null}
                      </>
                    ) : result.isCorrect ? (
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-300">
                        <CircleCheckBig className="h-4 w-4 shrink-0" />
                        <p className="text-sm font-semibold">
                          {isLastStep ? '¡Lección superada!' : '¡Correcto! Sigue con el siguiente paso.'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-300">
                        <CircleX className="mt-0.5 h-4 w-4 shrink-0" />
                        <p className="text-sm">
                          La salida no es la esperada. Revisa tu código e inténtalo de nuevo.
                        </p>
                      </div>
                    )}

                    {!hasExecutionError(result) ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-code-ink/40">
                          Salida de tu código
                        </p>
                        <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-code-ink">
                          {result.actualOutput?.trim() ? result.actualOutput : '(sin salida)'}
                        </pre>
                      </div>
                    ) : null}

                    {!result.isCorrect && !hasExecutionError(result) ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-code-ink/40">
                          Salida esperada en este paso
                        </p>
                        <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-code-ink/60">
                          {result.expectedOutput}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {!runError && !result ? (
                  <p className="font-mono text-[13px] text-code-ink/50">
                    <span className="text-emerald-500">$</span> Pulsa{' '}
                    <span className="text-code-ink/70">Ejecutar</span> (o Ctrl + Enter) para ver
                    la salida de tu código.
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                <p className="text-xs text-code-ink/40">
                  {canContinue
                    ? isLastStep
                      ? allLessonsCompleted
                        ? 'Con esta lección completas el tutorial al 100%.'
                        : 'Lección completada: vuelve a la galería para elegir otra.'
                      : 'Puedes continuar al siguiente paso.'
                    : 'Supera este paso para poder continuar.'}
                </p>

                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={!canContinue}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/30 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-code-ink/30 disabled:shadow-none"
                >
                  {isLastStep
                    ? allLessonsCompleted
                      ? 'Terminar el tutorial'
                      : 'Volver a las lecciones'
                    : 'Siguiente paso'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}