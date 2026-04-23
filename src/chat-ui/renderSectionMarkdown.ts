import React from 'react'

/**
 * Transforms the REGISTRY section body markdown to React elements WITHOUT
 * adding react-markdown. Supports only the subset used by the corpus:
 *   - `## Heading` lines (dropped — used as panel title separately)
 *   - `**bold**` inline
 *   - `- item` unordered lists
 *   - `1. item` ordered lists
 *   - fenced code blocks ```...```
 *   - blank-line-separated paragraphs
 *
 * Content is trusted (our own corpus, not user input) — no XSS sanitisation needed.
 */
export function renderSectionMarkdown(body: string): React.ReactNode {
  // Drop leading `## Heading` line(s) — rendered separately in panel header
  const withoutHeading = body.replace(/^##\s+.+$\n?/m, '').trim()

  // Split into blocks by blank lines
  const blocks = withoutHeading.split(/\n{2,}/)

  return blocks.map((block, i) => renderBlock(block, i))
}

function renderBlock(block: string, key: number): React.ReactNode {
  const trimmed = block.trim()
  if (!trimmed) return null

  // Fenced code block
  if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    const code = trimmed.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '')
    return (
      React.createElement('pre', {
        key,
        className: 'my-3 overflow-x-auto rounded bg-neutral-100 p-2 text-xs',
      },
        React.createElement('code', null, code)
      )
    )
  }

  // Unordered list
  if (trimmed.split('\n').every((ln) => /^-\s+/.test(ln))) {
    return (
      React.createElement('ul', {
        key,
        className: 'my-3 list-disc pl-5 text-sm',
      },
        trimmed.split('\n').map((ln, j) =>
          React.createElement('li', { key: j, className: 'mb-1' },
            renderInline(ln.replace(/^-\s+/, ''))
          )
        )
      )
    )
  }

  // Ordered list
  if (trimmed.split('\n').every((ln) => /^\d+\.\s+/.test(ln))) {
    return (
      React.createElement('ol', {
        key,
        className: 'my-3 list-decimal pl-5 text-sm',
      },
        trimmed.split('\n').map((ln, j) =>
          React.createElement('li', { key: j, className: 'mb-1' },
            renderInline(ln.replace(/^\d+\.\s+/, ''))
          )
        )
      )
    )
  }

  // Paragraph
  return React.createElement('p', {
    key,
    className: 'my-3 text-sm leading-relaxed',
  }, renderInline(trimmed))
}

function renderInline(text: string): React.ReactNode {
  // Split on **bold** tokens; every other fragment is bold.
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return React.createElement('strong', { key: i, className: 'font-semibold' }, part.slice(2, -2))
    }
    return React.createElement(React.Fragment, { key: i }, part)
  })
}
