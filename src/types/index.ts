export type Difficulty = 'Easy' | 'Medium' | 'Hard'

/** Progreso del alumno sobre un ejercicio, según `UserProgress` del backend. */
export type ProgressStatus = 'attempted' | 'completed'

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
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  expiresAtUtc: string
  user: User
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