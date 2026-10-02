import { loader } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/java/register'
import 'monaco-editor/languages/definitions/python/register'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker: (workerId: string, label: string) => Worker
    }
  }
}

// Sin esto, `@monaco-editor/react` baja el editor desde jsdelivr en runtime y crea
// sus workers con `blob:`. En producción (Vercel) eso ata el editor al CDN y al
// CSP: si el worker no arranca, el servicio de lenguaje se queda a medias y el
// editor termina capturando las pulsaciones sin insertar el texto. Empaquetando
// Monaco en el bundle y sirviendo el worker como módulo de Vite, el editor se
// comporta igual en local y en producción.
//
// Se importa `editor.api` en lugar del paquete completo: el editor entero (con
// todos sus widgets) entra igual, pero sin los ~50 lenguajes que no usa el curso.
// Java y Python se añaden como "basic languages" y PSeint se registra en
// monacoLanguages.ts. Los tres solo necesitan el worker base para tokenizar.
window.MonacoEnvironment = {
  getWorker(): Worker {
    return new editorWorker()
  },
}

// `editor.api` cubre todo lo que usa el editor; el tipo `Monaco` del wrapper
// incluye además los servicios de lenguaje de TypeScript/JSON/CSS/HTML, que aquí
// no se registran.
loader.config({ monaco: monaco as unknown as Monaco })