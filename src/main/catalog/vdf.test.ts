import { describe, expect, it } from 'vitest'
import { getVdfObject, getVdfString, parseVdf } from './vdf'

describe('parseVdf', () => {
  it('parses nested objects, quoted values, and comments', () => {
    const source = `
      // library metadata
      "libraryfolders"
      {
        "0"
        {
          "path" "C:\\\\Program Files (x86)\\\\Steam"
          "label" "Steam"
        }
        "contentstatsid" "12345"
      }
    `

    const parsed = parseVdf(source)
    const folders = getVdfObject(parsed, 'libraryfolders')
    const first = getVdfObject(folders, '0')

    expect(getVdfString(first, 'path')).toBe('C:\\Program Files (x86)\\Steam')
    expect(getVdfString(first, 'label')).toBe('Steam')
    expect(getVdfString(folders, 'contentstatsid')).toBe('12345')
  })

  it('supports escapes and bare keys', () => {
    const parsed = parseVdf('AppState { appid "730" name "Counter-Strike 2" note "a\\tb" }')

    expect(getVdfString(getVdfObject(parsed, 'AppState'), 'name')).toBe('Counter-Strike 2')
    expect(getVdfString(getVdfObject(parsed, 'AppState'), 'note')).toBe('a\tb')
  })

  it('returns null for malformed input', () => {
    expect(parseVdf('AppState { name }')).toBeNull()
    expect(parseVdf('}')).toBeNull()
    expect(parseVdf('')).toBeNull()
  })
})
