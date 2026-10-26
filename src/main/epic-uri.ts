const MAX_TARGET_LENGTH = 2_048
const EPIC_PROTOCOL = 'com.epicgames.launcher:'
const EPIC_HOST = 'apps'

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * Validates an Epic launch URI before it is handed to the OS.
 *
 * The expected shape is
 * `com.epicgames.launcher://apps/<namespace>:<catalogItemId>:<appName>?action=launch&silent=true`
 * with the identifier fields either percent-encoded or literal (the launcher
 * accepts both forms). Anything else (other scheme/host, extra path segments,
 * missing identifier fields, duplicate or unexpected query parameters,
 * credentials, port, or fragment) is rejected so a malformed catalog entry can
 * never be forwarded to the shell.
 */
export function isValidEpicLaunchUri(target: string): boolean {
  if (target.length === 0 || target.length > MAX_TARGET_LENGTH) return false

  let url: URL
  try {
    url = new URL(target)
  } catch {
    return false
  }

  if (url.protocol !== EPIC_PROTOCOL) return false
  if (url.hostname.toLowerCase() !== EPIC_HOST) return false
  if (url.username || url.password || url.port || url.hash) return false

  const encoded = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname
  if (!encoded || encoded.includes('/')) return false

  let decoded: string
  try {
    decoded = decodeURIComponent(encoded)
  } catch {
    return false
  }

  if (!decoded || hasControlCharacter(decoded)) return false

  // `<namespace>:<catalogItemId>:<appName>`; the app name may itself contain
  // colons, so only the minimum field count and non-empty fields are enforced.
  const fields = decoded.split(':')
  if (fields.length < 3) return false
  if (fields.some((field) => field.length === 0)) return false

  const params = [...url.searchParams.entries()]
  if (params.length !== 2) return false
  const values = new Map(params)
  if (values.size !== 2) return false

  return values.get('action') === 'launch' && values.get('silent') === 'true'
}
