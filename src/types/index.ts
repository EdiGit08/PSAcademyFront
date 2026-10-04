export type Difficulty = 'Easy' | 'Medium' | 'Hard'

/**
 * Progreso del alumno sobre un ejercicio, según `ProgressStatus` del backend.
 *
 * `pendingReview` y `incorrect` existen porque los ejercicios (todos menos los del
 * tutorial) los califica un administrador: acertar la salida solo pone el envío en cola
 * y el "no" del admin es lo que devuelve el ejercicio a `incorrect`, con su
 * justificación, para que el alumno lo corrija y lo vuelva a enviar.
 */
export type ProgressStatus = 'attempted' | 'completed' | 'pendingReview' | 'incorrect'

export interface User {
  id: number
  email: string
  role: string
}

/**
 * `UserRole` del backend. Viaja como texto porque la API registra un
 * `JsonStringEnumConverter` sin política de nombres, así que el cable lleva
 * literalmente "Admin" y "User".
 */
export type UserRole = 'Admin' | 'User'

export interface Category {
  id: number
  name: string
  description: string | null
  orderIndex: number
  exerciseCount?: number
}

export interface Language {
  id: number
  name: string
  slug: string
  isActive: boolean
}

export interface ExerciseTemplate {
  id: number
  exerciseId: number
  languageId: number
  starterCode: string
  language: Language
}

/** Tipo de un "valor del leer": el admin lo define y el alumno solo lo ve. */
export type InputValueType = 'Number' | 'Text'

/** Valor que el programa recibe por stdin, en la posición `orderIndex`. */
export interface ExerciseInput {
  orderIndex: number
  value: string
  valueType: InputValueType
}

/** Borrador de código guardado por el alumno para un lenguaje concreto. */
export interface ExerciseDraft {
  languageSlug: string
  code: string
  updatedAt: string
}

/**
 * Un paso guiado de un ejercicio del tutorial.
 *
 * El snippet es código PSeint completo y su salida esperada se valida en
 * `/execute`; el último paso del ejercicio repite la salida del reto final.
 */
export interface TutorialStep {
  id: number
  exerciseId: number
  orderIndex: number
  title: string
  body: string
  /** Qué debe hacer el alumno en este paso; es la guía corta de la cabecera. */
  task: string | null
  codeSnippet: string
  expectedOutput: string
  /**
   * Datos de entrada del paso, ya resueltos por el backend: si el paso no declara los
   * suyos, aquí vienen los del ejercicio. El tutorial los muestra para que el alumno
   * sepa con qué se va a ejecutar el snippet.
   */
  stdin: string | null
  tip: string | null
}

/** Un ejercicio del tutorial viene con sus pasos ya ordenados. */
export interface TutorialExercise extends Exercise {
  tutorialSteps: TutorialStep[]
}

export interface Exercise {
  id: number
  categoryId: number
  title: string
  description: string
  difficulty: Difficulty
  expectedOutput: string
  templates: ExerciseTemplate[]
  /** Valores que el programa recibirá por entrada estándar, en orden. */
  inputs?: ExerciseInput[]
  /** Solo viene si la petición incluye un JWT válido. */
  userStatus?: ProgressStatus | null
  /** Código guardado por el alumno por lenguaje; solo con JWT. */
  drafts?: ExerciseDraft[]
  /** Slug del lenguaje con el que se superó, si está completado. */
  completedInLanguageSlug?: string | null
  /**
   * Justificación del administrador cuando devolvió el último envío. Solo viene
   * informada si el estado es `incorrect`; en el resto de casos es null.
   */
  feedback?: string | null
  /**
   * Pasos del tutorial. Solo los ejercicios del tutorial los traen, y su presencia es
   * lo que los distingue: se autocorrigen al acertar. Un array vacío significa que el
   * ejercicio es de los que se califica un administrador.
   */
  tutorialSteps?: TutorialStep[]
}

export interface ExecuteRequest {
  languageSlug: string
  code: string
  /**
   * Paso del tutorial que se está validando. El backend lo usa para comprobar
   * la salida contra la de ese paso en lugar de contra la del ejercicio, y para
   * no marcar el reto como superado hasta el último paso.
   */
  tutorialStepId?: number
}

export interface ExecuteResponse {
  isCorrect: boolean
  actualOutput: string
  expectedOutput: string
  /** Salida de compilación o de error en tiempo de ejecución. */
  errorOutput?: string | null
  hasError?: boolean
  userStatus?: ProgressStatus | null
  /**
   * El ejercicio tiene un envío esperando al admin. El backend crea el envío en esta misma
   * llamada cuando la salida es correcta, así que en ese caso vuelve `true` con el
   * `submissionId` recién creado: no hay un segundo botón que pulsar.
   */
  awaitingReview?: boolean
  /** Envío creado por esta ejecución; null si no hubo ninguno nuevo. */
  submissionId?: number | null
}

export interface SubmitRequest {
  languageSlug: string
  code: string
}

export interface SubmitResponse {
  submissionId: number
  status: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  expiresAtUtc: string
  /**
   * Token de renovación. Vive mucho más que el de acceso (14 días) y es lo que permite
   * mantener la sesión abierta mientras el alumno trabaja sin volver a entrar.
   */
  refreshToken: string
  refreshTokenExpiresAtUtc: string
  user: User
}

/** Respuesta de `POST /api/auth/refresh`. */
export interface RefreshResponse {
  token: string
  expiresAtUtc: string
  refreshToken: string
  refreshTokenExpiresAtUtc: string
}

export interface RegisterRequest {
  email: string
  password: string
}

export type RegisterResponse = LoginResponse

// ---------------------------------------------------------------- Admin

/** Plantilla tal como la devuelve el endpoint público de detalle. */
export interface AdminTemplate {
  id: number
  languageId: number
  languageName: string
  languageSlug: string
  starterCode: string
}

/** Respuesta de los endpoints `/api/admin/exercises`. */
export interface AdminExercise {
  id: number
  categoryId: number
  categoryName: string
  title: string
  description: string
  difficulty: Difficulty
  expectedOutput: string
  isActive: boolean
  createdAt: string
  templates: AdminTemplate[]
  inputs: ExerciseInput[]
  tutorialSteps: TutorialStep[]
}

export interface UpsertTemplate {
  languageId: number
  starterCode: string
}

/** Valor del "leer" tal como lo envía el admin (el orden del arreglo es la secuencia). */
export interface UpsertInput {
  value: string
  valueType: InputValueType
}

/** Paso del tutorial tal como lo envía el admin (el orden es `orderIndex`). */
export interface UpsertTutorialStep {
  title: string
  body: string
  task: string | null
  codeSnippet: string
  expectedOutput: string
  /**
   * Datos del paso, uno por línea, o `null` para que herede los del ejercicio.
   *
   * Ojo al editarlos: la salida esperada del paso se comprobó ejecutándolo con esta
   * entrada, así que si se cambian hay que recalcular `expectedOutput` a mano o el
   * alumno no podrá superar el paso.
   */
  stdin: string | null
  tip: string | null
}

export interface UpsertExerciseRequest {
  categoryId: number
  title: string
  description: string
  difficulty: Difficulty
  expectedOutput: string
  isActive: boolean
  templates: UpsertTemplate[]
  /** Reemplaza la colección completa: el orden del arreglo es el de lectura. */
  inputs: UpsertInput[]
  /** Reemplaza la colección completa: el orden del arreglo es el de los pasos. */
  tutorialSteps: UpsertTutorialStep[]
}

/** Cuerpo de `PUT /api/exercises/{id}/draft`. */
export interface SaveDraftRequest {
  languageSlug: string
  code: string
}

/**
 * Los endpoints `/api/admin/categories` devuelven la entidad `Category` cruda,
 * por lo que incluye la colección de navegación `exercises` (siempre vacía).
 */
export interface AdminCategory {
  id: number
  name: string
  description: string | null
  orderIndex: number
  exercises?: unknown[]
}

export interface UpsertCategoryRequest {
  name: string
  description: string | null
  orderIndex: number
}

/**
 * Ficha de una cuenta vista desde el panel de administración.
 *
 * Los contadores acompañan a la fila a propósito: borrar una cuenta se lleva por
 * delante su progreso y sus borradores, y el admin tiene que ver eso antes de
 * confirmar, no después.
 */
export interface AdminUser {
  id: number
  email: string
  role: UserRole
  createdAt: string
  /** Ejercicios intentados alguna vez, incluidos los superados. */
  attemptedCount: number
  completedCount: number
  draftCount: number
  /** Última vez que mandó código o guardó un borrador; `null` si nunca entró. */
  lastActivityAt: string | null
  /** True si es la cuenta con la que se está autenticado. */
  isSelf: boolean
}

/**
 * Edición de una cuenta. `newPassword` es opcional: si no llega, el usuario conserva
 * la suya (el admin nunca ve el hash, así que no puede reenviarla).
 */
export interface UpsertUserRequest {
  email: string
  role: UserRole
  newPassword?: string
}
// ------------------------------------------------- Calificaciones y avisos

/** Estado de un envío en la bandeja del admin. */
export type SubmissionStatus = 'Pending' | 'Correct' | 'Incorrect'

/** Envío de un alumno pendiente de (o ya subjected a) calificación. */
export interface AdminSubmission {
  id: number
  userId: number
  userEmail: string
  exerciseId: number
  exerciseTitle: string
  languageName: string
  code: string
  actualOutput: string
  expectedOutput: string
  status: SubmissionStatus
  feedback: string | null
  submittedAt: string
  gradedAt: string | null
  gradedByEmail: string | null
}

export interface GradeSubmissionRequest {
  correct: boolean
  /** Obligatoria cuando `correct` es false: es lo que le dice al alumno qué corregir. */
  feedback?: string
}

export type NotificationType = 'SubmissionPending' | 'SubmissionGraded'

export interface AppNotification {
  id: number
  type: NotificationType
  title: string
  message: string
  /** JSON con `{ submissionId, exerciseId }`, o null si el backend no lo envió. */
  data: string | null
  isRead: boolean
  createdAt: string
}

/** Contador de no leídas que viaja en la cabecera `X-Unread-Count`. */
export interface NotificationsResult {
  notifications: AppNotification[]
  unreadCount: number
}
