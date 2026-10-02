import { useCallback, useEffect, useState } from 'react'
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

/** Categoría que se abre al terminar el tutorial. */
const SEQUENTIAL_CATEGORY_NAME = 'Fundamentos'

const EMPTY_TUTORIAL_PROGRESS: TutorialProgress = {
  totalLessons: 0,
  completedLessons: 0,
  isComplete: false,
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
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loadedCategoryId, setLoadedCategoryId] = useState<number | null>(null)

  const [isLoadingCategories, setIsLoadingCategories] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tutorial, setTutorial] = useState<TutorialProgress>(EMPTY_TUTORIAL_PROGRESS)

  const isLoadingExercises =
    selectedCategory !== null && loadedCategoryId !== selectedCategory.id

  /** Secuenciales espera a que el alumno termine las cinco lecciones del tutorial. */
  const isSequentialLocked =
    selectedCategory !== null &&
    selectedCategory.name.trim().toLowerCase() === SEQUENTIAL_CATEGORY_NAME.toLowerCase() &&
    !tutorial.isComplete

  const fetchCategories = useCallback(async (): Promise<Category[]> => {
    const data = await getCategories()
    return [...data].sort((a, b) => a.orderIndex - b.orderIndex)
  }, [])

  const applyCategories = useCallback((ordered: Category[]): void => {
    setCategories(ordered)
    setSelectedCategory((previous) => previous ?? ordered[0] ?? null)
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
    if (!selectedCategory) return
    // Con Secuenciales bloqueado no hay nada que pedir: la vista muestra el
    // aviso del tutorial en lugar del listado.
    if (isSequentialLocked) return

    const categoryId = selectedCategory.id
    let isActive = true

    getExercisesByCategory(categoryId)
      .then((data) => {
        if (!isActive) return
        setExercises(data)
        setLoadedCategoryId(categoryId)
      })
      .catch((caught: unknown) => {
        if (!isActive) return
        setExercises([])
        setLoadedCategoryId(categoryId)
        setError(toExercisesError(caught))
      })

    return () => {
      isActive = false
    }
  }, [isSequentialLocked, selectedCategory])

  function handleRetryCategories() {
    setIsLoadingCategories(true)
    setError(null)

    fetchCategories()
      .then(applyCategories)
      .catch((caught: unknown) => setError(toCategoriesError(caught)))
      .finally(() => setIsLoadingCategories(false))
  }

  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

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
                    {tutorial.isComplete ? 'Tutorial completado' : 'Empieza por aquí'}
                  </p>
                  <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-ink">
                    Tutorial guiado: de cero a tu primer programa
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-body">
                    {tutorial.isComplete
                      ? 'Ya superaste las cinco lecciones. Ahora puedes practicar con los ejercicios de cada categoría.'
                      : 'Cinco lecciones cortas que te enseñan a escribir un programa, pedir datos y mostrar resultados. Al terminar se desbloquean los ejercicios de Secuenciales.'}
                  </p>
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
                {tutorial.isComplete ? 'Repasar el tutorial' : 'Comenzar el tutorial'}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        ) : null}

        <div className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Categorías</h2>
          <p className="mt-1 text-sm text-muted">
            Selecciona una categoría para ver sus ejercicios disponibles.
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
                onClick={handleRetryCategories}
                className="mt-1 inline-flex min-h-11 items-center font-semibold text-danger underline underline-offset-2 hover:text-danger sm:min-h-0"              >
                Reintentar
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
          {/* Categorías */}
          <section aria-label="Categorías">
            {isLoadingCategories ? (
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
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {categories.map((category) => {
                  const isSelected = selectedCategory?.id === category.id
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => {
                        // El tutorial tiene su propia página guiada: no es un listado.
                        if (category.name.trim().toLowerCase() === 'tutorial') {
                          navigate('/tutorial')
                          return
                        }
                        setSelectedCategory(category)
                      }}
                      aria-pressed={isSelected}
                      className={`group rounded-xl border bg-surface p-4 text-left transition focus:outline-none focus:ring-4 ${
                        isSelected
                          ? 'border-accent ring-4 ring-accent/10'
                          : 'border-line hover:border-accent-line hover:shadow-md hover:shadow-line/60 focus:ring-line'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              isSelected
                                ? 'bg-accent text-white'
                                : 'bg-inset text-muted group-hover:bg-accent-soft group-hover:text-accent-ink'
                            }`}
                          >
                            <Layers className="h-4 w-4" />
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

                      {typeof category.exerciseCount === 'number' ? (
                        <p className="mt-3 text-xs font-medium text-faint">
                          {category.exerciseCount}{' '}
                          {category.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
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

            {!selectedCategory && !isLoadingExercises ? (
              <div className="rounded-xl border border-dashed border-line-strong bg-surface p-6 text-center sm:p-10">
                <BookOpen className="mx-auto h-9 w-9 text-faint" />
                <p className="mt-3 text-sm font-medium text-body">Ningún filtro aplicado</p>
                <p className="mt-1 text-sm text-muted">
                  Selecciona una categoría para listar sus ejercicios.
                </p>
              </div>
            ) : isSequentialLocked ? (
              <div className="rounded-xl border border-dashed border-accent-line bg-accent-soft p-6 text-center sm:p-10">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
                  <Lock className="h-5 w-5" />
                </span>
                <p className="mt-4 text-sm font-semibold text-ink">
                  Completa el tutorial para empezar
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm text-body">
                  Los ejercicios de {SEQUENTIAL_CATEGORY_NAME} se abren al terminar las cinco
                  lecciones del tutorial. Te lleva unos 20 minutos y te explica todo lo que
                  necesitas saber.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/tutorial')}
                  className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/20"
                >
                  Ir al tutorial
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : isLoadingExercises ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface p-6 text-center text-sm text-muted sm:flex-row sm:p-10">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Cargando ejercicios...
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