import type { Monaco } from '@monaco-editor/react'

export const PSEINT_LANGUAGE_ID = 'pseint'

// Cubre el subconjunto que el traductor del backend soporta (ver doc §6) más las
// construcciones habituales de PSeint, para que el resaltado no se quede corto.
const PSEINT_KEYWORDS = [
  'Algoritmo',
  'Proceso',
  'SubAlgoritmo',
  'SubProceso',
  'Funcion',
  'Fin',
  'FinProceso',
  'FinAlgoritmo',
  'FinSi',
  'FinMientras',
  'FinPara',
  'FinRepetir',
  'FinSegun',
  'Segun',
  'Si',
  'Sino',
  'Entonces',
  'Mientras',
  'Hacer',
  'Para',
  'Hasta',
  'Con',
  'Paso',
  'Repetir',
  'Leer',
  'Escribir',
  'Sin',
  'Saltar',
  'Definir',
  'Dimension',
  'Longitud',
  'Rango',
  'Entero',
  'Real',
  'Logico',
  'Caracter',
  'Cadena',
  'Vector',
  'Matriz',
  'Verdadero',
  'Falso',
  'Es',
  'Mod',
  'Div',
  'Y',
  'O',
  'No',
  'Raiz',
  'Abs',
  'Trunc',
  'Redon',
  'Mayusculas',
  'Minusculas',
  'Aleatorio',
].join('|')

// PSeint no trae gramática en Monaco, así que sin esto el editor del alumno
// cairía en texto plano justo en uno de los tres lenguajes oficiales.
export function registerPseintLanguage(monaco: Monaco): void {
  const alreadyRegistered = monaco.languages
    .getLanguages()
    .some((language: { id: string }) => language.id === PSEINT_LANGUAGE_ID)
  if (alreadyRegistered) return

  monaco.languages.register({ id: PSEINT_LANGUAGE_ID })

  monaco.languages.setLanguageConfiguration(PSEINT_LANGUAGE_ID, {
    comments: { lineComment: '//' },
    brackets: [
      ['(', ')'],
      ['[', ']'],
    ],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  })

  monaco.languages.setMonarchTokensProvider(PSEINT_LANGUAGE_ID, {
    defaultToken: '',
    tokenPostfix: '.pseint',
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/"([^"\\]|\\.)*"?/, 'string'],
        [/'([^'\\]|\\.)*'?/, 'string'],
        [new RegExp(`\\b(${PSEINT_KEYWORDS})\\b`, 'i'), 'keyword'],
        [/\b\d+(\.\d+)?\b/, 'number'],
        [/[<>=!]=|<>|<=|>=|[+\-*/^]/, 'operator'],
        [/[A-Za-z_Ñáéíóúü][A-Za-z_Ñáéíóúü0-9]*/, 'identifier'],
        [/[()[\];,]/, 'delimiter.bracket'],
      ],
    },
  })
}
