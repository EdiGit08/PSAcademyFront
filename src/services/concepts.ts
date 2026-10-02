/**
 * Explicaciones breves de las construcciones nuevas que ve el alumno.
 *
 * Antes de su primer intento en el workspace se le muestra una tarjeta por cada
 * concepto que aparece en su código y que todavía no ha visto. Están marcadas
 * como "vistas" en `localStorage`, así que solo aparecen una vez por alumno y
 * por navegador.
 */

export interface Concept {
  id: string
  title: string
  /** Una frase: qué hace la construcción. */
  summary: string
  /** Cómo se escribe, tal como el alumno la verá en su código. */
  syntax: string
  /** Un ejemplo mínimo, listo para copiar mentalmente. */
  example: string
}

interface ConceptDefinition extends Concept {
  /**
   * Expresiones regulares por lenguaje (`python`, `java`, `pseint`). Si un
   * constructor se escribe igual en todos los lenguajes, basta con `all`.
   */
  patterns: Record<'all' | 'python' | 'java' | 'pseint', RegExp[]>
}

const CONCEPT_DEFINITIONS: ConceptDefinition[] = [
  {
    id: 'si',
    title: 'Si: decidir según una condición',
    summary: 'Ejecuta un bloque solo cuando la condición es verdadera.',
    syntax: 'Si (condición) Entonces\n\t// se cumple\nSino\n\t// no se cumple\nFinSi',
    example: 'Si (edad >= 18) Entonces\n\tEscribir "Mayor de edad"\nFinSi',
    patterns: {
      all: [/\bsi\b/i, /\bif\b/],
      python: [/\bif\b/],
      java: [/\bif\b/],
      pseint: [/\bsi\b/i],
    },
  },
  {
    id: 'para',
    title: 'Para: repetir un numero concreto de veces',
    summary: 'Repite un bloque contando desde un inicio hasta un final.',
    syntax: 'Para (i <- 1, hasta N) Hacer\n\t// se repite N veces\nFinPara',
    example: 'Para (i <- 1, hasta 5) Hacer\n\tEscribir i\nFinPara',
    patterns: {
      all: [/\bpara\b/i, /\bfor\b/],
      python: [/\bfor\b/],
      java: [/\bfor\b/],
      pseint: [/\bpara\b/i, /\bhacer\b/i],
    },
  },
  {
    id: 'mientras',
    title: 'Mientras: repetir mientras se cumpla',
    summary: 'Repite un bloque mientras la condición sea verdadera.',
    syntax: 'Mientras (condición) Hacer\n\t// se repite\nFinMientras',
    example: 'Mientras (contador < 3) Hacer\n\tEscribir contador\n\tcontador <- contador + 1\nFinMientras',
    patterns: {
      all: [/\bmientras\b/i, /\bwhile\b/],
      python: [/\bwhile\b/],
      java: [/\bwhile\b/],
      pseint: [/\bmientras\b/i],
    },
  },
  {
    id: 'repetir',
    title: 'Repetir: un bloque un número de veces',
    summary: 'Igual que Para, pero con la cantidad escrita primero.',
    syntax: 'Repetir N veces\n\t// se repite N veces\nFinRepetir',
    example: 'Repetir 3 veces\n\tEscribir "Hola"\nFinRepetir',
    patterns: {
      all: [/\brepetir\b/i, /\brepeat\b/],
      python: [/\bfor\b/],
      java: [/\bdo\b/, /\bwhile\b/],
      pseint: [/\brepetir\b/i],
    },
  },
  {
    id: 'funcion',
    title: 'Función: un bloque con nombre',
    summary: 'Agrupa instrucciones que se pueden volver a usar.',
    syntax: 'Funcion Nombre(parametros)\n\t// lógica\nFinFuncion',
    example: 'Funcion Saludar(nombre)\n\tEscribir "Hola, ", nombre\nFinFuncion',
    patterns: {
      all: [/\bfuncion\b/i, /\bfunction\b/i, /\bdef\b/],
      python: [/\bdef\b/],
      java: [/\bstatic\b/, /\bvoid\b/, /\bint\b.*\(/],
      pseint: [/\bfuncion\b/i],
    },
  },
  {
    id: 'leer',
    title: 'Leer: guardar lo que escribe el usuario',
    summary: 'Pide un dato por la consola y lo guarda en una variable.',
    syntax: 'Definir edad Como Entero\nLeer edad',
    example: 'Definir nombre Como Cadena\nLeer nombre\nEscribir "Hola, ", nombre',
    patterns: {
      all: [/\bleer\b/i, /\binput\b/, /\bscanf?\b/, /\bcin\b/, /\breadline\b/, /\bnext\s*\(/],
      python: [/\binput\s*\(/],
      java: [/\bscanner\b/i, /\bnext\s*\(\s*\)/],
      pseint: [/\bleer\b/i],
    },
  },
]

/** Oculta los comentarios: un `// Para siempre` no es una instrucción `Para`. */
function stripComments(code: string, languageSlug: string): string {
  const isPython = languageSlug === 'python'
  return code
    .split('\n')
    .filter((line) => !(isPython ? /^\s*#/.test(line) : /^\s*(\/\/|\/\*|\*)/.test(line)))
    .join('\n')
}

/**
 * Construcciones que aparecen en `code` y que el alumno aún no ha visto,
 * en el orden en que se declararon.
 */
export function detectConcepts(code: string, languageSlug: string): Concept[] {
  const clean = stripComments(code, languageSlug)
  const family = languageSlug === 'python' || languageSlug === 'java' || languageSlug === 'pseint'
    ? languageSlug
    : 'all'

  return CONCEPT_DEFINITIONS.filter((definition) => {
    const patterns = definition.patterns[family] ?? definition.patterns.all
    return patterns.some((pattern) => pattern.test(clean))
  }).map(({ id, title, summary, syntax, example }) => ({ id, title, summary, syntax, example }))
}

const STORAGE_KEY = 'psacademy.concepts.seen'

function readSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set<string>()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set<string>()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    // Un localStorage corrupto o bloqueado no debe impedir usar la aplicación.
    return new Set<string>()
  }
}

export function getSeenConceptIds(): Set<string> {
  return readSeen()
}

/** Marca la construcción como vista para no volver a mostrarla. */
export function markConceptSeen(id: string): void {
  try {
    const seen = readSeen()
    seen.add(id)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]))
  } catch {
    /* Sin persistencia seguimos funcionando: solo se repite la tarjeta. */
  }
}