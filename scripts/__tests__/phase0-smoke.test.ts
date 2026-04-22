import { describe, it, expect } from 'vitest'
import { parseCliArgs } from '../phase0-smoke'

describe('parseCliArgs', () => {
  it('parses --mode=dev', () => {
    expect(parseCliArgs(['--mode=dev'])).toEqual({ mode: 'dev' })
  })
  it('parses --mode=prod', () => {
    expect(parseCliArgs(['--mode=prod'])).toEqual({ mode: 'prod' })
  })
  it('parses --mode=dev when mixed with other args', () => {
    expect(parseCliArgs(['--other', '--mode=dev', '--foo=bar'])).toEqual({ mode: 'dev' })
  })
  it('throws on missing --mode', () => {
    expect(() => parseCliArgs([])).toThrow(/Missing or invalid --mode/)
  })
  it('throws on invalid --mode value', () => {
    expect(() => parseCliArgs(['--mode=staging'])).toThrow(/Missing or invalid --mode/)
  })
})
