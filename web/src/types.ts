import type { AminoAcidAbbreviation } from './game/content/codonTable'

export type RoundType = 'transcription' | 'translation' | 'protein'
export type Screen = 'start' | 'tutorial' | 'playing' | 'sequence-transition' | 'transfer' | 'end'
export type StationId = 'transcription-press' | 'ribosome-galley' | 'trait-vault'
export type FeedbackKind = 'success' | 'error' | 'info'
export type SaveStatus = 'local-draft' | 'saved-local' | 'failed-local'
export type SupportMode = 'standard' | 'guided'
export type ReplayMode = 'full' | 'targeted'
export type AttemptKind = 'full-run' | 'targeted-practice'
export type ProductionAction = 'transcription' | 'translation' | 'function-test'
export type MolecularState = 'dna' | 'mrna' | 'amino-acid-chain' | 'protein-function'
export type MutationEffect = 'same-chain' | 'amino-acid-change'
export type SequenceEffect = 'original' | MutationEffect
export type SequenceRole = 'original' | 'same-chain-variant' | 'changed-chain-variant'
export type ProductionRating = 'Precision' | 'Stable' | 'Supported' | 'Recalibration'

export type MisconceptionCategory =
  | 'rna-template-pairing'
  | 'rna-uses-u'
  | 'codon-lookup'
  | 'codon-grouping'
  | 'stop-signal'
  | 'protein-trait-model'
  | 'incomplete'
  | 'hint-support'

export interface FunctionReferenceRow {
  id: string
  aminoAcidSequence: [AminoAcidAbbreviation, AminoAcidAbbreviation, AminoAcidAbbreviation, AminoAcidAbbreviation]
  proteinFunction: string
  expressedTrait: string
  traitColor: 'black' | 'brown' | 'tan' | 'white'
}

export interface ProteinSequence {
  id: string
  role: SequenceRole
  effect: SequenceEffect
  dnaStrand: string
  mrna: string
  mrnaCodons: [string, string, string, string, string]
  translatedSignals: [AminoAcidAbbreviation, AminoAcidAbbreviation, AminoAcidAbbreviation, AminoAcidAbbreviation, 'Stop']
  aminoAcidChain: [AminoAcidAbbreviation, AminoAcidAbbreviation, AminoAcidAbbreviation, AminoAcidAbbreviation]
  functionRowId: string
  changedDnaIndex: number | null
}

export interface ProteinSequenceFamily {
  id: string
  name: string
  original: ProteinSequence
  sameChainVariant: ProteinSequence
  changedChainVariant: ProteinSequence
}

export interface StageContext {
  action: ProductionAction
  familyId: string
  sequenceId: string
  sequenceRole: SequenceRole
  sequenceEffect: SequenceEffect
  sequenceIndex: 0 | 1 | 2
  sequence: ProteinSequence
}

export interface RepairTarget {
  kind: 'base' | 'codon' | 'function-row'
  index: number
  expected: string
  submitted: string
  category: MisconceptionCategory
  label: string
}

export interface SupportEvent {
  kind: 'error-location-rule' | 'narrowed-choices' | 'explicit-hint' | 'reference-wheel'
  attempt: number
  action: ProductionAction
  location: string
  rule: string
  choices: string[]
  affectsIndependence: boolean
}

export interface ReplayChallenge {
  type: 'no-hint-round' | 'repair-round' | 'perfect-run'
  roundId?: string
  roundTitle?: string
  baselineMistakes: number
  label: string
}

export interface TranscriptionRound {
  id: string
  type: 'transcription'
  title: string
  shortTitle: string
  prompt: string
  template: string
  answer: string
  options: ['A', 'U', 'C', 'G']
  hint: string
  context: StageContext
}

export interface TranslationRound {
  id: string
  type: 'translation'
  title: string
  shortTitle: string
  prompt: string
  codons: [string, string, string, string, string]
  answers: [AminoAcidAbbreviation, AminoAcidAbbreviation, AminoAcidAbbreviation, AminoAcidAbbreviation, 'Stop']
  mode: 'perCodon'
  codonChoices: string[][]
  hint: string
  context: StageContext
}

export interface ProteinRound {
  id: string
  type: 'protein'
  title: string
  shortTitle: string
  prompt: string
  chain: string
  referenceRows: FunctionReferenceRow[]
  correctRowId: string
  hint: string
  context: StageContext
}

export type GameRound = TranscriptionRound | TranslationRound | ProteinRound

export interface RunManifestV4 {
  schemaVersion: 'protein-factory-v4'
  contentVersion: string
  seed: string
  selectionIndex: number
  familyId: string
  sequenceIds: [string, string, string]
  effects: ['same-chain', 'amino-acid-change']
  rounds: GameRound[]
}

export type RunManifest = RunManifestV4

export interface RoundState {
  input: string
  answers: string[]
  currentCodonIndex: number
  pendingTranslationChoice: string
  attempts: number
  mistakes: number
  showHint: boolean
  hintUsed: boolean
  selectedFunctionRowId: string
  repairTarget: RepairTarget | null
  supportEvents: SupportEvent[]
  narrowedChoices: string[]
}

export interface StageResult {
  round: number
  id: string
  type: RoundType
  title: string
  prompt: string
  correct: boolean
  expected: string
  submitted: string
  attempts: number
  mistakes: number
  firstTryCorrect: boolean
  hintUsed: boolean
  chain?: string
  selectedFunctionRowId?: string
  expectedFunctionRowId?: string
  stage: ProductionAction
  familyId: string
  sequenceId: string
  sequenceRole: SequenceRole
  sequenceEffect: SequenceEffect
  sequenceIndex: 0 | 1 | 2
  independent: boolean
  repairs: number
  supportLevel: 0 | 1 | 2 | 3
  supportEvents: SupportEvent[]
  sequence: ProteinSequence
}

export type RoundResult = StageResult

export interface Feedback {
  kind: FeedbackKind
  title: string
  message: string
  detail?: string
}

export interface StationDefinition {
  id: StationId
  roundType: RoundType
  action: ProductionAction
  title: string
  shortTitle: string
  prompt: string
}

export interface MissedSkill {
  round: number
  roundId: string
  type: RoundType
  skillId: string
  title: string
  expected: string
  submitted: string
  attempts: number
  reason: 'mistake' | 'incomplete' | 'hint'
  category: MisconceptionCategory
}

export type TransferStimulus =
  | {
      kind: 'transcription'
      dnaTemplate: string
    }
  | {
      kind: 'translation'
      mrnaCodons: [string, string, string, string, string]
    }
  | {
      kind: 'function-test'
      aminoAcidChain: [AminoAcidAbbreviation, AminoAcidAbbreviation, AminoAcidAbbreviation, AminoAcidAbbreviation]
      referenceRows: FunctionReferenceRow[]
    }

export interface TransferTask {
  id: string
  sourceFamilyId: string
  targetStage: ProductionAction
  targetCategory: MisconceptionCategory
  skillLabel: string
  prompt: string
  evidencePrompt: string
  stimulus: TransferStimulus
  expected: string
  options: string[]
  correctiveFeedback: string
  attempts: number
  submittedAnswers: string[]
}

export interface TransferResult {
  taskId: string
  sourceFamilyId: string
  targetStage: ProductionAction
  targetCategory: MisconceptionCategory
  skillLabel: string
  evidence: string
  submitted: string
  submittedAnswers: string[]
  expected: string
  attempts: number
  correctiveFeedbackShown: boolean
  outcome: 'recovered' | 'not-yet-recovered'
  recovered: boolean
}

export interface ProductSnapshot {
  sequenceId: string
  sequenceRole: SequenceRole
  label: string
  dnaStrand: string
  mrna: string
  aminoAcidChain: string[]
  functionRowId: string
  proteinFunction: string
  expressedTrait: string
  traitColor: FunctionReferenceRow['traitColor']
}

export interface StudentIdentity {
  firstName: string
  isDemo: boolean
  period: string
}

export interface TeacherSettings {
  supportMode: SupportMode
  soundEnabled: boolean
  replayMode: ReplayMode
}

export interface GameSessionState {
  attemptId: string
  attemptKind: AttemptKind
  parentAttemptId: string | null
  screen: Screen
  identity: StudentIdentity
  currentRoundIndex: number
  roundState: RoundState
  feedback: Feedback | null
  roundResults: RoundResult[]
  missedSkills: MissedSkill[]
  completedProducts: ProductSnapshot[]
  startedAt: number
  completedAt: number | null
  elapsedSeconds: number
  isCodonWheelOpen: boolean
  saveStatus: SaveStatus
  replayChallenge: ReplayChallenge | null
  runManifest: RunManifestV4
  transferTasks: TransferTask[]
  transferResults: TransferResult[]
  recoveredConcepts: MisconceptionCategory[]
  currentTransferIndex: number
  settings: TeacherSettings
}

export interface FinalGamePayload {
  schemaVersion: 'protein-factory-v4'
  attemptId: string
  attemptKind: AttemptKind
  parentAttemptId: string | null
  timestamp: string
  game: string
  gameVersion: string
  classPeriod: string
  studentName: string
  isDemo: boolean
  score: number
  maxScore: 9
  roundsCompleted: number
  totalRounds: 9
  percent: number
  completionPercent: number
  independencePercent: number
  attempts: number
  mistakes: number
  cleanRounds: number
  supportedRounds: number
  factoryRating: ProductionRating
  productionRating: ProductionRating
  independentStages: number
  repairs: number
  replayGoal: string
  activeReplayChallenge: string
  replayChallengeMet: boolean
  reviewSummary: string[]
  timeSpent: number
  completionStatus: 'Completed' | 'Incomplete'
  currentRound: number
  submitType: 'Final Submit'
  roundResults: RoundResult[]
  missedSkills: MissedSkill[]
  runManifest: RunManifestV4
  stageResults: StageResult[]
  completedProducts: ProductSnapshot[]
  transferResults: TransferResult[]
  recoveredConcepts: MisconceptionCategory[]
}

export interface AppsScriptAttemptPayload {
  attemptId: string
  firstName: string
  period: string
  score: number
  percent: number
  completedStatus: 'Completed' | 'Incomplete'
  roundsCompleted: number
  totalRounds: number
  timeSpentSeconds: number
  currentRound: number
  isAutosave: boolean
  isFinalSubmit: boolean
  responses: Array<Record<string, unknown>>
  roundResults: RoundResult[]
  userAgent: string
  schemaVersion: string
  familyId: string
  sequenceIds: [string, string, string]
  completedProducts: ProductSnapshot[]
}

export interface CheckpointEnvelopeV4 {
  schemaVersion: 'protein-factory-checkpoint-v4'
  savedAt: string
  state: GameSessionState
}

export interface ProteinFactoryAttemptV4 extends FinalGamePayload {}

export interface FactorySceneState {
  activeStationId: StationId
  completedStationIds: StationId[]
  inputLocked: boolean
  progress: number
  sequenceIndex: 0 | 1 | 2
  activeAction: ProductionAction
  cargoLabel: string
  statusKind: FeedbackKind
  repairActive: boolean
  activeStationLabel: string
  dnaStrand: string
  mrna: string
  aminoAcidChain: string[]
  selectedFunctionRowId: string
  completedProducts: ProductSnapshot[]
  transitionActive: boolean
}
