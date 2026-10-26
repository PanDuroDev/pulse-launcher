import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { manualGameFromExecutable, manualGameId, manualGameToRecord } from './manual'

describe('manualGameFromExecutable', () => {
  it('accepts executables and shortcuts', () => {
    const executable = 'C:\\Games\\Hades\\Hades.exe'
    const game = manualGameFromExecutable(executable, 123)

    expect(game).toEqual({
      id: manualGameId(executable),
      name: 'Hades',
      executable,
      addedAt: 123,
    })
  })

  it('accepts .lnk files and preserves the file name', () => {
    const game = manualGameFromExecutable('C:\\Users\\Player\\Desktop\\Control.lnk')

    expect(game?.name).toBe('Control')
  })

  it('rejects unsupported extensions and empty names', () => {
    expect(manualGameFromExecutable('C:\\Games\\readme.txt')).toBeNull()
    expect(manualGameFromExecutable('C:\\Games\\.exe')).toBeNull()
  })

  it('creates a stable id from the normalized path', () => {
    expect(manualGameId('C:\\Games\\Hades\\Hades.exe')).toBe(
      manualGameId('c:\\games\\hades\\hades.exe'),
    )
  })
})

describe('manualGameToRecord', () => {
  it('maps executables and shortcuts to the matching launch kind', () => {
    const executable = manualGameFromExecutable('C:\\Games\\Hades\\Hades.exe')
    const shortcut = manualGameFromExecutable('C:\\Games\\Hades\\Hades.lnk')

    expect(executable && manualGameToRecord(executable).launch).toEqual({
      kind: 'exe',
      target: 'C:\\Games\\Hades\\Hades.exe',
      workDir: path.dirname('C:\\Games\\Hades\\Hades.exe'),
    })
    expect(shortcut && manualGameToRecord(shortcut).launch).toEqual({
      kind: 'shortcut',
      target: 'C:\\Games\\Hades\\Hades.lnk',
      workDir: path.dirname('C:\\Games\\Hades\\Hades.lnk'),
    })
    expect(executable && manualGameToRecord(executable).process).toEqual({
      executable: path.resolve('C:\\Games\\Hades\\Hades.exe'),
      installDir: path.dirname(path.resolve('C:\\Games\\Hades\\Hades.exe')),
      names: ['Hades.exe'],
    })
    expect(shortcut && manualGameToRecord(shortcut).process).toBeUndefined()
  })
})
