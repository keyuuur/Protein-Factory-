import { gameVersion, rounds } from '../game/content/rounds'
import type { GameSessionState, RoundState, Screen, StationId } from '../types'
import type { FinalGamePayload } from '../types'

const storageKey = 'pirate-protein-factory:last-payload'
const historyStorageKey = 'pirate-protein-factory:payload-history'
const checkpointStorageKey = 'pirate-protein-factory:last-checkpoint'
const maxHistoryItems = 30

export const checkpointSchemaVersion = 'checkpoint-envelope-v3' as const

export interface CheckpointEnvelopeV3 {
  contentVersion: string
  savedAt: string
  schemaVersion: typeof checkpointSchemaVersion
  state: GameSessionState
}

export interface LocalSaveResult {
  error?: string
  ok: boolean
}

export function saveLocalResult(payload: FinalGamePayload): LocalSaveResult {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload))
    window.localStorage.setItem(historyStorageKey, JSON.stringify(upsertHistory(payload)))
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Local storage failed.',
    }
  }
}

export function saveLocalCheckpoint(state: GameSessionState): LocalSaveResult {
  const envelope: CheckpointEnvelopeV3 = {
    contentVersion: gameVersion,
    savedAt: new Date().toISOString(),
    schemaVersion: checkpointSchemaVersion,
    state,
  }

  try {
    window.localStorage.setItem(checkpointStorageKey, JSON.stringify(envelope))
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Local checkpoint failed.',
    }
  }
}

export function readLocalCheckpoint(): CheckpointEnvelopeV3 | null {
  try {
    const raw = window.localStorage.getItem(checkpointStorageKey)
    if (!raw) {
      return null
    }

    const parsed: unknown = JSON.parse(raw)
    return isCheckpointEnvelopeV3(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearLocalCheckpoint(): LocalSaveResult {
  try {
    window.localStorage.removeItem(checkpointStorageKey)
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Local checkpoint cleanup failed.',
    }
  }
}

export function readLocalResult(): FinalGamePayload | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    return raw ? (JSON.parse(raw) as FinalGamePayload) : null
  } catch {
    return null
  }
}

export function readLocalResultHistory(): FinalGamePayload[] {
  try {
    const raw = window.localStorage.getItem(historyStorageKey)
    if (!raw) {
      return []
    }

    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as FinalGamePayload[]) : []
  } catch {
    return []
  }
}

export function isCheckpointEnvelopeV3(value: unknown): value is CheckpointEnvelopeV3 {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.schemaVersion === checkpointSchemaVersion &&
    value.contentVersion === gameVersion &&
    isIsoDate(value.savedAt) &&
    isGameSessionState(value.state)
  )
}

function upsertHistory(payload: FinalGamePayload): FinalGamePayload[] {
  const history = readLocalResultHistory().filter((item) => item.attemptId !== payload.attemptId)
  return [payload, ...history].slice(0, maxHistoryItems)
}

function isGameSessionState(value: unknown): value is GameSessionState {
  if (!isRecord(value) || !isRecord(value.identity) || !isRoundState(value.roundState)) {
    return false
  }

  return (
    isNonEmptyString(value.attemptId) &&
    isScreen(value.screen) &&
    typeof value.identity.firstName === 'string' &&
    typeof value.identity.period === 'string' &&
    typeof value.identity.isDemo === 'boolean' &&
    isIntegerInRange(value.currentRoundIndex, 0, rounds.length - 1) &&
    (value.feedback === null || isRecord(value.feedback)) &&
    Array.isArray(value.roundResults) &&
    Array.isArray(value.missedSkills) &&
    isFiniteNumber(value.startedAt) &&
    (value.completedAt === null || isFiniteNumber(value.completedAt)) &&
    isFiniteNumber(value.elapsedSeconds) &&
    typeof value.isCodonWheelOpen === 'boolean' &&
    typeof value.taskDockOpen === 'boolean' &&
    (value.selectedStationId === null || isStationId(value.selectedStationId)) &&
    typeof value.saveStatus === 'string' &&
    (value.replayChallenge === null || isRecord(value.replayChallenge)) &&
    isRecord(value.runManifest) &&
    Array.isArray(value.runManifest.rounds) &&
    Array.isArray(value.transferTasks) &&
    Array.isArray(value.transferResults) &&
    Array.isArray(value.recoveredConcepts) &&
    Number.isInteger(value.currentTransferIndex)
  )
}

function isRoundState(value: unknown): value is RoundState {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.input === 'string' &&
    Array.isArray(value.answers) &&
    value.answers.every((answer) => typeof answer === 'string') &&
    Number.isInteger(value.currentCodonIndex) &&
    isFiniteNumber(value.attempts) &&
    isFiniteNumber(value.mistakes) &&
    typeof value.showHint === 'boolean' &&
    typeof value.hintUsed === 'boolean' &&
    typeof value.selectedProtein === 'string' &&
    typeof value.selectedTrait === 'string' &&
    (value.repairTarget === null || isRecord(value.repairTarget)) &&
    Array.isArray(value.supportEvents) &&
    Array.isArray(value.narrowedChoices) &&
    value.narrowedChoices.every((choice) => typeof choice === 'string')
  )
}

function isScreen(value: unknown): value is Screen {
  return ['start', 'tutorial', 'intro', 'playing', 'success', 'transfer', 'end'].includes(String(value))
}

function isStationId(value: unknown): value is StationId {
  return ['dna-dock', 'transcription-press', 'ribosome-galley', 'trait-vault'].includes(String(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}
