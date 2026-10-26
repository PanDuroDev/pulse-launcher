import path from 'node:path'
import type { GameProcessHints, ProcessMatchConfidence } from '@shared/types'

export interface RunningProcess {
  /** Windows process id, kept after validation so a match has an identity. */
  pid: number
  name: string
  path: string | null
  /** Creation time in ms since epoch; guards against PID reuse after exit. */
  startedAt: number | null
}

export interface GameProcessCandidate {
  id: string
  process?: GameProcessHints
}

export interface GameRunMatch {
  gameId: string
  /**
   * Identity of the single best process, or null when several candidates tie.
   * Only a non-null value may be used to target one specific process.
   */
  pid: number | null
  startedAt: number | null
  /** Strength of the winning match. */
  confidence: ProcessMatchConfidence
  /** Number of distinct processes that matched this game. */
  processCount: number
  /** True when more than one process matched with the same strength. */
  ambiguous: boolean
}

const HELPER_PROCESS =
  /^(?:epicgameslauncher|epicwebhelper|epic.*helper|steam|steamwebhelper|steamservice|gameoverlayui|launcher|crashpad_handler|crashreportclient|unins\d*|uninstall(?:er)?|dxsetup|vcredist.*|easyanticheat.*|battleye.*|eossdk.*)(?:\.exe)?$/i

const CONFIDENCE_RANK: Record<ProcessMatchConfidence, number> = {
  exact: 3,
  directory: 2,
  name: 1,
}

function normalizePath(value: string): string {
  const stripped = value.startsWith('\\\\?\\') ? value.slice(4) : value
  return path.win32
    .normalize(stripped)
    .replace(/[\\/]+$/, '')
    .toLowerCase()
}

function directoryPrefix(value: string): string {
  return `${normalizePath(value)}\\`
}

function isHelperProcess(name: string): boolean {
  return HELPER_PROCESS.test(name)
}

function candidateNames(candidate: GameProcessHints): Set<string> {
  const names = new Set<string>()
  for (const name of candidate.names ?? []) {
    if (name) names.add(name.toLowerCase())
  }
  if (candidate.executable) {
    names.add(path.win32.basename(candidate.executable).toLowerCase())
  }
  return names
}

/**
 * Rates how well one process fits one game. Returns null when it does not fit.
 *
 * A process path that exists but matches neither the executable nor the
 * install directory is rejected even if the name matches, because a same-named
 * executable elsewhere is a different program.
 */
function matchConfidence(
  candidate: GameProcessHints,
  process: RunningProcess,
): ProcessMatchConfidence | null {
  const processName = process.name.toLowerCase()
  if (isHelperProcess(processName)) return null

  const names = candidateNames(candidate)
  const executable = candidate.executable
    ? normalizePath(candidate.executable)
    : null
  const installDir = candidate.installDir
    ? directoryPrefix(candidate.installDir)
    : null

  if (process.path) {
    const processPath = normalizePath(process.path)
    if (executable && processPath === executable) return 'exact'
    if (installDir && processPath.startsWith(installDir)) return 'directory'
    if (!executable && !installDir) {
      return names.has(processName) ? 'name' : null
    }
    return null
  }

  // Without an executable path the name is all we have, so the match can only
  // ever be reported as probable.
  return names.has(processName) ? 'name' : null
}

/**
 * Matches running processes against games and keeps the winning identity.
 *
 * The best available confidence wins. When several processes tie at that
 * level (for example a game that spawns two binaries from one folder) the
 * result is marked ambiguous and `pid` stays null: the launcher knows the game
 * is running but must not claim a single process is the game window.
 */
export function matchRunningProcesses(
  candidates: GameProcessCandidate[],
  processes: RunningProcess[],
): GameRunMatch[] {
  const seen = new Set<number>()
  const unique = processes.filter((process) => {
    if (seen.has(process.pid)) return false
    seen.add(process.pid)
    return true
  })

  const matches: GameRunMatch[] = []
  for (const candidate of candidates) {
    if (!candidate.process) continue

    const found: Array<{
      process: RunningProcess
      confidence: ProcessMatchConfidence
    }> = []
    for (const process of unique) {
      const confidence = matchConfidence(candidate.process, process)
      if (confidence) found.push({ process, confidence })
    }
    if (found.length === 0) continue

    const bestRank = Math.max(
      ...found.map((entry) => CONFIDENCE_RANK[entry.confidence]),
    )
    const best = found.filter(
      (entry) => CONFIDENCE_RANK[entry.confidence] === bestRank,
    )
    const winner = best[0]
    if (!winner) continue
    const primary = best.length === 1 ? winner.process : null

    matches.push({
      gameId: candidate.id,
      pid: primary?.pid ?? null,
      startedAt: primary?.startedAt ?? null,
      confidence: winner.confidence,
      processCount: found.length,
      ambiguous: best.length > 1,
    })
  }

  return matches.sort((left, right) => left.gameId.localeCompare(right.gameId))
}

/**
 * Parses one helper snapshot line. Entries without a usable process id are
 * skipped, because an unidentified process cannot be acted on safely.
 */
export function parseProcessSnapshot(line: string): RunningProcess[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }

  const entries: unknown[] = Array.isArray(parsed) ? parsed : [parsed]

  const processes: RunningProcess[] = []
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const pid = record.id
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) continue
    if (typeof record.name !== 'string' || record.name.length === 0) continue

    const startedAt = record.startedAt
    processes.push({
      pid,
      name: record.name,
      path:
        typeof record.path === 'string' && record.path.length > 0
          ? record.path
          : null,
      startedAt:
        typeof startedAt === 'number' &&
        Number.isFinite(startedAt) &&
        startedAt > 0
          ? startedAt
          : null,
    })
  }

  return processes
}
