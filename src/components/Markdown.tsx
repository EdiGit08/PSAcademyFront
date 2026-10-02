import type { ReactNode } from 'react'

/**
 * Markdown muy reducido para el contenido del tutorial.
 *
 * Solo entiende lo que usa ese contenido: párrafos, listas con `-`, bloques de
 * código delimitados por ``` y, dentro del texto, `código` y **negrita**. Se
 * renderiza como React (nunca con `dangerouslySetInnerHTML`), así que no hay
 * superficie de XSS aunque el texto venga del backend.
 */

type Block =
  | { kind: 'code'; language: string; code: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string }

const FENCE_PATTERN = /^```(\w*)\s*$/
const BULLET_PATTERN = /^[-*]\s+/

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    const fence = FENCE_PATTERN.exec(trimmed)
    if (fence) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        code.push(lines[index])
        index += 1
      }
      // Si el bloque no se cierra, se consume hasta el final en lugar de perder texto.
      index += 1
      blocks.push({ kind: 'code', language: fence[1] ?? '', code: code.join('\n') })
      continue
    }

    if (BULLET_PATTERN.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && BULLET_PATTERN.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(BULLET_PATTERN, ''))
        index += 1
      }
      blocks.push({ kind: 'list', items })
      continue
    }

    if (trimmed === '') {
      index += 1
      continue
    }

    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !FENCE_PATTERN.test(lines[index].trim()) &&
      !BULLET_PATTERN.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
  }

  return blocks
}

/** Convierte `código`, **negrita** y texto plano en fragmentos de React. */
function renderInline(text: string): ReactNode[] {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g
  const nodes: ReactNode[] = []
  let cursor = 0
  let key = 0

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > cursor) nodes.push(text.slice(cursor, start))

    const token = match[0]
    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-inset px-1 py-0.5 font-mono text-[0.85em] text-accent-ink"
        >
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      nodes.push(
        <strong key={key++} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>,
      )
    }

    cursor = start + token.length
  }

  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

export default function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text)

  if (blocks.length === 0) return null

  return (
    <div className="space-y-3 text-sm leading-relaxed text-body">
      {blocks.map((block, index) => {
        if (block.kind === 'code') {
          return (
            <div key={index} className="overflow-hidden rounded-lg border border-line bg-code">
              {block.language ? (
                <p className="border-b border-white/10 bg-code-chrome px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-code-ink/50">
                  {block.language}
                </p>
              ) : null}
              <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[13px] leading-relaxed text-code-ink">
                <code>{block.code}</code>
              </pre>
            </div>
          )
        }

        if (block.kind === 'list') {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5 marker:text-faint">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ul>
          )
        }

        return <p key={index}>{renderInline(block.text)}</p>
      })}
    </div>
  )
}