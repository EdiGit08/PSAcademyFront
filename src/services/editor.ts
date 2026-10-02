import type { ComponentProps } from 'react'
import type Editor from '@monaco-editor/react'
import { PSEINT_LANGUAGE_ID } from './monacoLanguages'

/**
 * Ajustes compartidos por todos los editores de código (workspace y tutorial).
 *
 * Viven en un módulo y no dentro de un componente a propósito: si el objeto se
 * creara en cada render, Monaco recibiría `updateOptions` en cada pulsación y su
 * popup de sugerencias se quedaría pegado al caret, escribiendo el código del
 * alumno dentro de un widget flotante en lugar de insertarlo en el editor.
 */

const MONACO_LANGUAGES: Record<string, string> = {
  pseint: PSEINT_LANGUAGE_ID,
  pseudocode: PSEINT_LANGUAGE_ID,
  pseudo: PSEINT_LANGUAGE_ID,
  python: 'python',
  py: 'python',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  csharp: 'csharp',
  'c#': 'csharp',
  cs: 'csharp',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
}

export function toMonacoLanguage(slug: string): string {
  return MONACO_LANGUAGES[slug.trim().toLowerCase()] ?? 'plaintext'
}

export const EDITOR_OPTIONS: NonNullable<ComponentProps<typeof Editor>['options']> = {
  automaticLayout: true,
  fontSize: 13,
  fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderLineHighlight: 'line',
  lineNumbersMinChars: 3,
  tabSize: 4,
  insertSpaces: true,
  wordWrap: 'on',
  padding: { top: 16, bottom: 16 },
  ariaLabel: 'Editor de código',
  // Sin UI flotante que compita con la escritura: sugerencias, ayuda de
  // parámetros, hover y texto fantasma se gestionan desde el traductor del
  // backend y el botón Ejecutar, no sobre el código del alumno.
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  acceptSuggestionOnEnter: 'off',
  acceptSuggestionOnCommitCharacter: false,
  parameterHints: { enabled: false },
  hover: { enabled: 'off' },
  inlineSuggest: { enabled: false },
  suggest: { showWords: false },
  occurrencesHighlight: 'off',
  codeLens: false,
}