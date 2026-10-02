import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  CircleCheckBig,
  CircleDashed,
  GraduationCap,
  Layers,
  ListChecks,
  LoaderCircle,
  Lock,
  LogOut,
  Settings,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import type { Category, Difficulty, Exercise, ProgressStatus } from '../types'
import {
  clearToken,
  extractErrorMessage,
  getCategories,
  getExercisesByCategory,
  getTutorialProgress,
  isAdmin,
} from '../services/api'
import type { TutorialProgress } from '../services/api'

/** Primera categoría del recorrido: se abre al completar el tutorial. */
const SEQUENTIAL_CATEGORY_NAME = 'Fundamentos'

/**
 * Categoría que contiene las cinco lecciones guiadas.
 *
 * NO se ofrece como categoría navegable, aunque siga viniendo en la respuesta de
 * /api/categories: el tutorial tiene su propia página guiada (/tutorial) y sus
 * lecciones no son ejercicios sueltos. Aparecer en el listado era lo que hacía que
 * el alumno tuviera dos caminos distintos al mismo contenido, y el segundo (resolver
 * una lección en el workspace) esquivaba los pasos guiados y le mostraba los valores
 * del "leer" del ejercicio en lugar de los del paso, que es justo la confusión que
 * había con los datos de entrada. El acceso único es el aviso de arriba del panel.
 */
const TUTORIAL_CATEGORY_NAME = 'tutorial'

const isTutorialCategory = (category: Category): boolean =>
  category.name.trim().toLowerCase() === TUTORIAL_CATEGORY_NAME

const EMPTY_TUTORIAL_PROGRESS: TutorialProgress = {
  totalLessons: 0,
  completedLessons: 0,
  isComplete: false,
}

/** Los tres estados del tutorial según el avance del alumno. */
type TutorialStage = 'not-started' | 'in-progress' | 'completed'

const TUTORIAL_COPY: Record<TutorialStage, { eyebrow: string; cta: string }> = {
  'not-started': { eyebrow: 'Empieza por aquí', cta: 'Comenzar el tutorial' },
  'in-progress': { eyebrow: 'Tutorial en progreso', cta: 'Continuar el tutorial' },
  completed: { eyebrow: 'Tutorial completado', cta: 'Repetir el tutorial' },
}

function getTutorialStage(progress: TutorialProgress): TutorialStage {
  if (progress.isComplete) return 'completed'
  if (progress.completedLessons > 0) return 'in-progress'
  return 'not-started'
}

/**
 * Por qué una categoría está bloqueada:
 * - `tutorial`: es la primera y el alumno aún no termina el tutorial.
 * - `previous`: falta completar todos los ejercicios de la categoría anterior.
 */
type CategoryLock = { kind: 'tutorial' } | { kind: 'previous'; previous: Category }

/** Una categoría está completa cuando todos sus ejercicios publicados están resueltos. */
function isCategoryComplete(exercises: Exercise[] | null | undefined): boolean {
  // Sin datos (aún no cargó o falló la carga): no se da por completa, así nunca se
  // desbloquea la siguiente por un error de red.
  if (!exercises) return false
  return exercises.every((exercise) => exercise.userStatus === 'completed')
}

const DIFFICULTY_STYLES: Record<Difficulty, { label: string; badge: string }> = {
  Easy: { label: 'Fácil', badge: 'bg-success-soft text-success ring-success-line' },
  Medium: { label: 'Medio', badge: 'bg-warning-soft text-warning ring-warning-line' },
  Hard: { label: 'Difícil', badge: 'bg-danger-soft text-danger ring-danger-line' },
}

const DIFFICULTY_DOT: Record<Difficulty, string> = {
  Easy: 'bg-green-500',
  Medium: 'bg-yellow-500',
  Hard: 'bg-danger-solid',
}

const STATUS_STYLES: Record<ProgressStatus, { label: string; badge: string }> = {
  attempted: {
    label: 'En progreso',
    badge: 'bg-info-soft text-info ring-info-line',
  },
  completed: {
    label: 'Completado',
    badge: 'bg-success-soft text-success ring-success-line',
  },
}

const LANGUAGE_LABELS: Record<string, string> = {
  pseint: 'Pseudocódigo',
  python: 'Python',
  java: 'Java',
}

function completedLanguageLabel(slug: string | null | undefined): string | null {
  if (!slug) return null
  return LANGUAGE_LABELS[slug] ?? slug
}

function toCategoriesError(caught: unknown): string {
  return extractErrorMessage(caught, 'No se pudieron cargar las categorías.')
}

function toExercisesError(caught: unknown): string {
  return extractErrorMessage(caught, 'No se pudieron cargar los ejercicios.')
}

export default function Dashboard() {
  const navigate = useNavigate()

  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  /** Ejercicios de TODAS las categorías (hacen falta para saber cuáles están completas). */
  const [exercisesByCategory, setExercisesByCategory] = useState<
    Record<number, Exercise[] | null>
  >({})
  const [reloadToken, setReloadToken] = useState(0)

  const [isLoadingCategories, setIsLoadingCategories] = useState(true)
  const [isLoadingExercises, setIsLoadingExercises] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tutorial, setTutorial] = useState<TutorialProgress>(EMPTY_TUTORIAL_PROGRESS)

  const tutorialStage = getTutorialStage(tutorial)

  const tutorialDescription =
    tutorialStage === 'completed'
      ? 'Ya superaste las cinco lecciones. Ahora puedes practicar con los ejercicios de cada categoría, o repasar el tutorial cuando quieras.'
      : tutorialStage === 'in-progress'
        ? `Vas ${tutorial.completedLessons} de ${tutorial.totalLessons} lecciones. Retoma donde lo dejaste: al terminar se desbloquean los ejercicios de ${SEQUENTIAL_CATEGORY_NAME}.`
        : `Cinco lecciones cortas que te enseñan a escribir un programa, pedir datos y mostrar resultados. Al terminar se desbloquean los ejercicios de ${SEQUENTIAL_CATEGORY_NAME}.`

  /**
   * Bloqueo secuencial, siguiendo el orden de las categorías (`orderIndex`):
   * tutorial → 1.ª categoría → 2.ª → 3.ª...
   * Cada una se abre solo cuando la anterior está abierta Y completada.
   */
  const lockByCategory = useMemo(() => {
    const locks: Record<number, CategoryLock | null> = {}

    categories.forEach((category, index) => {
      if (index === 0) {
        locks[category.id] = tutorial.isComplete ? null : { kind: 'tutorial' }
        return
      }

      const previous = categories[index - 1]
      const previousIsOpen = locks[previous.id] === null
      const previousIsDone = isCategoryComplete(exercisesByCategory[previous.id])

      locks[category.id] = previousIsOpen && previousIsDone ? null : { kind: 'previous', previous }
    })

    return locks
  }, [categories, exercisesByCategory, tutorial.isComplete])

  const selectedLock = selectedCategory ? (lockByCategory[selectedCategory.id] ?? null) : null
  const exercises = selectedCategory ? (exercisesByCategory[selectedCategory.id] ?? []) : []

  const fetchCategories = useCallback(async (): Promise<Category[]> => {
    const data = await getCategories()
    return [...data].sort((a, b) => a.orderIndex - b.orderIndex)
  }, [])

  const applyCategories = useCallback((ordered: Category[]): void => {
    // Se descarta la categoría del tutorial aquí y no en el render: así ni la lista de
    // categorías ni la selección por defecto pueden llegar a ofrecerlo, y no depende de
    // que un click se llegue a bloquear a tiempo.
    const browsable = ordered.filter((category) => !isTutorialCategory(category))

    setCategories(browsable)
    setSelectedCategory((previous) => previous ?? browsable[0] ?? null)
  }, [])

  useEffect(() => {
    let isActive = true

    fetchCategories()
      .then((ordered) => {
        if (!isActive) return
        applyCategories(ordered)
      })
      .catch((caught: unknown) => {
        if (isActive) setError(toCategoriesError(caught))
      })
      .finally(() => {
        if (isActive) setIsLoadingCategories(false)
      })

    return () => {
      isActive = false
    }
  }, [applyCategories, fetchCategories])

  useEffect(() => {
    // El tutorial es informativo: si falla, el panel sigue siendo utilizable.
    let isActive = true

    getTutorialProgress()
      .then((progress) => {
        if (isActive) setTutorial(progress)
      })
      .catch(() => {
        if (isActive) setTutorial(EMPTY_TUTORIAL_PROGRESS)
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    // Se piden los ejercicios de todas las categorías de una vez: para saber si una
    // categoría está desbloqueada hay que saber si la anterior está completa.
    if (categories.length === 0) return

    let isActive = true

    Promise.all(
      categories.map((category) =>
        getExercisesByCategory(category.id)
          .then((data) => ({ id: category.id, data, failure: null as unknown }))
          .catch((caught: unknown) => ({ id: category.id, data: null, failure: caught })),
      ),
    )
      .then((entries) => {
        if (!isActive) return

        const next: Record<number, Exercise[] | null> = {}
        let firstFailure: unknown = null
        for (const entry of entries) {
          next[entry.id] = entry.data
          if (entry.data === null && firstFailure === null) firstFailure = entry.failure ?? true
        }

        setExercisesByCategory(next)
        if (firstFailure !== null) setError(toExercisesError(firstFailure))
      })
      .finally(() => {
        if (isActive) setIsLoadingExercises(false)
      })

    return () => {
      isActive = false
    }
  }, [categories, reloadToken])

  function handleRetry() {
    setIsLoadingCategories(true)
    setIsLoadingExercises(true)
    setError(null)
    setReloadToken((previous) => previous + 1)

    fetchCategories()
      .then(applyCategories)
      .catch((caught: unknown) => setError(toCategoriesError(caught)))
      .finally(() => setIsLoadingCategories(false))
  }

  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

  /** Mientras no se sabe qué está completo, no se pintan candados para que no parpadeen. */
  const isResolvingCategories =
    isLoadingCategories || (categories.length > 0 && isLoadingExercises)

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white shadow-md shadow-accent/20">
              <Sparkles className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-ink">PS Academy</h1>
              <p className="text-xs text-muted">Panel de ejercicios</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin() ? (
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/20"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Administrar ejercicios</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-body transition hover:bg-inset hover:text-ink focus:outline-none focus:ring-4 focus:ring-line"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Tutorial: es la puerta de entrada, por eso va antes que las categorías. */}
        {tutorial.totalLessons > 0 ? (
          <section className="mb-8 overflow-hidden rounded-2xl border border-accent-line bg-gradient-to-br from-accent-soft via-surface to-surface p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-deep text-white shadow-md shadow-accent/25">
                  <GraduationCap className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-ink">
                    {TUTORIAL_COPY[tutorialStage].eyebrow}
                  </p>
                  <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-ink">
                    Tutorial guiado: de cero a tu primer programa
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-body">{tutorialDescription}</p>
                  <p className="mt-2 text-xs font-medium text-muted">
                    {tutorial.completedLessons} de {tutorial.totalLessons} lecciones superadas
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/tutorial')}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/20"
              >
                {TUTORIAL_COPY[tutorialStage].cta}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        ) : null}

        <div className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Categorías</h2>
          <p className="mt-1 text-sm text-muted">
            Completa cada categoría para desbloquear la siguiente.
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="mb-6 flex items-start gap-2.5 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p>{error}</p>
              <button
                type="button"
                onClick={handleRetry}
                className="mt-1 inline-flex min-h-11 items-center font-semibold text-danger underline underline-offset-2 hover:text-danger sm:min-h-0"
              >
                Reintentar
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
          {/* Categorías */}
          <section aria-label="Categorías">
            {isResolvingCategories ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-xl border border-line bg-surface"
                  />
                ))}
              </div>
            ) : categories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong bg-surface p-6 text-center sm:p-8">
                <BookOpen className="mx-auto h-8 w-8 text-faint" />
                <p className="mt-3 text-sm text-muted">Todavía no hay categorías disponibles.</p>
                {tutorial.totalLessons > 0 ? (
                  <button
                    type="button"
                    onClick={() => navigate('/tutorial')}
                    className="mt-3 inline-flex min-h-11 items-center font-semibold text-accent-ink underline underline-offset-2 hover:text-accent sm:min-h-0"
                  >
                    Ir al tutorial guiado
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {categories.map((category) => {
                  const isSelected = selectedCategory?.id === category.id
                  const lock = lockByCategory[category.id] ?? null
                  const isLocked = lock !== null

                  const categoryExercises = exercisesByCategory[category.id]
                  const total = categoryExercises ? categoryExercises.length : category.exerciseCount
                  const done = categoryExercises
                    ? categoryExercises.filter((item) => item.userStatus === 'completed').length
                    : 0
                  const isDone =
                    !isLocked && categoryExercises ? isCategoryComplete(categoryExercises) : false

                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      aria-pressed={isSelected}
                      className={`group rounded-xl border bg-surface p-4 text-left transition focus:outline-none focus:ring-4 ${
                        isSelected
                          ? 'border-accent ring-4 ring-accent/10'
                          : 'border-line hover:border-accent-line hover:shadow-md hover:shadow-line/60 focus:ring-line'
                      } ${isLocked ? 'opacity-70' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              isSelected && !isLocked
                                ? 'bg-accent text-white'
                                : 'bg-inset text-muted group-hover:bg-accent-soft group-hover:text-accent-ink'
                            }`}
                          >
                            {isLocked ? <Lock className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                          </span>
                          <span className="font-medium text-ink">{category.name}</span>
                        </div>
                        <ChevronRight
                          className={`mt-1 h-4 w-4 shrink-0 transition ${
                            isSelected ? 'text-accent-ink' : 'text-faint group-hover:text-accent-ink'
                          }`}
                        />
                      </div>

                      {category.description ? (
                        <p className="mt-2 line-clamp-2 text-sm text-muted">
                          {category.description}
                        </p>
                      ) : null}

                      {isLocked ? (
                        <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-faint">
                          <Lock className="h-3.5 w-3.5" />
                          {lock.kind === 'tutorial'
                            ? 'Requiere completar el tutorial'
                            : `Requiere completar ${lock.previous.name}`}
                        </p>
                      ) : typeof total === 'number' ? (
                        <p
                          className={`mt-3 inline-flex items-center gap-1.5 text-xs font-medium ${
                            isDone ? 'text-success' : 'text-faint'
                          }`}
                        >
                          {isDone ? <CircleCheckBig className="h-3.5 w-3.5" /> : null}
                          {categoryExercises
                            ? `${done} de ${total} ${total === 1 ? 'ejercicio' : 'ejercicios'}`
                            : `${total} ${total === 1 ? 'ejercicio' : 'ejercicios'}`}
                        </p>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* Ejercicios */}
          <section aria-label="Ejercicios">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
                {selectedCategory ? (
                  <>
                    <ListChecks className="h-5 w-5 text-accent-ink" />
                    {selectedCategory.name}
                  </>
                ) : (
                  'Ejercicios'
                )}
              </h3>

              {selectedCategory ? (
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition hover:bg-inset hover:text-ink focus:outline-none focus:ring-4 focus:ring-line sm:min-h-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Ver todas
                </button>
              ) : null}
            </div>

            {!selectedCategory && !isResolvingCategories ? (
              <div className="rounded-xl border border-dashed border-line-strong bg-surface p-6 text-center sm:p-10">
                <BookOpen className="mx-auto h-9 w-9 text-faint" />
                <p className="mt-3 text-sm font-medium text-body">Ningún filtro aplicado</p>
                <p className="mt-1 text-sm text-muted">
                  Selecciona una categoría para listar sus ejercicios.
                </p>
              </div>
            ) : isResolvingCategories ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface p-6 text-center text-sm text-muted sm:flex-row sm:p-10">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Cargando ejercicios...
              </div>
            ) : selectedCategory && selectedLock ? (
              <div className="rounded-xl border border-dashed border-accent-line bg-accent-soft p-6 text-center sm:p-10">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
                  <Lock className="h-5 w-5" />
                </span>

                {selectedLock.kind === 'tutorial' ? (
                  <>
                    <p className="mt-4 text-sm font-semibold text-ink">
                      Completa el tutorial para empezar
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-body">
                      Los ejercicios de {selectedCategory.name} se abren al completar las cinco
                      lecciones del tutorial. Te lleva unos 20 minutos y te explica todo lo que
                      necesitas saber.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate('/tutorial')}
                      className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/20"
                    >
                      {TUTORIAL_COPY[tutorialStage].cta}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-4 text-sm font-semibold text-ink">
                      {selectedCategory.name} todavía está bloqueada
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-body">
                      Para abrirla tienes que completar todos los ejercicios de{' '}
                      {selectedLock.previous.name}.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(selectedLock.previous)}
                      className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/20"
                    >
                      Ir a {selectedLock.previous.name}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            ) : exercises.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong bg-surface p-6 text-center sm:p-10">
                <p className="text-sm text-muted">
                  Esta categoría todavía no tiene ejercicios publicados.
                </p>
              </div>
            ) : (
              <ul className="grid gap-3">
                {exercises.map((exercise) => {
                  const difficulty = DIFFICULTY_STYLES[exercise.difficulty] ?? DIFFICULTY_STYLES.Easy
                  const completedLanguage = completedLanguageLabel(exercise.completedInLanguageSlug)
                  return (
                    <li key={exercise.id}>
                      <article className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 transition hover:border-accent-line hover:shadow-md hover:shadow-line/60 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-medium text-ink">{exercise.title}</h4>
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${difficulty.badge}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${DIFFICULTY_DOT[exercise.difficulty]}`} />
                              {difficulty.label}
                            </span>
                            {exercise.userStatus ? (
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[exercise.userStatus].badge}`}
                              >
                                {exercise.userStatus === 'completed' ? (
                                  <CircleCheckBig className="h-3.5 w-3.5" />
                                ) : (
                                  <CircleDashed className="h-3.5 w-3.5" />
                                )}
                                {STATUS_STYLES[exercise.userStatus].label}
                                {exercise.userStatus === 'completed' &&
                                completedLanguage ? (
                                  <>
                                    <span aria-hidden="true" className="opacity-60">
                                      ·
                                    </span>
                                    <span className="font-medium">{completedLanguage}</span>
                                  </>
                                ) : null}
                              </span>
                            ) : null}
                          </div>

                          {exercise.description ? (
                            <p className="mt-1.5 line-clamp-2 text-sm text-muted">
                              {exercise.description}
                            </p>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => navigate(`/workspace/${exercise.id}`)}
                          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/20 sm:min-h-0"
                        >
                          Resolver
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </article>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}