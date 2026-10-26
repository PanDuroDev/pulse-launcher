import { describe, expect, it } from 'vitest'
import {
  matchRunningProcesses,
  parseProcessSnapshot,
  type GameProcessCandidate,
  type RunningProcess,
} from './game-processes'

const hades: GameProcessCandidate = {
  id: 'manual-hades',
  process: {
    executable: 'C:\\Games\\Hades\\Hades.exe',
    installDir: 'C:\\Games\\Hades',
    names: ['Hades.exe'],
  },
}

function process(
  pid: number,
  name: string,
  path: string | null,
  startedAt: number | null = 1_000,
): RunningProcess {
  return { pid, name, path, startedAt }
}

describe('matchRunningProcesses', () => {
  it('keeps the verified PID of an exact executable match', () => {
    expect(
      matchRunningProcesses(
        [hades],
        [process(4242, 'Hades.exe', 'c:\\games\\hades\\hades.exe', 1_700_000)],
      ),
    ).toEqual([
      {
        gameId: 'manual-hades',
        pid: 4242,
        startedAt: 1_700_000,
        confidence: 'exact',
        processCount: 1,
        ambiguous: false,
      },
    ])
  })

  it('matches a process inside the install directory at directory confidence', () => {
    expect(
      matchRunningProcesses(
        [hades],
        [
          process(
            77,
            'Hades-Win64-Shipping.exe',
            'C:\\Games\\Hades\\Binaries\\Hades-Win64-Shipping.exe',
          ),
        ],
      ),
    ).toEqual([
      {
        gameId: 'manual-hades',
        pid: 77,
        startedAt: 1_000,
        confidence: 'directory',
        processCount: 1,
        ambiguous: false,
      },
    ])
  })

  it('prefers the exact executable over other processes in the folder', () => {
    expect(
      matchRunningProcesses(
        [hades],
        [
          process(10, 'Hades.exe', 'C:\\Games\\Hades\\Hades.exe'),
          process(11, 'Hades-Win64-Shipping.exe', 'C:\\Games\\Hades\\Binaries\\Hades-Win64-Shipping.exe'),
        ],
      ),
    ).toEqual([
      {
        gameId: 'manual-hades',
        pid: 10,
        startedAt: 1_000,
        confidence: 'exact',
        processCount: 2,
        ambiguous: false,
      },
    ])
  })

  it('keeps the game running but drops the PID when candidates tie', () => {
    // A game that spawns two binaries from one folder: the launcher knows the
    // game is running, but must not claim either process is the main window.
    const folderOnly: GameProcessCandidate = {
      id: 'manual-hades',
      process: { installDir: 'C:\\Games\\Hades' },
    }

    const matches = matchRunningProcesses(
      [folderOnly],
      [
        process(20, 'Hades.exe', 'C:\\Games\\Hades\\Hades.exe'),
        process(21, 'HadesLauncher.exe', 'C:\\Games\\Hades\\HadesLauncher.exe'),
      ],
    )

    expect(matches).toEqual([
      {
        gameId: 'manual-hades',
        pid: null,
        startedAt: null,
        confidence: 'directory',
        processCount: 2,
        ambiguous: true,
      },
    ])
  })

  it('does not match sibling directories or helper processes', () => {
    expect(
      matchRunningProcesses(
        [hades],
        [
          process(1, 'Hades2.exe', 'C:\\Games\\Hades2\\Hades2.exe'),
          process(2, 'Launcher.exe', 'C:\\Games\\Hades\\Launcher.exe'),
          process(3, 'EasyAntiCheat.exe', 'C:\\Games\\Hades\\EasyAntiCheat\\EasyAntiCheat.exe'),
        ],
      ),
    ).toEqual([])
  })

  it('does not treat the Epic launcher as a running game', () => {
    const rocketLeague: GameProcessCandidate = {
      id: 'epic-Sugar',
      process: {
        executable:
          'C:\\Program Files\\Epic Games\\rocketleague\\Binaries\\Win64\\RocketLeague.exe',
        installDir: 'C:\\Program Files\\Epic Games\\rocketleague',
        names: ['RocketLeague.exe'],
      },
    }

    expect(
      matchRunningProcesses(
        [rocketLeague],
        [
          process(
            5,
            'EpicGamesLauncher.exe',
            'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win32\\EpicGamesLauncher.exe',
          ),
          process(
            6,
            'EpicWebHelper.exe',
            'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Extras\\EpicWebHelper\\EpicWebHelper.exe',
          ),
        ],
      ),
    ).toEqual([])

    expect(
      matchRunningProcesses(
        [rocketLeague],
        [
          process(
            7,
            'RocketLeague.exe',
            'C:\\Program Files\\Epic Games\\rocketleague\\Binaries\\Win64\\RocketLeague.exe',
          ),
        ],
      ),
    ).toEqual([
      {
        gameId: 'epic-Sugar',
        pid: 7,
        startedAt: 1_000,
        confidence: 'exact',
        processCount: 1,
        ambiguous: false,
      },
    ])
  })

  it('ignores a launcher stub even when it is the manifest executable', () => {
    const rocketLeague: GameProcessCandidate = {
      id: 'epic-Sugar',
      process: {
        executable:
          'D:\\unreal\\rocketleague\\Binaries\\Win64\\Launcher.exe',
        installDir: 'D:\\unreal\\rocketleague',
        names: ['Launcher.exe'],
      },
    }

    expect(
      matchRunningProcesses(
        [rocketLeague],
        [process(8, 'Launcher.exe', 'D:\\unreal\\rocketleague\\Binaries\\Win64\\Launcher.exe')],
      ),
    ).toEqual([])

    expect(
      matchRunningProcesses(
        [rocketLeague],
        [process(9, 'RocketLeague.exe', 'D:\\unreal\\rocketleague\\Binaries\\Win64\\RocketLeague.exe')],
      ),
    ).toEqual([
      {
        gameId: 'epic-Sugar',
        pid: 9,
        startedAt: 1_000,
        confidence: 'directory',
        processCount: 1,
        ambiguous: false,
      },
    ])
  })

  it('falls back to a name-only match when the path is unavailable', () => {
    const matches = matchRunningProcesses(
      [hades],
      [process(30, 'Hades.exe', null)],
    )

    expect(matches).toEqual([
      {
        gameId: 'manual-hades',
        pid: 30,
        startedAt: 1_000,
        confidence: 'name',
        processCount: 1,
        ambiguous: false,
      },
    ])
    expect(
      matchRunningProcesses(
        [hades],
        [process(31, 'EpicGamesLauncher.exe', null)],
      ),
    ).toEqual([])
  })

  it('deduplicates repeated PIDs from one snapshot', () => {
    expect(
      matchRunningProcesses(
        [hades],
        [
          process(40, 'Hades.exe', 'C:\\Games\\Hades\\Hades.exe'),
          process(40, 'Hades.exe', 'C:\\Games\\Hades\\Hades.exe'),
        ],
      ),
    ).toEqual([
      {
        gameId: 'manual-hades',
        pid: 40,
        startedAt: 1_000,
        confidence: 'exact',
        processCount: 1,
        ambiguous: false,
      },
    ])
  })
})

describe('parseProcessSnapshot', () => {
  it('keeps the PID and creation time with each process', () => {
    expect(
      parseProcessSnapshot(
        '[{"id":101,"name":"Hades.exe","path":"C:\\\\Games\\\\Hades.exe","startedAt":1690000000000},{"id":102,"name":"Game.exe","path":null}]',
      ),
    ).toEqual([
      {
        pid: 101,
        name: 'Hades.exe',
        path: 'C:\\Games\\Hades.exe',
        startedAt: 1_690_000_000_000,
      },
      { pid: 102, name: 'Game.exe', path: null, startedAt: null },
    ])

    expect(
      parseProcessSnapshot('{"id":103,"name":"Game.exe","path":"C:\\\\Game.exe"}'),
    ).toEqual([
      { pid: 103, name: 'Game.exe', path: 'C:\\Game.exe', startedAt: null },
    ])
  })

  it('skips entries without a usable process id', () => {
    expect(
      parseProcessSnapshot(
        '[{"id":0,"name":"A.exe"},{"id":-1,"name":"B.exe"},{"id":1.5,"name":"C.exe"},{"id":"7","name":"D.exe"},{"name":"E.exe"},{"id":9,"name":""},{"id":10,"name":"Ok.exe"},{"id":11,"name":"Bad.exe","startedAt":"x"}]',
      ),
    ).toEqual([
      { pid: 10, name: 'Ok.exe', path: null, startedAt: null },
      { pid: 11, name: 'Bad.exe', path: null, startedAt: null },
    ])
  })

  it('returns null for malformed output', () => {
    expect(parseProcessSnapshot('not-json')).toBeNull()
    expect(parseProcessSnapshot('#< CLIXML')).toBeNull()
  })
})
