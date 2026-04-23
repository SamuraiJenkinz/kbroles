// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderSectionMarkdown } from '../renderSectionMarkdown'
import React from 'react'
import { render } from '@testing-library/react'

/**
 * Helper to render the output of renderSectionMarkdown in a container div
 * so we can query the resulting DOM.
 */
function renderMarkdown(body: string) {
  const node = renderSectionMarkdown(body)
  const wrapper = React.createElement('div', null, node)
  return render(wrapper)
}

describe('renderSectionMarkdown', () => {

  // Test 1: Renders paragraph
  it('renders plain text as a paragraph', () => {
    const { container } = renderMarkdown('Hello world')
    const p = container.querySelector('p')
    expect(p).not.toBeNull()
    expect(p?.textContent).toBe('Hello world')
  })

  // Test 2: Strips ## Heading line
  it('strips leading ## Heading line — output has no h2 and body text is in a paragraph', () => {
    const { container } = renderMarkdown('## Heading\n\nBody text here')
    expect(container.querySelector('h2')).toBeNull()
    const p = container.querySelector('p')
    expect(p).not.toBeNull()
    expect(p?.textContent).toBe('Body text here')
  })

  // Test 3: Renders **bold** as <strong>
  it('renders **bold** as <strong>', () => {
    const { container } = renderMarkdown('This is **bold** text')
    const strong = container.querySelector('strong')
    expect(strong).not.toBeNull()
    expect(strong?.textContent).toBe('bold')
  })

  // Test 4: Renders unordered list
  it('renders - item list as <ul><li>...</li></ul>', () => {
    const { container } = renderMarkdown('- item one\n- item two')
    const ul = container.querySelector('ul')
    expect(ul).not.toBeNull()
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toBe('item one')
    expect(items[1].textContent).toBe('item two')
  })

  // Test 5: Renders ordered list
  it('renders 1. 2. list as <ol><li>...</li></ol>', () => {
    const { container } = renderMarkdown('1. alpha\n2. beta')
    const ol = container.querySelector('ol')
    expect(ol).not.toBeNull()
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toBe('alpha')
    expect(items[1].textContent).toBe('beta')
  })

  // Test 6: Renders fenced code block
  it('renders fenced code block as <pre><code>...</code></pre>', () => {
    const body = '```\nsome code here\n```'
    const { container } = renderMarkdown(body)
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    const code = container.querySelector('code')
    expect(code).not.toBeNull()
    expect(code?.textContent).toContain('some code here')
  })

  // Test 7: Mixed blocks survive block separation
  it('mixed paragraph + list + paragraph produces distinct blocks', () => {
    const body = 'First paragraph.\n\n- item one\n- item two\n\nSecond paragraph.'
    const { container } = renderMarkdown(body)
    const paragraphs = container.querySelectorAll('p')
    const lists = container.querySelectorAll('ul')
    expect(paragraphs.length).toBeGreaterThanOrEqual(2)
    expect(lists).toHaveLength(1)
  })

  // Test 8: Registry smoke test — real KB0020882 section body renders without crash
  it('real KB0020882 naming-convention body renders non-empty output without crash', () => {
    // A realistic section body from the registry.
    // Blank lines between blocks are required for the block splitter (\n{2,}).
    const realBody = [
      '## Article Naming Convention',
      '',
      'Article titles go in the **Short description** field. Format:',
      '',
      '```',
      '[Application/Topic] - [Type Descriptor] - [OPCO or Line of Business] - [Region]',
      '```',
      '',
      '- 160 character hard limit.',
      '- Region options: EMEA, NASA, APAC, Global.',
    ].join('\n')

    const { container } = renderMarkdown(realBody)
    expect(container.textContent?.length).toBeGreaterThan(0)
    // Should have at least a paragraph and a list
    expect(container.querySelector('ul')).not.toBeNull()
  })

  // Test 9: Empty body produces no crash (empty or null output)
  it('empty body produces no crash', () => {
    expect(() => renderMarkdown('')).not.toThrow()
  })

  // Test 10: Multiple ** bold spans in one line
  it('renders multiple bold spans in one paragraph', () => {
    const { container } = renderMarkdown('This is **first** and **second** bold')
    const strongs = container.querySelectorAll('strong')
    expect(strongs).toHaveLength(2)
    expect(strongs[0].textContent).toBe('first')
    expect(strongs[1].textContent).toBe('second')
  })

})
