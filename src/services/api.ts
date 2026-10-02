import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import type {
  AdminCategory,
  AdminExercise,
  Category,
  ExecuteRequest,
  ExecuteResponse,
  Exercise,
  ExerciseDraft,
  ExerciseInput,
  ExerciseTemplate,
  InputValueType,
  Language,
  LoginRequest,
  LoginResponse,
  ProgressStatus,
  RegisterRequest,
  RegisterResponse,
  SaveDraftRequest,
  TutorialExercise,
  TutorialStep,
  UpsertCategoryRequest,
  UpsertExerciseRequest,
  User,
} from '../types'

const DEFAULT_API_BASE_URL = 'http://localhost:5077/api'

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? DEFAULT_API_BASE_URL

const TOKEN_STORAGE_KEY = 'psacademy.token'
const USER_STORAGE_KEY = 'psacademy.user'
const LOGIN_PATH = '/auth/login'
const REGISTER_PATH = '/auth/register'
const ADMIN_PATH = '/admin'
const PUBLIC_AUTH_PATHS = [LOGIN_PATH, REGISTER_PATH]

// ------------------------------------------------------------------ Sesión

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function getUser(): User | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as User
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY)
    return null
  }
}

export function setUser(user: User): void {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(USER_STORAGE_KEY)
}

export function isAuthenticated(): boolean {
  return Boolean(getToken())
}

/**
 * El backend serializa el rol en minúsculas ("admin" / "user") mientras que el
 * claim del JWT va en PascalCase ("Admin"), así que normalizamos antes de comparar.
 */
export function isAdmin(): boolean {
  const role = getUser()?.role
  if (!role) return false
  return role.trim().toLowerCase().replace(/[^a-z]/g, '').includes('admin')
}

// --------------------------------------------------------------- Interceptores

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const url = error.config?.url ?? ''
    const isPublicAuthRequest = PUBLIC_AUTH_PATHS.some((path) => url.includes(path))
    if (error.response?.status === 401 && !isPublicAuthRequest) {
      clearToken()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)

/** .NET devuelve las claves de `errors` en PascalCase; el front trabaja en camelCase. */
const FIELD_LABELS: Record<string, string> = {
  email: 'Correo',
  password: 'Contraseña',
  title: 'Título',
  description: 'Descripción',
  difficulty: 'Dificultad',
  expectedoutput: 'Salida esperada',
  categoryid: 'Categoría',
  templates: 'Plantillas',
  startercode: 'Código inicial',
  languageid: 'Lenguaje',
  inputs: 'Valores del leer',
  value: 'Valor',
  valuetype: 'Tipo de valor',
  name: 'Nombre',
  orderindex: 'Orden',
}

/** "Templates[0].StarterCode" -> "Plantillas" */
function toFieldLabel(field: string): string {
  const root = field.split('[')[0].split('.')[0].toLowerCase()
  return FIELD_LABELS[root] ?? field
}

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | {
          message?: string
          title?: string
          detail?: string
          errors?: Record<string, string[] | string>
        }
      | undefined

    const flattened = data?.errors
      ? Object.entries(data.errors)
          .map(([field, messages]) => {
            const text = Array.isArray(messages) ? messages.join(' ') : String(messages)
            return text ? `${toFieldLabel(field)}: ${text}` : ''
          })
          .filter(Boolean)
      : []

    const message = data?.message ?? data?.title ?? flattened[0] ?? data?.detail
    if (message) return message

    if (error.code === 'ECONNABORTED') return 'La solicitud tardó demasiado. Inténtalo de nuevo.'
    if (error.response?.status === 403) {
      return 'No tienes permisos de administrador para realizar esta acción.'
    }
    if (error.response?.status === 409) {
      // Los 409 del backend siempre llegan con ProblemDetails (title/detail).
      return data?.detail ?? data?.title ?? 'El recurso ya existe o está en uso.'
    }
    if (error.response?.status === 429) {
      return 'Demasiados envíos seguidos. Espera un momento antes de volver a ejecutar.'
    }
    if (!error.response) return 'No se pudo conectar con el servidor. Verifica que la API esté ejecutándose.'
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

// ---------------------------------------------------- Mapeo de respuestas (adaptador)
//
// El backend devuelve las plantillas de forma plana
// ({ languageId, languageName, languageSlug, starterCode }) mientras que el resto
// de la app trabaja con { language: { ... } }. El mapeo vive aquí para que las
// páginas no dependan del contrato crudo.

interface RawExerciseTemplate {
  languageId: number
  languageName: string
  languageSlug: string
  starterCode: string
}

interface RawExerciseInput {
  orderIndex: number
  value: string
  valueType: InputValueType
}

interface RawExerciseDraft {
  languageSlug: string
  code: string
  updatedAt: string
}

/** `TutorialStepResponse` del backend, en camelCase. */
interface RawTutorialStep {
  id: number
  exerciseId: number
  orderIndex: number
  title: string
  body: string
  task?: string | null
  codeSnippet: string
  expectedOutput: string
  tip?: string | null
}

interface RawExercise {
  id: number
  categoryId: number
  categoryName?: string
  title: string
  description?: string
  difficulty: Exercise['difficulty']
  expectedOutput?: string
  isActive?: boolean
  userStatus?: ProgressStatus | null
  completedInLanguageSlug?: string | null
  templates?: RawExerciseTemplate[] | null
  inputs?: RawExerciseInput[] | null
  drafts?: RawExerciseDraft[] | null
  tutorialSteps?: RawTutorialStep[] | null
}

function toTutorialStep(raw: RawTutorialStep): TutorialStep {
  return {
    id: raw.id,
    exerciseId: raw.exerciseId,
    orderIndex: raw.orderIndex,
    title: raw.title,
    body: raw.body,
    task: raw.task ?? null,
    codeSnippet: raw.codeSnippet,
    expectedOutput: raw.expectedOutput,
    tip: raw.tip ?? null,
  }
}

/** Los pasos llegan en cualquier orden; el alumno siempre los recorre en ascending. */
function toTutorialSteps(raw: RawExercise): TutorialStep[] {
  return [...(raw.tutorialSteps ?? [])]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(toTutorialStep)
}

function toTemplate(raw: RawExerciseTemplate): ExerciseTemplate {
  return {
    id: 0,
    exerciseId: 0,
    languageId: raw.languageId,
    starterCode: raw.starterCode ?? '',
    language: {
      id: raw.languageId,
      name: raw.languageName,
      slug: raw.languageSlug,
      isActive: true,
    },
  }
}

function toExerciseDetail(raw: RawExercise): TutorialExercise {
  const inputs: ExerciseInput[] = [...(raw.inputs ?? [])]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((input) => ({
      orderIndex: input.orderIndex,
      value: input.value,
      valueType: input.valueType,
    }))

  const drafts: ExerciseDraft[] = [...(raw.drafts ?? [])]
    .sort((a, b) => a.languageSlug.localeCompare(b.languageSlug))
    .map((draft) => ({
      languageSlug: draft.languageSlug,
      code: draft.code,
      updatedAt: draft.updatedAt,
    }))

  return {
    id: raw.id,
    categoryId: raw.categoryId,
    title: raw.title,
    description: raw.description ?? '',
    difficulty: raw.difficulty,
    expectedOutput: raw.expectedOutput ?? '',
    templates: (raw.templates ?? []).map(toTemplate),
    inputs,
    userStatus: raw.userStatus ?? null,
    drafts,
    tutorialSteps: toTutorialSteps(raw),
  }
}

/** `GET /categories/{id}/exercises` devuelve un resumen sin descripción ni plantillas. */
function toExerciseSummary(raw: RawExercise): Exercise {
  return {
    id: raw.id,
    categoryId: raw.categoryId,
    title: raw.title,
    description: raw.description ?? '',
    difficulty: raw.difficulty,
    expectedOutput: raw.expectedOutput ?? '',
    templates: [],
    // Con JWT válido el backend marca "attempted"/"completed"; sin sesión llega null.
    userStatus: raw.userStatus ?? null,
    completedInLanguageSlug: raw.completedInLanguageSlug ?? null,
  }
}

// ------------------------------------------------------------------- Auth

export async function login(request: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>(LOGIN_PATH, request)
  setToken(data.token)
  setUser(data.user)
  return data
}

export async function register(data: RegisterRequest): Promise<RegisterResponse> {
  const response = await api.post<RegisterResponse>(REGISTER_PATH, data)
  setToken(response.data.token)
  setUser(response.data.user)
  return response.data
}

// ------------------------------------------------------------- Ejercicios

export async function getCategories(): Promise<Category[]> {
  const { data } = await api.get<Category[]>('/categories')
  return data
}

export async function getExercisesByCategory(categoryId: number): Promise<Exercise[]> {
  const { data } = await api.get<RawExercise[]>(`/categories/${categoryId}/exercises`)
  return data.map(toExerciseSummary)
}

export async function getExerciseById(exerciseId: number): Promise<TutorialExercise> {
  const { data } = await api.get<RawExercise>(`/exercises/${exerciseId}`)
  return toExerciseDetail(data)
}

/** Nombre exacto de la categoría de bienvenida; el backend la siembra sola. */
const TUTORIAL_CATEGORY_NAME = 'Tutorial'

/**
 * Lecciones del tutorial con sus pasos ya cargados.
 *
 * El listado por categoría devuelve resúmenes sin plantillas ni pasos, así que
 * primero se localiza la categoría "Tutorial" y después se pide el detalle de
 * cada lección. Son pocas peticiones y salen en paralelo; el orden es el mismo
 * que devuelve el backend (`orderIndex`, luego título).
 */
export async function getTutorialExercises(): Promise<TutorialExercise[]> {
  const categories = await getCategories()
  const tutorial = categories.find(
    (category) => category.name.trim().toLowerCase() === TUTORIAL_CATEGORY_NAME.toLowerCase(),
  )

  if (!tutorial) return []

  const summaries = await getExercisesByCategory(tutorial.id)
  return Promise.all(summaries.map((summary) => getExerciseById(summary.id)))
}

/**
 * Primer ejercicio de una categoría, usado por el tutorial para abrir el
 * primer reto de Secuenciales cuando el alumno termina las cinco lecciones.
 */
export async function getFirstExerciseOfCategory(categoryName: string): Promise<Exercise | null> {
  const categories = await getCategories()
  const category = categories.find(
    (item) => item.name.trim().toLowerCase() === categoryName.trim().toLowerCase(),
  )

  if (!category) return null

  const exercises = await getExercisesByCategory(category.id)
  return exercises[0] ?? null
}

/** Avance del tutorial, para mostrarlo en el panel y saber si ya se puede seguir. */
export interface TutorialProgress {
  totalLessons: number
  completedLessons: number
  /** `false` mientras quede alguna lección sin superar (o si no hay lecciones). */
  isComplete: boolean
}

export async function getTutorialProgress(): Promise<TutorialProgress> {
  const categories = await getCategories()
  const tutorial = categories.find(
    (category) => category.name.trim().toLowerCase() === TUTORIAL_CATEGORY_NAME.toLowerCase(),
  )

  if (!tutorial) return { totalLessons: 0, completedLessons: 0, isComplete: false }

  const lessons = await getExercisesByCategory(tutorial.id)
  const completedLessons = lessons.filter((lesson) => lesson.userStatus === 'completed').length

  return {
    totalLessons: lessons.length,
    completedLessons,
    isComplete: lessons.length > 0 && completedLessons >= lessons.length,
  }
}

export async function executeCode(
  exerciseId: number,
  request: ExecuteRequest,
): Promise<ExecuteResponse> {
  const { data } = await api.post<ExecuteResponse>(`/exercises/${exerciseId}/execute`, request)
  return data
}

/**
 * Guarda (o reemplaza) el borrador de código del alumno para un lenguaje, sin
 * ejecutarlo. Se usa con autoguardado desde el workspace.
 */
export async function saveDraft(
  exerciseId: number,
  request: SaveDraftRequest,
): Promise<ExerciseDraft> {
  const { data } = await api.put<ExerciseDraft>(`/exercises/${exerciseId}/draft`, request)
  return data
}

/**
 * Catálogo de lenguajes. `includeInactive` solo tiene sentido en el panel de
 * administración; el listado público ya filtra los inactivos.
 */
export async function getLanguages(includeInactive = false): Promise<Language[]> {
  const { data } = await api.get<Language[]>('/languages', {
    params: includeInactive ? { includeInactive: true } : undefined,
  })
  return data
}

// ------------------------------------------------------------------ Admin
//
// Todos estos endpoints exigen `[Authorize(Roles = "Admin")]`.

export async function getAdminExercises(categoryId?: number): Promise<AdminExercise[]> {
  const params = categoryId ? { categoryId } : undefined
  const { data } = await api.get<AdminExercise[]>(`${ADMIN_PATH}/exercises`, { params })
  return data
}

export async function getAdminExercise(exerciseId: number): Promise<AdminExercise> {
  const { data } = await api.get<AdminExercise>(`${ADMIN_PATH}/exercises/${exerciseId}`)
  return data
}

export async function createExercise(payload: UpsertExerciseRequest): Promise<AdminExercise> {
  const { data } = await api.post<AdminExercise>(`${ADMIN_PATH}/exercises`, payload)
  return data
}

export async function updateExercise(
  exerciseId: number,
  payload: UpsertExerciseRequest,
): Promise<AdminExercise> {
  const { data } = await api.put<AdminExercise>(`${ADMIN_PATH}/exercises/${exerciseId}`, payload)
  return data
}

/** Baja lógica: el backend marca `isActive = false` y responde 204 sin cuerpo. */
export async function deleteExercise(exerciseId: number): Promise<void> {
  await api.delete(`${ADMIN_PATH}/exercises/${exerciseId}`)
}

// ------------------------------------------------------------ Admin: categorías

export async function getAdminCategories(): Promise<AdminCategory[]> {
  const { data } = await api.get<AdminCategory[]>(`${ADMIN_PATH}/categories`)
  return data
}

/** El nombre es único (case-insensitive): el backend responde 409 si se repite. */
export async function createCategory(payload: UpsertCategoryRequest): Promise<AdminCategory> {
  const { data } = await api.post<AdminCategory>(`${ADMIN_PATH}/categories`, payload)
  return data
}

export async function updateCategory(
  categoryId: number,
  payload: UpsertCategoryRequest,
): Promise<AdminCategory> {
  const { data } = await api.put<AdminCategory>(`${ADMIN_PATH}/categories/${categoryId}`, payload)
  return data
}

/**
 * Borrado físico. La FK está en Restrict: si la categoría tiene ejercicios
 * (activos o dados de baja) el backend responde 409.
 */
export async function deleteCategory(categoryId: number): Promise<void> {
  await api.delete(`${ADMIN_PATH}/categories/${categoryId}`)
}