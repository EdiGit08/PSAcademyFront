import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CircleCheckBig,
  Code,
  Languages,
  Layers,
  ListChecks,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash,
  TriangleAlert,
  X,
} from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import type {
  AdminCategory,
  AdminExercise,
  Difficulty,
  InputValueType,
  Language,
  UpsertCategoryRequest,
  UpsertExerciseRequest,
  UpsertInput,
  UpsertTemplate,
} from '../types'
import {
  createCategory,
  createExercise,
  deleteCategory,
  deleteExercise,
  extractErrorMessage,
  getAdminCategories,
  getAdminExercise,
  getAdminExercises,
  getLanguages,
  getUser,
  updateCategory,
  updateExercise,
} from '../services/api'

const DIFFICULTY_STYLES: Record<Difficulty, { label: string; badge: string }> = {
  Easy: { label: 'Fácil', badge: 'bg-success-soft text-success ring-success-line' },
  Medium: { label: 'Medio', badge: 'bg-warning-soft text-warning ring-warning-line' },
  Hard: { label: 'Difícil', badge: 'bg-danger-soft text-danger ring-danger-line' },
}

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']

const TITLE_MIN = 3
const TITLE_MAX = 200
const INPUT_VALUE_MAX = 500

interface ExerciseFormState {
  categoryId: string
  title: string
  description: string
  difficulty: Difficulty
  expectedOutput: string
  isActive: boolean
  templates: UpsertTemplate[]
  inputs: UpsertInput[]
  /** Plantillas de lenguajes dados de baja que se perderán al guardar. */
  droppedLanguages: string[]
}

const EMPTY_FORM: ExerciseFormState = {
  categoryId: '',
  title: '',
  description: '',
  difficulty: 'Easy',
  expectedOutput: '',
  isActive: true,
  templates: [],
  inputs: [],
  droppedLanguages: [],
}

const INPUT_TYPE_LABELS: Record<InputValueType, string> = {
  Number: 'Número',
  Text: 'Texto',
}

// El backend valida los valores numéricos con double.TryParse(NumberStyles.Float,
// InvariantCulture): admite signo, decimales y exponente, pero no separadores de
// millar ni notaciones hexadecimales. replicamos esa regla para evitar un 400.
const INVARIANT_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
const LINE_BREAK_PATTERN = /[\r\n]/

function toFormState(exercise: AdminExercise, languages: Language[]): ExerciseFormState {
  // El formulario solo ofrece los lenguajes del catálogo activo (Java, Python, PSeint).
  // Las plantillas de lenguajes dados de baja se anotan aparte para avisar de que el
  // PUT (que reemplaza la colección completa) va a eliminarlas.
  const knownIds = new Set(languages.map((language) => language.id))
  const droppedLanguages = (exercise.templates ?? [])
    .filter((template) => !knownIds.has(template.languageId))
    .map((template) => template.languageName)

  const templates: UpsertTemplate[] = languages.map((language) => {
    const existing = exercise.templates?.find((template) => template.languageId === language.id)
    return {
      languageId: language.id,
      starterCode: existing?.starterCode ?? '',
    }
  })

  const inputs: UpsertInput[] = [...(exercise.inputs ?? [])]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((input) => ({ value: input.value, valueType: input.valueType }))

  return {
    categoryId: String(exercise.categoryId),
    title: exercise.title,
    description: exercise.description,
    difficulty: exercise.difficulty,
    expectedOutput: exercise.expectedOutput,
    isActive: exercise.isActive,
    templates,
    inputs,
    droppedLanguages,
  }
}

export default function Admin() {
  const navigate = useNavigate()
  const currentUser = getUser()

  const [exercises, setExercises] = useState<AdminExercise[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [languagesFallback, setLanguagesFallback] = useState(false)

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'exercises' | 'categories'>('exercises')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const [editing, setEditing] = useState<AdminExercise | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [form, setForm] = useState<ExerciseFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<AdminExercise | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [editingCategory, setEditingCategory] = useState<AdminCategory | null>(null)
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false)
  const [categoryForm, setCategoryForm] = useState<UpsertCategoryRequest>({
    name: '',
    description: null,
    orderIndex: 0,
  })
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null)
  const [isSavingCategory, setIsSavingCategory] = useState(false)

  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<AdminCategory | null>(null)
  const [isDeletingCategory, setIsDeletingCategory] = useState(false)

  const fetchExercises = useCallback(async (): Promise<AdminExercise[]> => {
    return getAdminExercises()
  }, [])

  const fetchCategories = useCallback(async (): Promise<AdminCategory[]> => {
    const data = await getAdminCategories()
    return [...data].sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name))
  }, [])

  const loadDashboard = useCallback(async () => {
    const [loadedExercises, loadedCategories, loadedLanguages] = await Promise.all([
      fetchExercises(),
      fetchCategories(),
      // Solo los activos: el catálogo quedó en Java, Python y PSeint. Pedir los
      // inactivos metería en el formulario lenguajes que ya no se pueden ejecutar.
      getLanguages().catch(() => null),
    ])

    let resolvedLanguages: Language[]
    let usedFallback = false

    if (loadedLanguages && loadedLanguages.length > 0) {
      resolvedLanguages = [...loadedLanguages].sort((a, b) => a.name.localeCompare(b.name))
    } else {
      // Red de seguridad: si `GET /languages` no responde, los deducimos de las
      // plantillas que ya existen. Es un subconjunto, así que el admin no podrá
      // añadir código inicial a un lenguaje que aún no tenga ninguna plantilla.
      const derived = new Map<number, Language>()
      for (const exercise of loadedExercises) {
        for (const template of exercise.templates ?? []) {
          if (derived.has(template.languageId)) continue
          derived.set(template.languageId, {
            id: template.languageId,
            name: template.languageName,
            slug: template.languageSlug,
            isActive: true,
          })
        }
      }
      resolvedLanguages = [...derived.values()].sort((a, b) => a.name.localeCompare(b.name))
      usedFallback = true
    }

    return {
      exercises: loadedExercises,
      categories: loadedCategories,
      languages: resolvedLanguages,
      usedFallback,
    }
  }, [fetchCategories, fetchExercises])

  const applyDashboard = useCallback(
    (data: {
      exercises: AdminExercise[]
      categories: AdminCategory[]
      languages: Language[]
      usedFallback: boolean
    }) => {
      setExercises(data.exercises)
      setCategories(data.categories)
      setLanguages(data.languages)
      setLanguagesFallback(data.usedFallback)
    },
    [],
  )

  useEffect(() => {
    let isActive = true

    loadDashboard()
      .then((data) => {
        if (!isActive) return
        applyDashboard(data)
      })
      .catch((caught: unknown) => {
        if (isActive) setLoadError(extractErrorMessage(caught, 'No se pudo cargar el panel.'))
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [applyDashboard, loadDashboard])

  const visibleExercises = useMemo(() => {
    const term = search.trim().toLowerCase()

    return exercises.filter((exercise) => {
      const matchesCategory =
        categoryFilter === 'all' || String(exercise.categoryId) === categoryFilter
      const matchesSearch =
        term.length === 0 ||
        exercise.title.toLowerCase().includes(term) ||
        (exercise.description ?? '').toLowerCase().includes(term)
      return matchesCategory && matchesSearch
    })
  }, [exercises, search, categoryFilter])

  const activeCount = useMemo(
    () => exercises.filter((exercise) => exercise.isActive).length,
    [exercises],
  )

  /** Ejercicios por categoría (incluye los dados de baja, que es la vista admin). */
  const exerciseCountByCategory = useMemo(() => {
    const counts = new Map<number, number>()
    for (const exercise of exercises) {
      counts.set(exercise.categoryId, (counts.get(exercise.categoryId) ?? 0) + 1)
    }
    return counts
  }, [exercises])

  // ------------------------------------------------------------- Formulario

  function openCreateForm() {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      categoryId: categories.length > 0 ? String(categories[0].id) : '',
      templates: languages.map((language) => ({ languageId: language.id, starterCode: '' })),
    })
    setFormError(null)
    setIsFormOpen(true)
  }

  function openEditForm(exercise: AdminExercise) {
    setEditing(exercise)
    setForm(toFormState(exercise, languages))
    setFormError(null)
    setIsFormOpen(true)

    // El listado se carga una sola vez; reconsultamos el detalle para no editar
    // una copia obsoleta si otro admin cambió el ejercicio mientras tanto.
    void getAdminExercise(exercise.id)
      .then((fresh) => {
        setEditing(fresh)
        setForm((previous) => ({
          ...toFormState(fresh, languages),
          // No pisamos lo que el admin ya está escribiendo en otros campos.
          templates:
            previous.title || previous.description || previous.expectedOutput
              ? previous.templates
              : toFormState(fresh, languages).templates,
          inputs:
            previous.title || previous.description || previous.expectedOutput
              ? previous.inputs
              : toFormState(fresh, languages).inputs,
        }))
      })
      .catch(() => {
        /* Si el detalle falla seguimos con la copia del listado. */
      })
  }

  function closeForm() {
    if (isSaving) return
    setIsFormOpen(false)
    setEditing(null)
    setFormError(null)
  }

  function updateForm<K extends keyof ExerciseFormState>(key: K, value: ExerciseFormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function updateTemplate(languageId: number, starterCode: string) {
    setForm((previous) => ({
      ...previous,
      templates: previous.templates.map((template) =>
        template.languageId === languageId ? { ...template, starterCode } : template,
      ),
    }))
  }

  function addInput() {
    setForm((previous) => ({
      ...previous,
      inputs: [...previous.inputs, { value: '', valueType: 'Number' }],
    }))
  }

  function updateInput(index: number, patch: Partial<UpsertInput>) {
    setForm((previous) => ({
      ...previous,
      inputs: previous.inputs.map((input, position) =>
        position === index ? { ...input, ...patch } : input,
      ),
    }))
  }

  function removeInput(index: number) {
    setForm((previous) => ({
      ...previous,
      inputs: previous.inputs.filter((_, position) => position !== index),
    }))
  }

  function moveInput(index: number, direction: -1 | 1) {
    setForm((previous) => {
      const target = index + direction
      if (target < 0 || target >= previous.inputs.length) return previous
      const next = [...previous.inputs]
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...previous, inputs: next }
    })
  }

  function validate(): string | null {
    if (!form.categoryId) return 'Selecciona una categoría.'
    if (form.title.trim().length < TITLE_MIN) {
      return `El título debe tener al menos ${TITLE_MIN} caracteres.`
    }
    if (form.title.trim().length > TITLE_MAX) {
      return `El título no puede superar los ${TITLE_MAX} caracteres.`
    }
    if (!form.description.trim()) return 'La descripción (enunciado) es obligatoria.'
    if (!form.expectedOutput.trim()) return 'La salida esperada es obligatoria.'

    const selected = form.templates.filter((template) => template.starterCode.trim().length > 0)
    if (selected.length === 0) return 'Agrega al menos una plantilla de código inicial.'

    for (let index = 0; index < form.inputs.length; index += 1) {
      const input = form.inputs[index]
      const value = input.value.trim()

      if (!value) return `El valor del leer #${index + 1} no puede estar vacío.`
      if (value.length > INPUT_VALUE_MAX) {
        return `El valor del leer #${index + 1} no puede superar los ${INPUT_VALUE_MAX} caracteres.`
      }
      // Cada valor ocupa exactamente una línea de entrada estándar: un salto de línea
      // desplazaría los valores siguientes al consumir el alumno.
      if (LINE_BREAK_PATTERN.test(input.value)) {
        return `El valor del leer #${index + 1} no puede contener saltos de línea.`
      }
      if (input.valueType === 'Number' && !INVARIANT_NUMBER_PATTERN.test(value)) {
        return `El valor del leer #${index + 1} debe ser numérico (usa punto decimal).`
      }
    }

    return null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return

    const validationError = validate()
    if (validationError) {
      setFormError(validationError)
      return
    }

    const payload: UpsertExerciseRequest = {
      categoryId: Number(form.categoryId),
      title: form.title.trim(),
      description: form.description,
      difficulty: form.difficulty,
      expectedOutput: form.expectedOutput,
      isActive: form.isActive,
      // El PUT reemplaza la colección completa: solo se envían las plantillas con código.
      templates: form.templates
        .filter((template) => template.starterCode.trim().length > 0)
        .map((template) => ({ languageId: template.languageId, starterCode: template.starterCode })),
      // Los valores del leer se reemplazan completos y en el orden mostrado.
      inputs: form.inputs.map((input) => ({
        value: input.value.trim(),
        valueType: input.valueType,
      })),
    }

    setIsSaving(true)
    setFormError(null)

    try {
      if (editing) {
        await updateExercise(editing.id, payload)
        setNotice(`Ejercicio "${payload.title}" actualizado.`)
      } else {
        await createExercise(payload)
        setNotice(`Ejercicio "${payload.title}" creado correctamente.`)
      }

      const refreshed = await fetchExercises()
      setExercises(refreshed)
      setIsFormOpen(false)
      setEditing(null)
    } catch (caught) {
      setFormError(extractErrorMessage(caught, 'No se pudo guardar el ejercicio.'))
    } finally {
      setIsSaving(false)
    }
  }

  // ---------------------------------------------------------------- Borrado

  async function handleConfirmDelete() {
    if (!deleteTarget || isDeleting) return

    setIsDeleting(true)
    try {
      await deleteExercise(deleteTarget.id)
      setNotice(`"${deleteTarget.title}" se dio de baja (ya no es visible para los alumnos).`)
      setDeleteTarget(null)
      setExercises(await fetchExercises())
    } catch (caught) {
      setNotice(null)
      setLoadError(extractErrorMessage(caught, 'No se pudo eliminar el ejercicio.'))
      setDeleteTarget(null)
    } finally {
      setIsDeleting(false)
    }
  }

  // ------------------------------------------------------ Categorías: CRUD

  function openCreateCategoryForm() {
    setEditingCategory(null)
    const nextOrderIndex =
      categories.length > 0 ? Math.max(...categories.map((item) => item.orderIndex)) + 1 : 0
    setCategoryForm({ name: '', description: null, orderIndex: nextOrderIndex })
    setCategoryFormError(null)
    setIsCategoryFormOpen(true)
  }

  function openEditCategoryForm(category: AdminCategory) {
    setEditingCategory(category)
    setCategoryForm({
      name: category.name,
      description: category.description,
      orderIndex: category.orderIndex,
    })
    setCategoryFormError(null)
    setIsCategoryFormOpen(true)
  }

  function closeCategoryForm() {
    if (isSavingCategory) return
    setIsCategoryFormOpen(false)
    setEditingCategory(null)
    setCategoryFormError(null)
  }

  async function handleSubmitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSavingCategory) return

    const name = categoryForm.name.trim()
    if (name.length < 2) {
      setCategoryFormError('El nombre debe tener al menos 2 caracteres.')
      return
    }
    if (name.length > 120) {
      setCategoryFormError('El nombre no puede superar los 120 caracteres.')
      return
    }
    if (categoryForm.orderIndex < 0 || categoryForm.orderIndex > 10000) {
      setCategoryFormError('El orden debe estar entre 0 y 10000.')
      return
    }

    const payload: UpsertCategoryRequest = {
      name,
      description: categoryForm.description?.trim() ? categoryForm.description.trim() : null,
      orderIndex: categoryForm.orderIndex,
    }

    setIsSavingCategory(true)
    setCategoryFormError(null)

    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, payload)
        setNotice(`Categoría "${payload.name}" actualizada.`)
      } else {
        await createCategory(payload)
        setNotice(`Categoría "${payload.name}" creada.`)
      }

      const [refreshedCategories] = await Promise.all([fetchCategories(), fetchExercises()])
      setCategories(refreshedCategories)
      setIsCategoryFormOpen(false)
      setEditingCategory(null)
    } catch (caught) {
      setCategoryFormError(extractErrorMessage(caught, 'No se pudo guardar la categoría.'))
    } finally {
      setIsSavingCategory(false)
    }
  }

  async function handleConfirmDeleteCategory() {
    if (!deleteCategoryTarget || isDeletingCategory) return

    setIsDeletingCategory(true)
    try {
      await deleteCategory(deleteCategoryTarget.id)
      setNotice(`Categoría "${deleteCategoryTarget.name}" eliminada.`)
      setDeleteCategoryTarget(null)
      setCategories(await fetchCategories())
    } catch (caught) {
      setLoadError(extractErrorMessage(caught, 'No se pudo eliminar la categoría.'))
      setDeleteCategoryTarget(null)
    } finally {
      setIsDeletingCategory(false)
    }
  }

  // ----------------------------------------------------------------- Render

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white shadow-md">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-ink">
                Administración de ejercicios
              </h1>
              <p className="text-xs text-muted">
                {currentUser?.email ?? 'Sesión admin'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white sm:inline-flex">
              <Shield className="h-3.5 w-3.5" />
              Admin
            </span>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-body transition hover:bg-inset hover:text-ink focus:outline-none focus:ring-4 focus:ring-line"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Pestañas */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-xl bg-recess/70 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('exercises')}
              aria-pressed={activeTab === 'exercises'}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === 'exercises'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-body hover:text-ink'
              }`}
            >
              <ListChecks className="h-4 w-4" />
              Ejercicios
              <span className="rounded-full bg-surface/70 px-1.5 py-0.5 text-[11px] font-semibold">
                {exercises.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              aria-pressed={activeTab === 'categories'}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === 'categories'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-body hover:text-ink'
              }`}
            >
              <Layers className="h-4 w-4" />
              Categorías
              <span className="rounded-full bg-surface/70 px-1.5 py-0.5 text-[11px] font-semibold">
                {categories.length}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={activeTab === 'exercises' ? openCreateForm : openCreateCategoryForm}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/20"
          >
            <Plus className="h-4 w-4" />
            {activeTab === 'exercises' ? 'Nuevo ejercicio' : 'Nueva categoría'}
          </button>
        </div>

        {activeTab === 'categories' ? (
          <section aria-label="Gestión de categorías" className="mt-6">
            {categories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
                <Layers className="mx-auto h-9 w-9 text-faint" />
                <p className="mt-3 text-sm font-medium text-body">No hay categorías</p>
                <p className="mt-1 text-sm text-muted">
                  Crea la primera para poder publicar ejercicios.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-2xl text-left text-sm">
                    <thead className="border-b border-line bg-canvas text-xs uppercase tracking-wider text-muted">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Orden</th>
                        <th className="px-4 py-3 font-semibold">Nombre</th>
                        <th className="px-4 py-3 font-semibold">Descripción</th>
                        <th className="px-4 py-3 font-semibold">Ejercicios</th>
                        <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {categories.map((category) => (
                        <tr key={category.id} className="transition hover:bg-inset">
                          <td className="px-4 py-3 font-mono text-xs text-muted">
                            {category.orderIndex}
                          </td>
                          <td className="px-4 py-3 font-medium text-ink">{category.name}</td>
                          <td className="max-w-sm px-4 py-3 text-body">
                            <p className="line-clamp-2">{category.description || '—'}</p>
                          </td>
                          <td className="px-4 py-3 text-body">
                            {exerciseCountByCategory.get(category.id) ?? 0}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditCategoryForm(category)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-body transition hover:bg-inset focus:outline-none focus:ring-4 focus:ring-line"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteCategoryTarget(category)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-danger-line px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger-soft focus:outline-none focus:ring-4 focus:ring-danger-line"
                              >
                                <Trash className="h-3.5 w-3.5" />
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {activeTab === 'exercises' ? (
          <>
        <div className="sr-only">
          {exercises.length} ejercicios en total · {activeCount} visibles para los alumnos
        </div>

        {notice ? (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-success-line bg-success-soft px-4 py-3 text-sm text-success">
            <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="rounded p-0.5 text-success transition hover:bg-success-soft"
              aria-label="Cerrar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {loadError ? (
          <div
            role="alert"
            className="mt-6 flex items-start gap-2.5 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{loadError}</span>
          </div>
        ) : null}

        {languagesFallback ? (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No se pudo consultar <code className="font-mono">GET /api/languages</code>. Los
              lenguajes disponibles se deducen de las plantillas de los ejercicios existentes, por lo
              que solo podrás añadir código inicial a esos mismos lenguajes.
            </span>
          </div>
        ) : null}

        {/* Filtros */}
        <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título o enunciado..."
              className="w-full rounded-xl border border-line-strong bg-surface py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent/10"
            />
          </div>

          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="w-full appearance-none rounded-xl border border-line-strong bg-surface py-2.5 pl-3 pr-9 text-sm shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
            >
              <option value="all">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          </div>
        </div>

        {/* Listado */}
        {isLoading ? (
          <div className="mt-6 flex items-center justify-center gap-3 rounded-xl border border-line bg-surface py-16 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Cargando ejercicios...
          </div>
        ) : categories.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
            <Layers className="mx-auto h-9 w-9 text-faint" />
            <p className="mt-3 text-sm font-medium text-body">No hay categorías</p>
            <p className="mt-1 text-sm text-muted">
              Crea primero una categoría en el backend: cada ejercicio debe pertenecer a una.
            </p>
          </div>
        ) : visibleExercises.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
            <ListChecks className="mx-auto h-9 w-9 text-faint" />
            <p className="mt-3 text-sm font-medium text-body">
              {exercises.length === 0 ? 'Aún no hay ejercicios' : 'Sin resultados'}
            </p>
            <p className="mt-1 text-sm text-muted">
              {exercises.length === 0
                ? 'Crea el primero con el botón "Nuevo ejercicio".'
                : 'Prueba con otra búsqueda o categoría.'}
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-3xl text-left text-sm">
                <thead className="border-b border-line bg-canvas text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Título</th>
                    <th className="px-4 py-3 font-semibold">Categoría</th>
                    <th className="px-4 py-3 font-semibold">Dificultad</th>
                    <th className="px-4 py-3 font-semibold">Lenguajes</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visibleExercises.map((exercise) => {
                    const difficulty = DIFFICULTY_STYLES[exercise.difficulty] ?? DIFFICULTY_STYLES.Easy
                    return (
                      <tr key={exercise.id} className="transition hover:bg-inset">
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">{exercise.title}</p>
                          <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-muted">
                            {exercise.description || 'Sin enunciado'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-body">{exercise.categoryName}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${difficulty.badge}`}
                          >
                            {difficulty.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(exercise.templates ?? []).length === 0 ? (
                              <span className="text-xs text-faint">—</span>
                            ) : (
                              exercise.templates.map((template) => (
                                <span
                                  key={template.id}
                                  className="inline-flex items-center gap-1 rounded-md bg-inset px-1.5 py-0.5 font-mono text-[11px] text-body"
                                >
                                  <Code className="h-3 w-3" />
                                  {template.languageName}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {exercise.isActive ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                              <span className="h-1.5 w-1.5 rounded-full bg-success-solid" />
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-faint">
                              <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
                              Inactivo
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditForm(exercise)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-medium text-body transition hover:bg-inset focus:outline-none focus:ring-4 focus:ring-line"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(exercise)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-danger-line px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger-soft focus:outline-none focus:ring-4 focus:ring-danger-line"
                            >
                              <Trash className="h-3.5 w-3.5" />
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
          </>
        ) : null}
      </main>

      {/* Modal: crear / editar */}
      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-backdrop p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-3xl rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
                <Pencil className="h-5 w-5 text-faint" />
                {editing ? `Editar: ${editing.title}` : 'Nuevo ejercicio'}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-1.5 text-faint transition hover:bg-inset hover:text-body"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
                {formError ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
                  >
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                ) : null}

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="categoryId" className="block text-sm font-medium text-body">
                      Categoría <span className="text-danger">*</span>
                    </label>
                    <div className="relative mt-1.5">
                      <select
                        id="categoryId"
                        value={form.categoryId}
                        onChange={(event) => updateForm('categoryId', event.target.value)}
                        className="w-full appearance-none rounded-xl border border-line-strong bg-surface py-2.5 pl-3 pr-9 text-sm shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                      >
                        <option value="">Selecciona una categoría</option>
                        {categories.map((category) => (
                          <option key={category.id} value={String(category.id)}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="difficulty" className="block text-sm font-medium text-body">
                      Dificultad <span className="text-danger">*</span>
                    </label>
                    <div className="relative mt-1.5">
                      <select
                        id="difficulty"
                        value={form.difficulty}
                        onChange={(event) =>
                          updateForm('difficulty', event.target.value as Difficulty)
                        }
                        className="w-full appearance-none rounded-xl border border-line-strong bg-surface py-2.5 pl-3 pr-9 text-sm shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                      >
                        {DIFFICULTIES.map((difficulty) => (
                          <option key={difficulty} value={difficulty}>
                            {DIFFICULTY_STYLES[difficulty].label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-body">
                    Título <span className="text-danger">*</span>
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={form.title}
                    onChange={(event) => updateForm('title', event.target.value)}
                    maxLength={TITLE_MAX}
                    placeholder="Suma de dos números"
                    className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent/10"
                  />
                  <p className="mt-1 text-xs text-faint">
                    {form.title.trim().length}/{TITLE_MAX} caracteres
                  </p>
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-body">
                    Enunciado <span className="text-danger">*</span>
                  </label>
                  <textarea
                    id="description"
                    rows={5}
                    value={form.description}
                    onChange={(event) => updateForm('description', event.target.value)}
                    placeholder={'## Qué hacer\nLee dos números e imprime su suma.'}
                    className="mt-1.5 w-full resize-y rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent/10"
                  />
                  <p className="mt-1 text-xs text-faint">
                    Admite saltos de línea; se muestra tal cual en el enunciado del workspace.
                  </p>
                </div>

                <div>
                  <label htmlFor="expectedOutput" className="block text-sm font-medium text-body">
                    Salida esperada <span className="text-danger">*</span>
                  </label>
                  <textarea
                    id="expectedOutput"
                    rows={3}
                    value={form.expectedOutput}
                    onChange={(event) => updateForm('expectedOutput', event.target.value)}
                    placeholder={'7'}
                    className="mt-1.5 w-full resize-y rounded-xl border border-line-strong bg-code px-3 py-2.5 font-mono text-[13px] text-code-ink shadow-sm outline-none transition placeholder:text-code-ink/40 focus:border-accent focus:ring-4 focus:ring-accent/20"
                  />
                </div>

                <fieldset className="rounded-xl border border-line p-4">
                  <legend className="flex items-center gap-1.5 px-1 text-sm font-medium text-body">
                    <Languages className="h-4 w-4 text-faint" />
                    Plantillas de código inicial
                  </legend>

                  {languages.length === 0 ? (
                    <p className="text-sm text-muted">
                      No hay lenguajes disponibles. Crea un ejercicio con una plantilla existente o
                      expón <code className="font-mono">GET /api/languages</code> en el backend.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {languages.map((language) => {
                        const template = form.templates.find(
                          (item) => item.languageId === language.id,
                        )
                        return (
                          <div key={language.id}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-2 font-mono text-xs font-semibold text-body">
                                <Code className="h-3.5 w-3.5 text-faint" />
                                {language.name}
                                <span className="font-sans font-normal text-faint">
                                  ({language.slug})
                                </span>
                              </span>
                              {template?.starterCode.trim() ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                                  <CircleCheckBig className="h-3 w-3" />
                                  Incluida
                                </span>
                              ) : (
                                <span className="text-[11px] text-faint">Opcional</span>
                              )}
                            </div>
                            <textarea
                              rows={4}
                              value={template?.starterCode ?? ''}
                              onChange={(event) => updateTemplate(language.id, event.target.value)}
                              placeholder="Déjalo vacío si este lenguaje no aplica al ejercicio"
                              spellCheck={false}
                              className="mt-1.5 w-full resize-y rounded-lg border border-line-strong bg-code px-3 py-2 font-mono text-[13px] text-code-ink outline-none transition placeholder:text-code-ink/40 focus:border-accent focus:ring-2 focus:ring-accent/20"
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {form.droppedLanguages.length > 0 ? (
                    <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[11px] text-warning">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Al guardar se eliminarán las plantillas de{' '}
                        <span className="font-semibold">{form.droppedLanguages.join(', ')}</span>: ese
                        lenguaje está dado de baja y ya no se puede ejecutar.
                      </span>
                    </p>
                  ) : null}

                  <p className="mt-3 text-xs text-faint">
                    Solo se envían las plantillas con código: al editar, el backend reemplaza la
                    colección completa.
                  </p>
                </fieldset>

                <fieldset className="rounded-xl border border-line p-4">
                  <legend className="flex items-center gap-1.5 px-1 text-sm font-medium text-body">
                    <ListChecks className="h-4 w-4 text-faint" />
                    Valores del leer
                  </legend>

                  {form.inputs.length === 0 ? (
                    <p className="text-sm text-muted">
                      Sin valores de entrada. Agrégalos si el ejercicio usa{' '}
                      <code className="font-mono">Leer</code>.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {form.inputs.map((input, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-inset font-mono text-xs font-semibold text-muted">
                            {index + 1}
                          </span>
                          <input
                            value={input.value}
                            onChange={(event) => updateInput(index, { value: event.target.value })}
                            placeholder={input.valueType === 'Number' ? '10' : 'Hola'}
                            maxLength={INPUT_VALUE_MAX}
                            aria-label={`Valor del leer #${index + 1}`}
                            className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
                          />
                          <select
                            value={input.valueType}
                            onChange={(event) =>
                              updateInput(index, { valueType: event.target.value as InputValueType })
                            }
                            className="shrink-0 rounded-lg border border-line-strong bg-surface px-2 py-2 text-sm font-medium shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                          >
                            <option value="Number">{INPUT_TYPE_LABELS.Number}</option>
                            <option value="Text">{INPUT_TYPE_LABELS.Text}</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => moveInput(index, -1)}
                            disabled={index === 0}
                            className="rounded-lg border border-line-strong p-2 text-muted transition hover:bg-inset disabled:opacity-40"
                            aria-label="Subir"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveInput(index, 1)}
                            disabled={index === form.inputs.length - 1}
                            className="rounded-lg border border-line-strong p-2 text-muted transition hover:bg-inset disabled:opacity-40"
                            aria-label="Bajar"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeInput(index)}
                            className="rounded-lg border border-line-strong p-2 text-danger transition hover:bg-danger-soft"
                            aria-label="Eliminar"
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={addInput}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-body transition hover:bg-inset"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar valor
                  </button>

                  <p className="mt-3 text-xs text-faint">
                    Se entregan al programa por entrada estándar, en este orden. Los de tipo número
                    se leen como enteros o decimales según el <code className="font-mono">Leer</code>.
                  </p>
                </fieldset>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) => updateForm('isActive', event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-line-strong text-accent-ink focus:ring-accent/25"
                  />
                  <span>
                    <span className="block text-sm font-medium text-body">
                      Visible para los alumnos
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Al desmarcarlo el ejercicio deja de aparecer en el dashboard (baja lógica).
                    </span>
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={isSaving}
                  className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-body transition hover:bg-inset disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <CircleCheckBig className="h-4 w-4" />
                      {editing ? 'Guardar cambios' : 'Crear ejercicio'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Modal: confirmar borrado */}
      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                <Trash className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">Eliminar ejercicio</h3>
                <p className="mt-1.5 text-sm text-body">
                  ¿Seguro que quieres dar de baja{' '}
                  <span className="font-medium text-ink">{deleteTarget.title}</span>?
                </p>
              </div>
            </div>

            <p className="mt-4 rounded-lg bg-canvas px-3 py-2.5 text-xs text-body">
              El backend hace una <strong>baja lógica</strong>: el ejercicio deja de mostrarse a los
              alumnos pero se conserva en la base de datos junto con el progreso de quienes ya lo
              resolvieron. Puedes reactivarlo editándolo.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-body transition hover:bg-inset disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 rounded-lg bg-danger-solid px-4 py-2 text-sm font-semibold text-white transition hover:bg-danger-solid-hover focus:outline-none focus:ring-4 focus:ring-danger-line/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash className="h-4 w-4" />}
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal: crear / editar categoría */}
      {isCategoryFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-backdrop p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
                <Layers className="h-5 w-5 text-faint" />
                {editingCategory ? `Editar: ${editingCategory.name}` : 'Nueva categoría'}
              </h3>
              <button
                type="button"
                onClick={closeCategoryForm}
                className="rounded-lg p-1.5 text-faint transition hover:bg-inset hover:text-body focus:outline-none focus:ring-4 focus:ring-line"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitCategory} className="space-y-4 px-6 py-5">
              <div>
                <label
                  htmlFor="category-name"
                  className="block text-sm font-medium text-body"
                >
                  Nombre
                </label>
                <input
                  id="category-name"
                  type="text"
                  value={categoryForm.name}
                  onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))}
                  maxLength={120}
                  autoFocus
                  placeholder="Ej. Algoritmos básicos"
                  className="mt-1.5 w-full rounded-lg border border-line-strong px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
                />
                <p className="mt-1 text-xs text-muted">
                  Entre 2 y 120 caracteres. Se muestra en el filtro del dashboard.
                </p>
              </div>

              <div>
                <label
                  htmlFor="category-description"
                  className="block text-sm font-medium text-body"
                >
                  Descripción <span className="font-normal text-faint">(opcional)</span>
                </label>
                <textarea
                  id="category-description"
                  rows={3}
                  value={categoryForm.description ?? ''}
                  onChange={(event) =>
                    setCategoryForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  maxLength={500}
                  placeholder="Breve resumen del contenido de la categoría"
                  className="mt-1.5 w-full resize-y rounded-lg border border-line-strong px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
                />
              </div>

              <div>
                <label
                  htmlFor="category-order"
                  className="block text-sm font-medium text-body"
                >
                  Orden
                </label>
                <input
                  id="category-order"
                  type="number"
                  min={0}
                  max={10000}
                  value={categoryForm.orderIndex}
                  onChange={(event) =>
                    setCategoryForm((prev) => ({
                      ...prev,
                      orderIndex: Number(event.target.value),
                    }))
                  }
                  className="mt-1.5 w-32 rounded-lg border border-line-strong px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
                />
                <p className="mt-1 text-xs text-muted">Menor número, aparece antes.</p>
              </div>

              {categoryFormError ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5 text-sm text-danger"
                >
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  {categoryFormError}
                </p>
              ) : null}

              <div className="flex justify-end gap-3 border-t border-line pt-4">
                <button
                  type="button"
                  onClick={closeCategoryForm}
                  disabled={isSavingCategory}
                  className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-body transition hover:bg-inset disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover focus:outline-none focus:ring-4 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingCategory ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <CircleCheckBig className="h-4 w-4" />
                  )}
                  {isSavingCategory ? 'Guardando...' : 'Guardar categoría'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Modal: eliminar categoría */}
      {deleteCategoryTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                <Trash className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">Eliminar categoría</h3>
                <p className="mt-1.5 text-sm text-body">
                  ¿Seguro que quieres eliminar{' '}
                  <span className="font-medium text-ink">
                    {deleteCategoryTarget.name}
                  </span>
                  ?
                </p>
              </div>
            </div>

            <p className="mt-4 rounded-lg bg-canvas px-3 py-2.5 text-xs text-body">
              El borrado es <strong>definitivo</strong>. Si la categoría tiene ejercicios
              asociados el backend responde <code className="font-mono">409</code> y no se borra
              nada, así que primero debes reasignar o eliminar esos ejercicios.
            </p>

            {exerciseCountByCategory.get(deleteCategoryTarget.id) ? (
              <p className="mt-3 flex items-center gap-2 text-xs font-medium text-warning">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                Esta categoría tiene{' '}
                {exerciseCountByCategory.get(deleteCategoryTarget.id)} ejercicio(s) asociado(s).
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteCategoryTarget(null)}
                disabled={isDeletingCategory}
                className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-body transition hover:bg-inset disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDeleteCategory()}
                disabled={isDeletingCategory}
                className="inline-flex items-center gap-2 rounded-lg bg-danger-solid px-4 py-2 text-sm font-semibold text-white transition hover:bg-danger-solid-hover focus:outline-none focus:ring-4 focus:ring-danger-line/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingCategory ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash className="h-4 w-4" />
                )}
                {isDeletingCategory ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}