import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import type {
  AdminCategory,
  AdminExercise,
  AdminSubmission,
  AdminUser,
  AppNotification,
  Category,
  ExecuteRequest,
  ExecuteResponse,
  Exercise,
  ExerciseDraft,
  ExerciseInput,
  ExerciseTemplate,
  GradeSubmissionRequest,
  InputValueType,
  Language,
  LoginRequest,
  LoginResponse,
  ProgressStatus,
  RefreshResponse,
  RegisterRequest,
  RegisterResponse,
  SaveDraftRequest,
  SubmitRequest,
  SubmitResponse,
  TutorialExercise,
  TutorialStep,
  UpsertCategoryRequest,
  UpsertExerciseRequest,
  UpsertUserRequest,
  User,
} from '../types'

const DEFAULT_API_BASE_URL = 'http://localhost:5077/api'

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? DEFAULT_API_BASE_URL

// Un build de produccion sin VITE_API_URL no falla al compilar: simplemente deja
// toda la API apuntando a localhost, y el sintoma es que el navegador dice que la
// peticion fue rechazada por CORS (o "Failed to fetch") sin relacion apparent con
// la variable que faltaba. Se avisa en consola al arrancar, que es donde un
// becario o una IA acaba mirando primero.
if (import.meta.env.PROD && API_BASE_URL === DEFAULT_API_BASE_URL) {
  console.error(
    '[PSAcademy] VITE_API_URL no está definida: todas las llamadas van a ' +
      `${DEFAULT_API_BASE_URL}. Añádela en el panel del despliegue (Settings → ` +
      'Environment Variables) con el valor https://psacademy-api.onrender.com/api ' +
      'y vuelve a desplegar. Revisa también Cors__AllowedOrigins en la API para que ' +
      'incluya el dominio de este front.',
  )
}

const TOKEN_STORAGE_KEY = 'psacademy.token'
const REFRESH_TOKEN_STORAGE_KEY = 'psacademy.refreshToken'
const USER_STORAGE_KEY = 'psacademy.user'
/** Caducidad del token de acceso en epoch ms, para renovar antes de que caduque. */
const TOKEN_EXPIRY_STORAGE_KEY = 'psacademy.tokenExpiry'
const LOGIN_PATH = '/auth/login'
const REGISTER_PATH = '/auth/register'
const REFRESH_PATH = '/auth/refresh'
const LOGOUT_PATH = '/auth/logout'
const ADMIN_PATH = '/admin'
const NOTIFICATIONS_PATH = '/notifications'

/**
 * Peticiones que no deben pasar por la cola de reintento al recibir un 401: son las
 * que conservan la sesión y las que se hacen sin sesión. Reintentarlas recursivamente
 * convertiría un refresh fallido en un bucle de peticiones.
 */
const SESSION_FREE_PATHS = [LOGIN_PATH, REGISTER_PATH, REFRESH_PATH, LOGOUT_PATH]

// ------------------------------------------------------------------ Sesión

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

/**
 * Token de renovación. Viaja en el mismo localStorage que el de acceso: no es un
 * cookie HttpOnly, así que un XSS puede leerlo igual. El límite real lo pone el backend,
 * que lo rota en cada uso y lo revoca al cerrar sesión.
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
}

function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token)
}

/** Momento en que caduca el token de acceso, en milisegundos epoch. */
function readAccessTokenExpiry(): number {
  const raw = localStorage.getItem(TOKEN_EXPIRY_STORAGE_KEY)
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
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
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY)
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

/**
 * Renovación de la sesión mientras el usuario sigue trabajando.
 *
 * Antes, el interceptor expulsaba al alumno en cuanto el JWT de 60 minutos expiraba,
 * aunque estuviera escribiendo código: la sesión se caía por tiempo, no por inactividad
 * real. Ahora hay dos disparadores y ninguno borra la sesión sin motivo:
 *
 * 1. Una respuesta 401 (el token expiró justo entre la comprobación previa y la
 *    petición). Se canjea el refresh token una sola vez y se reintenta la petición
 *    original, de modo que ni la acción del alumno ni el estado de la página se pierden.
 * 2. La comprobación previa de `ensureFreshToken`, que el resto de la app llama al
 *    detectar actividad y antes de cada operación importante. Así el token se renueva
 *    proactivamente y la mayoría de las veces ni llega a haber un 401.
 *
 * Solo cuando el refresh token tampoco sirve (vencido, revocado o revocado por un
 * "cerrar sesión" en otra pestaña) se limpia la sesión: en ese caso lacaducidad sí es
 * real y el usuario tiene que volver a entrar.
 */

/** Ventana de renovación: se renueva este tiempo antes de que caduque el token. */
const REFRESH_LEEWAY_MS = 2 * 60 * 1000

/** Marca de reintento en la config de axios, en `declare global` más abajo. */
const RETRY_FLAG = '__psacademyRetried'

/**
 * Refresh en curso, compartido por todas las peticiones.
 *
 * Sin esto, cinco peticiones que fallan a la vez dispararían cinco canjes: el refresh
 * token rota en cada uso, así que cuatro de ellos fallarían y expulsarían al usuario
 * que sí tenía la sesión viva. Con la promesa compartida solo se canjea una vez y las
 * demás esperan su resultado.
 */
let refreshInFlight: Promise<string> | null = null

/**
 * Canjea el refresh token por un JWT nuevo. Lanza si la sesión ya no es renovable.
 */
async function requestNewAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken()

  if (!refreshToken) {
    throw new Error('No hay refresh token: la sesión no se puede renovar.')
  }

  // Instancia aparte de `api` y sin interceptores: un 401 aquí significa "no hay sesión",
  // no "renueva y reintenta", y pasar por la cola convertiría un fallo en un bucle.
  const { data } = await axios.post<RefreshResponse>(
    `${API_BASE_URL}${REFRESH_PATH}`,
    { refreshToken },
    { headers: { 'Content-Type': 'application/json' } },
  )

  setToken(data.token)
  setRefreshToken(data.refreshToken)
  localStorage.setItem(
    TOKEN_EXPIRY_STORAGE_KEY,
    String(new Date(data.expiresAtUtc).getTime()),
  )

  return data.token
}

/** Canje único y compartido: si ya hay uno en marcha, se espera a ese. */
function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = requestNewAccessToken().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/**
 * Cierra la sesión en el cliente y manda a /login.
 *
 * Se usa solo cuando el refresh token falló, es decir, cuando la caducidad es real. Se
 * avisa a las demás pestañas con un evento de storage: si el usuario abrió el panel en
 * otra pestaña, esta también debe caer en /login en lugar de mostrar datos que ya no
 * puede refrescar.
 */
function endSession(): void {
  clearToken()

  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.assign('/login')
  }
}

/**
 * Reintenta el canje una vez tras una espera corta.
 *
 * El refresh token rota en cada uso, así que si dos pestañas llaman a la vez a
 * `POST /auth/refresh` solo una gana. La que pierde ve un 401 aunque su sesión siga viva:
 * sin este reintento, abrir el panel en otra pestaña cerraría la primera. Al esperar un
 * momento, la otra pestaña ya ha escrito el token nuevo en localStorage y el canje
 * vuelve a funcionar.
 */
async function refreshWithRetry(): Promise<string> {
  try {
    return await refreshAccessToken()
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 350))

    // `refreshInFlight` ya quedó en null tras el fallo, así que esto es un canje nuevo.
    return await refreshAccessToken()
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as (InternalAxiosRequestConfig & { [RETRY_FLAG]?: boolean }) | undefined
    const url = config?.url ?? ''
    const isSessionFree = SESSION_FREE_PATHS.some((path) => url.includes(path))

    if (error.response?.status === 401 && !isSessionFree && config && !config[RETRY_FLAG]) {
      // Solo un reintento por petición: si el token renovado también da 401, el problema
      // no es la caducidad y hay que dejar que la UI muestre el error real.
      config[RETRY_FLAG] = true

      try {
        const token = await refreshWithRetry()
        config.headers.set('Authorization', `Bearer ${token}`)
        return await api.request(config)
      } catch {
        endSession()
      }
    }

    return Promise.reject(error)
  },
)

/**
 * Sincroniza la sesión entre pestañas.
 *
 * El evento `storage` solo se dispara en las OTRAS pestañas del mismo origen. Al renovar
 * el token, esta ventana lo guarda en localStorage y las demás lo leen ya actualizado en
 * su siguiente petición (el interceptor lo consulta en cada una, no lo mantiene en memoria).
 * Al cerrar sesión o caducar en una pestaña, las demás ven el borrado y caen en /login en
 * lugar de mostrar datos que ya no pueden renovar.
 */
function installCrossTabSync(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('storage', (event) => {
    // `key === null` significa que otra pestaña vació todo el almacenamiento.
    const affectsSession =
      event.key === null ||
      event.key === TOKEN_STORAGE_KEY ||
      event.key === REFRESH_TOKEN_STORAGE_KEY ||
      event.key === USER_STORAGE_KEY

    if (affectsSession && !getToken()) endSession()
  })
}

installCrossTabSync()

/**
 * Renueva el token si está caducado o a punto de caducar.
 *
 * Pensada para llamarse desde la detección de actividad: mientras el alumno escribe,
 * hace scroll o pulsa botones, la sesión se mantiene viva sin que tenga que volver a
 * entrar. Es segura de llamar en cualquier momento y no lanza si no hay sesión abierta
 * (todavía no ha iniciado sesión, o ya se cerró).
 */
export async function ensureFreshToken(): Promise<boolean> {
  if (!isAuthenticated()) return false

  const expiresAt = readAccessTokenExpiry()

  // Sin caducidad conocida (una sesión guardada por una versión anterior del front, o
  // un token sin el `exp` legible) no se renueva de forma preventiva: cuando caduque,
  // el interceptor de 401 la recoverá igualmente.
  if (expiresAt === 0) return true

  if (expiresAt - Date.now() > REFRESH_LEEWAY_MS) return true

  try {
    await refreshAccessToken()
    return true
  } catch {
    endSession()
    return false
  }
}

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
  stdin?: string | null
  tip?: string | null
}

interface RawExercise {
  id: number
  categoryId: number
  categoryName?: string
  /** Justificación del admin si el último envío fue devuelto. */
  feedback?: string | null
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
    stdin: raw.stdin ?? null,
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
    feedback: raw.feedback ?? null,
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
  setRefreshToken(data.refreshToken)
  localStorage.setItem(TOKEN_EXPIRY_STORAGE_KEY, String(new Date(data.expiresAtUtc).getTime()))
  setUser(data.user)
  return data
}

export async function register(data: RegisterRequest): Promise<RegisterResponse> {
  const response = await api.post<RegisterResponse>(REGISTER_PATH, data)
  setToken(response.data.token)
  setRefreshToken(response.data.refreshToken)
  localStorage.setItem(
    TOKEN_EXPIRY_STORAGE_KEY,
    String(new Date(response.data.expiresAtUtc).getTime()),
  )
  setUser(response.data.user)
  return response.data
}

/**
 * Cierra sesión en el backend y borra la sesión local.
 *
 * Se avisa al backend para revocar el refresh token: si solo se limpiese el
 * localStorage, el refresh token seguiría siendo válido y quien lo tuviera (otra
 * pestaña, el dispositivo compartido) podría renovar la sesión. El fallo del POST se
 * ignora a propósito: si la red falla, la sesión local se cierra igual y el token
 * caduca solo.
 */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken()

  if (refreshToken) {
    try {
      await axios.post(`${API_BASE_URL}${LOGOUT_PATH}`, { refreshToken })
    } catch {
      /* Sin conexión se cierra la sesión local igualmente. */
    }
  }

  clearToken()
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

// ------------------------------------------------------------ Admin: usuarios

export async function getAdminUsers(): Promise<AdminUser[]> {
  const { data } = await api.get<AdminUser[]>(`${ADMIN_PATH}/users`)
  return data
}

/**
 * Guarda correo, rol y, si viene informed, una contraseña nueva. El backend rechaza
 * (403) editar la propia cuenta y (409) degradar o borrar al último administrador,
 * así que ambos casos se tratan como error visible en la UI y no se silencian.
 */
export async function updateUser(userId: number, payload: UpsertUserRequest): Promise<AdminUser> {
  const { data } = await api.put<AdminUser>(`${ADMIN_PATH}/users/${userId}`, payload)
  return data
}

/**
 * Borrado físico en cascada: se van el progreso y los borradores del usuario. Sin
 * papelera, por eso la UI pide confirmación escribiendo el correo antes de llamar.
 */
export async function deleteUser(userId: number): Promise<void> {
  await api.delete(`${ADMIN_PATH}/users/${userId}`)
}

// ----------------------------------------------- Calificaciones del alumno

/**
 * Envía la solución a calificación.
 *
 * El backend vuelve a ejecutar el código y rechaza el envío si la salida no coincide
 * con la esperada, así que el botón se habilita solo tras un `isCorrect` pero la
 * garantía no depende del cliente. Solo tiene sentido para ejercicios normales: el
 * tutorial se corrige solo al acertar.
 */
export async function submitExercise(
  exerciseId: number,
  request: SubmitRequest,
): Promise<SubmitResponse> {
  const { data } = await api.post<SubmitResponse>(`/exercises/${exerciseId}/submit`, request)
  return data
}

// --------------------------------------------- Bandeja de calificación (admin)

/**
 * Lista los envíos. Sin `status` devuelve la cola de trabajo (los pendientes), que es
 * lo que el admin necesita por defecto; `Correct`, `Incorrect` y `All` consultan el
 * historial ya calificado.
 */
export async function getAdminSubmissions(
  status: 'Pending' | 'Correct' | 'Incorrect' | 'All' = 'Pending',
): Promise<AdminSubmission[]> {
  const params = status === 'All' ? undefined : { status }
  const { data } = await api.get<AdminSubmission[]>(`${ADMIN_PATH}/submissions`, { params })
  return data
}

/**
 * Califica un envío. Con `correct: false` la justificación es obligatoria: la API
 * responde 400 sin ella.
 */
export async function gradeSubmission(
  submissionId: number,
  request: GradeSubmissionRequest,
): Promise<AdminSubmission> {
  const { data } = await api.put<AdminSubmission>(
    `${ADMIN_PATH}/submissions/${submissionId}/grade`,
    request,
  )
  return data
}

// ------------------------------------------------------------ Notificaciones

/**
 * Notificaciones del usuario actual.
 *
 * El contador de no leídas llega en la cabecera `X-Unread-Count` y se devuelve aquí
 * junto con la lista, para que la campana pueda actualizarse sin una segunda petición.
 * El sondeo es de 30 s (ver `useNotifications`), volumen bajo y suficiente para que el
 * admin vea el envío casi nada después de que el alumno lo mande.
 */
export async function getNotifications(): Promise<{
  notifications: AppNotification[]
  unreadCount: number
}> {
  const response = await api.get<AppNotification[]>(NOTIFICATIONS_PATH)

  const header = response.headers['x-unread-count']
  const unreadCount = Number(header)

  return {
    notifications: response.data,
    unreadCount: Number.isFinite(unreadCount) ? unreadCount : 0,
  }
}

/** Marca una notificación como leída. Sin cuerpo: el backend responde 204. */
export async function markNotificationRead(notificationId: number): Promise<void> {
  await api.patch(`${NOTIFICATIONS_PATH}/${notificationId}/read`)
}
