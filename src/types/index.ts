export type Difficulty = 'Easy' | 'Medium' | 'Hard'

/** Progreso del alumno sobre un ejercicio, según `UserProgress` del backend. */
export type ProgressStatus = 'attempted' | 'completed'

export interface User {
  id: number
  email: string
  role: string
}

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