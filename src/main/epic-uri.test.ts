import { describe, expect, it } from 'vitest'
import { isValidEpicLaunchUri } from './epic-uri'

const VALID =
  'com.epicgames.launcher://apps/a%20b%3Ac%3Ad%3Ae%2Ff?action=launch&silent=true'

describe('isValidEpicLaunchUri', () => {
  it('accepts the URI produced by the Epic scanner', () => {
    expect(isValidEpicLaunchUri(VALID)).toBe(true)
    expect(
      isValidEpicLaunchUri(
        'com.epicgames.launcher://apps/9773aa1aa54f4f7b80e44bef04986cea%3A530145df28a24424923f5828cc9031a1%3ASugar?action=launch&silent=true',
      ),
    ).toBe(true)
  })

  it('accepts targets produced from real Epic manifests', () => {
    expect(
      isValidEpicLaunchUri(
        'com.epicgames.launcher://apps/4de5e06a60314c12ada34d918e65cfda%3Acb96824949054b56b029fd64588e5868%3A8d3fd7a1c6034e799f04a2c8cce520a3?action=launch&silent=true',
      ),
    ).toBe(true)
  })

  it('accepts query parameters in a different order', () => {
    expect(
      isValidEpicLaunchUri(
        'com.epicgames.launcher://apps/ns%3Aid%3Aname?silent=true&action=launch',
      ),
    ).toBe(true)
  })

  it('treats the host as case-insensitive', () => {
    expect(
      isValidEpicLaunchUri(
        'com.epicgames.launcher://APPS/ns%3Aid%3Aname?action=launch&silent=true',
      ),
    ).toBe(true)
  })

  it('accepts literal (unencoded) identifier separators', () => {
    expect(
      isValidEpicLaunchUri(
        'com.epicgames.launcher://apps/ns:id:name?action=launch&silent=true',
      ),
    ).toBe(true)
  })

  it('accepts an app name that contains encoded colons', () => {
    expect(
      isValidEpicLaunchUri(
        'com.epicgames.launcher://apps/ns%3Aid%3Aname%3Awith%3Acolons?action=launch&silent=true',
      ),
    ).toBe(true)
  })

  it.each([
    ['an empty value', ''],
    ['a non-URL value', 'not a url'],
    ['another scheme', 'https://apps/ns%3Aid%3Aname?action=launch&silent=true'],
    ['another host', 'com.epicgames.launcher://other/ns%3Aid%3Aname?action=launch&silent=true'],
    ['a missing part', 'com.epicgames.launcher://apps/ns%3Aid?action=launch&silent=true'],
    ['an empty identifier field', 'com.epicgames.launcher://apps/ns%3A%3Aname?action=launch&silent=true'],
    ['an extra path segment', 'com.epicgames.launcher://apps/ns%3Aid%3Aname/extra?action=launch&silent=true'],
    ['an unexpected parameter', 'com.epicgames.launcher://apps/ns%3Aid%3Aname?action=launch&silent=true&x=1'],
    ['a duplicate parameter', 'com.epicgames.launcher://apps/ns%3Aid%3Aname?action=launch&action=launch&silent=true'],
    ['a different action', 'com.epicgames.launcher://apps/ns%3Aid%3Aname?action=install&silent=true'],
    ['a missing silent flag', 'com.epicgames.launcher://apps/ns%3Aid%3Aname?action=launch'],
    ['silent=false', 'com.epicgames.launcher://apps/ns%3Aid%3Aname?action=launch&silent=false'],
    ['a fragment', 'com.epicgames.launcher://apps/ns%3Aid%3Aname?action=launch&silent=true#x'],
    ['credentials', 'com.epicgames.launcher://user:pass@apps/ns%3Aid%3Aname?action=launch&silent=true'],
    ['a port', 'com.epicgames.launcher://apps:8080/ns%3Aid%3Aname?action=launch&silent=true'],
    ['a broken percent escape', 'com.epicgames.launcher://apps/ns%3Aid%3Aname%ZZ?action=launch&silent=true'],
    ['a control character', 'com.epicgames.launcher://apps/ns%3Aid%3A%00name?action=launch&silent=true'],
  ])('rejects %s', (_label, target) => {
    expect(isValidEpicLaunchUri(target)).toBe(false)
  })

  it('rejects an overlong value', () => {
    expect(
      isValidEpicLaunchUri(`com.epicgames.launcher://apps/${'a'.repeat(2_048)}`),
    ).toBe(false)
  })
})
