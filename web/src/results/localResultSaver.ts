import { contentVersion, stagesPerRun } from '../game/content/rounds'
import type {
  CheckpointEnvelopeV4,
  FinalGamePayload,
  GameSessionState,
  ProductSnapshot,
  RoundState,
  RunManifestV4,
  Screen,
} from '../types'

const storageKey = 'pirate-protein-factory:last-payload'
const historyStorageKey = 'pirate-protein-factory:payload-history'
const checkpointStorageKey = 'pirate-protein-factory:last-checkpoint'
const maxHistoryItems = 30

export const checkpointSchemaVersion = 'protein-factory-checkpoint-v4' as const

export interface LegacyLocalResult {
  attemptId: string
  schemaVersion: string
  [key: string]: unknown
}

export type LocalResultHistoryItem = FinalGamePayload | LegacyLocalResult

// Temporary source-compatibility for App.tsx while its V4 naming integration lands.
export type CheckpointEnvelopeV3 = CheckpointEnvelopeV4

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
  const envelope: CheckpointEnvelopeV4 = {
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

export function readLocalCheckpoint(): CheckpointEnvelopeV4 | null {
  try {
    const raw = window.localStorage.getItem(checkpointStorageKey)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    return isValidCheckpointEnvelopeV4(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function hasIncompatibleLocalCheckpoint(): boolean {
  try {
    const raw = window.localStorage.getItem(checkpointStorageKey)
    if (!raw) return false
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) && typeof parsed.schemaVersion === 'string' && parsed.schemaVersion !== checkpointSchemaVersion
  } catch {
    return false
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

export function readLocalResultHistory(): LocalResultHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(historyStorageKey)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isHistoricalResult) : []
  } catch {
    return []
  }
}

export function isValidCheckpointEnvelopeV4(value: unknown): value is CheckpointEnvelopeV4 {
  if (!isRecord(value)) return false

  return (
    value.schemaVersion === checkpointSchemaVersion &&
    isIsoDate(value.savedAt) &&
    isGameSessionStateV4(value.state)
  )
}

// Kept for callers that used the original predicate name.
export const isCheckpointEnvelopeV4 = isValidCheckpointEnvelopeV4

function upsertHistory(payload: FinalGamePayload): LocalResultHistoryItem[] {
  const history = readLocalResultHistory().filter((item) => item.attemptId !== payload.attemptId)
  return [payload, ...history].slice(0, maxHistoryItems)
}

function isHistoricalResult(value: unknown): value is LocalResultHistoryItem {
  return (
    isRecord(value) &&
    isNonEmptyString(value.attemptId) &&
    isNonEmptyString(value.schemaVersion)
  )
}

function isGameSessionStateV4(value: unknown): value is GameSessionState {
  if (!isRecord(value) || !isIdentity(value.identity) || !isRoundState(value.roundState)) return false
  if (!isRunManifestV4(value.runManifest)) return false
  const manifest = value.runManifest
  if (!isStageResultArray(value.roundResults, manifest)) return false
  const roundResults = value.roundResults

  return (
    isNonEmptyString(value.attemptId) &&
    isAttemptLineage(value) &&
    isScreen(value.screen) &&
    isIntegerInRange(value.currentRoundIndex, 0, stagesPerRun - 1) &&
    (value.feedback === null || isFeedback(value.feedback)) &&
    Array.isArray(value.missedSkills) &&
    Array.isArray(value.completedProducts) &&
    value.completedProducts.length <= 3 &&
    value.completedProducts.every(isProductSnapshot) &&
    isFiniteNumber(value.startedAt) &&
    (value.completedAt === null || isFiniteNumber(value.completedAt)) &&
    isFiniteNumber(value.elapsedSeconds) &&
    value.elapsedSeconds >= 0 &&
    typeof value.isCodonWheelOpen === 'boolean' &&
    ['local-draft', 'saved-local', 'failed-local'].includes(String(value.saveStatus)) &&
    (value.replayChallenge === null || isReplayChallenge(value.replayChallenge)) &&
    Array.isArray(value.transferTasks) &&
    value.transferTasks.every(isTransferTask) &&
    Array.isArray(value.transferResults) &&
    value.transferResults.every(isTransferResult) &&
    Array.isArray(value.recoveredConcepts) &&
    value.recoveredConcepts.every((category) => typeof category === 'string') &&
    Number.isInteger(value.currentTransferIndex) &&
    Number(value.currentTransferIndex) === 0 &&
    isTeacherSettings(value.settings) &&
    hasValidTiming(value) &&
    hasValidRoundStateForCurrentRound(value.roundState, manifest.rounds[Number(value.currentRoundIndex)]) &&
    hasValidStateMachinePosition(value, roundResults, manifest)
  )
}

function isAttemptLineage(value: Record<string, unknown>): boolean {
  if (value.attemptKind === 'full-run') return value.parentAttemptId === null
  return value.attemptKind === 'targeted-practice' &&
    isNonEmptyString(value.parentAttemptId) &&
    value.parentAttemptId !== value.attemptId
}

function hasValidTiming(value: Record<string, unknown>): boolean {
  const startedAt = Number(value.startedAt)
  if (value.completedAt === null) return value.screen !== 'end'
  return value.screen === 'end' && Number(value.completedAt) >= startedAt && Number(value.elapsedSeconds) >= 1
}

function hasValidRoundStateForCurrentRound(value: unknown, round: RunManifestV4['rounds'][number]): boolean {
  if (!isRecord(value)) return false
  if (round.type === 'translation') {
    return Array.isArray(value.answers) && value.answers.length === round.answers.length && value.input === ''
  }
  return Array.isArray(value.answers) && value.answers.length === 0 &&
    value.currentCodonIndex === 0 && value.pendingTranslationChoice === ''
}

function hasValidStateMachinePosition(
  value: Record<string, unknown>,
  roundResults: unknown[],
  manifest: RunManifestV4,
): boolean {
  const screen = value.screen as Screen
  const currentRoundIndex = Number(value.currentRoundIndex)
  const completedProducts = value.completedProducts as ProductSnapshot[]
  const transferTasks = value.transferTasks as unknown[]
  const transferResults = value.transferResults as unknown[]
  const expectedProducts = roundResults.filter((result) => isRecord(result) && result.stage === 'function-test').length

  if (completedProducts.length !== expectedProducts) return false
  if (completedProducts.some((product, index) => product.sequenceId !== manifest.sequenceIds[index])) return false

  if (screen === 'start' || screen === 'tutorial') {
    return currentRoundIndex === 0 && roundResults.length === 0 && completedProducts.length === 0 &&
      transferTasks.length === 0 && transferResults.length === 0 && value.completedAt === null
  }

  if (screen === 'playing') {
    const currentComplete = roundResults.length === currentRoundIndex + 1
    return value.attemptKind === 'full-run' && value.completedAt === null &&
      transferTasks.length === 0 && transferResults.length === 0 &&
      (roundResults.length === currentRoundIndex || currentComplete) &&
      (!currentComplete || (manifest.rounds[currentRoundIndex].type !== 'protein' && isSuccessFeedback(value.feedback)))
  }

  if (screen === 'sequence-transition') {
    return value.attemptKind === 'full-run' && value.completedAt === null && currentRoundIndex % 3 === 2 &&
      roundResults.length === currentRoundIndex + 1 && completedProducts.length === (currentRoundIndex + 1) / 3 &&
      transferTasks.length === 0 && transferResults.length === 0 && isSuccessFeedback(value.feedback)
  }

  const hasBaselineEvidence = currentRoundIndex === stagesPerRun - 1 &&
    roundResults.length === stagesPerRun && completedProducts.length === 3
  if (!hasBaselineEvidence) return false

  if (screen === 'transfer') {
    return value.attemptKind === 'targeted-practice' && value.completedAt === null &&
      value.saveStatus === 'local-draft' && transferTasks.length === 1 && transferResults.length === 0
  }

  if (value.attemptKind === 'targeted-practice') {
    return transferTasks.length === 1 && transferResults.length === 1
  }
  return transferTasks.length === 0 && transferResults.length === 0
}

function isSuccessFeedback(value: unknown): boolean {
  return isRecord(value) && value.kind === 'success'
}

function isRoundState(value: unknown): value is RoundState {
  if (!isRecord(value)) return false

  return (
    typeof value.input === 'string' &&
    Array.isArray(value.answers) &&
    value.answers.length <= 5 &&
    value.answers.every((answer) => typeof answer === 'string') &&
    isIntegerInRange(value.currentCodonIndex, 0, 4) &&
    typeof value.pendingTranslationChoice === 'string' &&
    isNonNegativeFiniteNumber(value.attempts) &&
    isNonNegativeFiniteNumber(value.mistakes) &&
    typeof value.showHint === 'boolean' &&
    typeof value.hintUsed === 'boolean' &&
    typeof value.selectedFunctionRowId === 'string' &&
    (value.repairTarget === null || isRepairTarget(value.repairTarget)) &&
    Array.isArray(value.supportEvents) &&
    Array.isArray(value.narrowedChoices) &&
    value.narrowedChoices.every((choice) => typeof choice === 'string')
  )
}

function isRunManifestV4(value: unknown): value is RunManifestV4 {
  if (!isRecord(value)) return false
  return (
    value.schemaVersion === 'protein-factory-v4' &&
    value.contentVersion === contentVersion &&
    isNonEmptyString(value.seed) &&
    Number.isInteger(value.selectionIndex) &&
    Number(value.selectionIndex) >= 0 &&
    isNonEmptyString(value.familyId) &&
    isTupleOfNonEmptyStrings(value.sequenceIds, 3) &&
    new Set(value.sequenceIds).size === 3 &&
    Array.isArray(value.effects) &&
    value.effects.length === 2 &&
    value.effects[0] === 'same-chain' &&
    value.effects[1] === 'amino-acid-change' &&
    Array.isArray(value.rounds) &&
    value.rounds.length === stagesPerRun &&
    value.rounds.every((round, index) => isManifestRound(round, index, value))
  )
}

function isManifestRound(value: unknown, index: number, manifest: Record<string, unknown>): boolean {
  if (!isRecord(value) || !isRecord(value.context)) return false
  const sequenceIndex = Math.floor(index / 3)
  const expectedTypes = ['transcription', 'translation', 'protein']
  const expectedActions = ['transcription', 'translation', 'function-test']
  const sequenceIds = manifest.sequenceIds as unknown[]
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.prompt) &&
    value.type === expectedTypes[index % 3] &&
    value.context.action === expectedActions[index % 3] &&
    value.context.familyId === manifest.familyId &&
    value.context.sequenceIndex === sequenceIndex &&
    value.context.sequenceId === sequenceIds[sequenceIndex] &&
    isProteinSequence(value.context.sequence)
  )
}

function isProteinSequence(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.dnaStrand) && value.dnaStrand.length === 15 &&
    isNonEmptyString(value.mrna) && value.mrna.length === 15 &&
    isTupleOfNonEmptyStrings(value.mrnaCodons, 5) &&
    isTupleOfNonEmptyStrings(value.translatedSignals, 5) &&
    value.translatedSignals[4] === 'Stop' &&
    isTupleOfNonEmptyStrings(value.aminoAcidChain, 4) &&
    isNonEmptyString(value.functionRowId)
  )
}

function isStageResultArray(value: unknown, manifest: RunManifestV4): value is unknown[] {
  if (!Array.isArray(value) || value.length > stagesPerRun) return false
  const seen = new Set<string>()
  return value.every((result, index) => {
    if (!isRecord(result) || seen.has(String(result.id))) return false
    const manifestRound = manifest.rounds[index]
    const sequenceIndex = Math.floor(index / 3)
    seen.add(String(result.id))
    return (
      result.id === manifestRound.id &&
      result.round === index + 1 &&
      result.familyId === manifest.familyId &&
      result.sequenceId === manifest.sequenceIds[sequenceIndex] &&
      result.sequenceIndex === sequenceIndex &&
      typeof result.correct === 'boolean' &&
      typeof result.independent === 'boolean' &&
      isNonNegativeFiniteNumber(result.attempts) &&
      isNonNegativeFiniteNumber(result.repairs) &&
      Array.isArray(result.supportEvents) &&
      result.supportEvents.every(isSupportEvent)
    )
  })
}

function isSupportEvent(value: unknown): boolean {
  return isRecord(value) &&
    ['error-location-rule', 'narrowed-choices', 'explicit-hint', 'reference-wheel'].includes(String(value.kind)) &&
    isNonNegativeFiniteNumber(value.attempt) &&
    typeof value.affectsIndependence === 'boolean' &&
    typeof value.rule === 'string' &&
    Array.isArray(value.choices)
}

function isTransferTask(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.id) && isNonEmptyString(value.sourceFamilyId) &&
    ['transcription', 'translation', 'function-test'].includes(String(value.targetStage)) &&
    isNonEmptyString(value.expected) && Array.isArray(value.options) && value.options.every(isNonEmptyString)
}

function isTransferResult(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.taskId) && isNonEmptyString(value.sourceFamilyId) &&
    typeof value.submitted === 'string' && isNonEmptyString(value.expected) && typeof value.recovered === 'boolean'
}

function isProductSnapshot(value: unknown): value is ProductSnapshot {
  if (!isRecord(value)) return false
  return (
    isNonEmptyString(value.sequenceId) &&
    ['original', 'same-chain-variant', 'changed-chain-variant'].includes(String(value.sequenceRole)) &&
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.dnaStrand) &&
    isNonEmptyString(value.mrna) &&
    Array.isArray(value.aminoAcidChain) &&
    value.aminoAcidChain.length === 4 &&
    value.aminoAcidChain.every((item) => isNonEmptyString(item)) &&
    isNonEmptyString(value.functionRowId) &&
    isNonEmptyString(value.proteinFunction) &&
    isNonEmptyString(value.expressedTrait) &&
    ['black', 'brown', 'tan', 'white'].includes(String(value.traitColor))
  )
}

function isRepairTarget(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    ['base', 'codon', 'function-row'].includes(String(value.kind)) &&
    Number.isInteger(value.index) &&
    Number(value.index) >= 0 &&
    typeof value.expected === 'string' &&
    typeof value.submitted === 'string' &&
    isNonEmptyString(value.category) &&
    isNonEmptyString(value.label)
  )
}

function isIdentity(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.firstName === 'string' &&
    typeof value.period === 'string' &&
    typeof value.isDemo === 'boolean'
  )
}

function isFeedback(value: unknown): boolean {
  return (
    isRecord(value) &&
    ['success', 'error', 'info'].includes(String(value.kind)) &&
    typeof value.title === 'string' &&
    typeof value.message === 'string' &&
    (value.detail === undefined || typeof value.detail === 'string')
  )
}

function isReplayChallenge(value: unknown): boolean {
  return (
    isRecord(value) &&
    ['no-hint-round', 'repair-round', 'perfect-run'].includes(String(value.type)) &&
    isNonNegativeFiniteNumber(value.baselineMistakes) &&
    typeof value.label === 'string'
  )
}

function isTeacherSettings(value: unknown): boolean {
  return (
    isRecord(value) &&
    ['standard', 'guided'].includes(String(value.supportMode)) &&
    typeof value.soundEnabled === 'boolean' &&
    ['full', 'targeted'].includes(String(value.replayMode))
  )
}

function isScreen(value: unknown): value is Screen {
  return ['start', 'tutorial', 'playing', 'sequence-transition', 'transfer', 'end'].includes(String(value))
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

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isTupleOfNonEmptyStrings(value: unknown, length: number): value is string[] {
  return Array.isArray(value) && value.length === length && value.every(isNonEmptyString)
}
