export type VdfValue = string | VdfObject

export interface VdfObject {
  [key: string]: VdfValue
}

type Token =
  | { kind: 'string'; value: string }
  | { kind: 'open' }
  | { kind: 'close' }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < source.length) {
    const character = source[index]

    if (character === undefined) break

    if (character === '\uFEFF' || /\s/.test(character)) {
      index += 1
      continue
    }

    if (character === '/' && source[index + 1] === '/') {
      const newline = source.indexOf('\n', index)
      index = newline === -1 ? source.length : newline + 1
      continue
    }

    if (character === '{') {
      tokens.push({ kind: 'open' })
      index += 1
      continue
    }

    if (character === '}') {
      tokens.push({ kind: 'close' })
      index += 1
      continue
    }

    if (character === '"') {
      let value = ''
      index += 1
      while (index < source.length) {
        const current = source[index]
        if (current === '"') {
          index += 1
          break
        }
        if (current === '\\') {
          const next = source[index + 1]
          if (next === 'n') value += '\n'
          else if (next === 't') value += '\t'
          else if (next === 'r') value += '\r'
          else if (next === '"' || next === '\\') value += next
          else value += next ?? ''
          index += 2
          continue
        }
        value += current
        index += 1
      }
      tokens.push({ kind: 'string', value })
      continue
    }

    let value = ''
    while (index < source.length) {
      const current = source[index]
      if (current === undefined || /\s/.test(current) || current === '{' || current === '}') {
        break
      }
      value += current
      index += 1
    }
    if (value) tokens.push({ kind: 'string', value })
  }

  return tokens
}

export function parseVdf(source: string): VdfObject | null {
  const tokens = tokenize(source)
  let cursor = 0

  function parseObject(): VdfObject | null {
    const result: VdfObject = {}
    while (cursor < tokens.length) {
      const token = tokens[cursor]
      if (!token) break
      if (token.kind === 'close') {
        cursor += 1
        return result
      }
      if (token.kind !== 'string') return null
      const key = token.value
      cursor += 1
      const valueToken = tokens[cursor]
      if (!valueToken) return null
      if (valueToken.kind === 'string') {
        result[key] = valueToken.value
        cursor += 1
        continue
      }
      if (valueToken.kind === 'open') {
        cursor += 1
        const child = parseObject()
        if (!child) return null
        result[key] = child
        continue
      }
      return null
    }
    return result
  }

  const first = tokens[0]
  if (!first || first.kind === 'close') return null
  if (first.kind === 'open') {
    cursor = 1
    return parseObject()
  }
  return parseObject()
}

export function getVdfString(
  object: VdfObject | null | undefined,
  key: string,
): string | undefined {
  const value = object?.[key]
  return typeof value === 'string' ? value : undefined
}

export function getVdfObject(
  object: VdfObject | null | undefined,
  key: string,
): VdfObject | undefined {
  const value = object?.[key]
  return value && typeof value === 'object' ? value : undefined
}
