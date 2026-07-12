export type RoundType = 'dna' | 'transcription' | 'translation' | 'protein'

export type Screen = 'start' | 'tutorial' | 'intro' | 'playing' | 'success' | 'transfer' | 'end'

export type StationId = 'dna-dock' | 'transcription-press' | 'ribosome-galley' | 'trait-vault'

export type FeedbackKind = 'success' | 'error' | 'info'

export type SaveStatus = 'local-draft' | 'saved-local' | 'failed-local'

export type SupportMode = 'standard' | 'guided'

export type ReplayMode = 'full' | 'targeted'

export type ProductionStage = 'dna-assembly' | 'transcription' | 'translation' | 'function-test'

export type MutationEffect = 'no-change' | 'amino-acid-change' | 'early-stop'

export type OrderRole = 'normal' | 'one-base-variant'

export type ProductionRating = 'Precision' | 'Stable' | 'Supported' | 'Recalibration'

export type MisconceptionCategory =
  | 'dna-base-pairing'
  | 'rna-template-pairing'
  | 'rna-uses-u'
  | 'codon-lookup'
  | 'codon-grouping'
  | 'protein-trait-model'
  | 'incomplete'
  | 'hint-support'

export interface ProductionSequence {
  codingDna: string
  templateDna: string
  mrna: string
  mrnaCodons: [string, string, string, string]
  translatedSlots: [string, string, string, string]
  proteinChain: string[]
  functionOutcome: string
}

export interface ProteinOrder {
  id: string
  name: string
  role: OrderRole
  sequence: ProductionSequence
}

export interface ProteinOrderPair {
  id: string
  effect: MutationEffect
  changedMrnaIndex: number
  normal: ProteinOrder
  variant: ProteinOrder
}

export interface StageContext {
  stage: ProductionStage
  pairId: string
  orderId: string
  orderRole: OrderRole
  effect: MutationEffect
  sequence: ProductionSequence
}

export interface RepairTarget {
  kind: 'base' | 'codon' | 'protein'
  index: number
  expected: string
  submitted: string
  category: MisconceptionCategory
  label: string
}

export interface SupportEvent {
  kind: 'error-location-rule' | 'narrowed-choices' | 'explicit-hint' | 'codon-chart'
  attempt: number
  stage: ProductionStage
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

export interface BaseRound {
  id: string
  type: 'dna' | 'transcription'
  title: string
  shortTitle: string
  prompt: string
  template: string
  answer: string
  options: string[]
  hint: string
  context: StageContext
}

export interface TranslationRound {
  id: string
  type: 'translation'
  title: string
  shortTitle: string
  prompt: string
  codons: string[]
  answers: string[]
  mode: 'perCodon' | 'full'
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
  options: ProteinOption[]
  correctTrait: string
  hint: string
  context: StageContext
}

export interface ProteinOption {
  protein: string
  trait: string
  clue?: string
}

export type GameRound = BaseRound | TranslationRound | ProteinRound

export interface RunManifest {
  schemaVersion: 'protein-factory-v3'
  seed: string
  selectionIndex: number
  pairId: string
  effect: MutationEffect
  orderIds: [string, string]
  rounds: GameRound[]
}

export interface RoundState {
  input: string
  answers: string[]
  currentCodonIndex: number
  attempts: number
  mistakes: number
  showHint: boolean
  hintUsed: boolean
  selectedProtein: string
  selectedTrait: string
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
  selectedProtein?: string
  selectedTrait?: string
  expectedProtein?: string
  expectedTrait?: string
  stage: ProductionStage
  pairId: string
  orderId: string
  orderRole: OrderRole
  effect: MutationEffect
  independent: boolean
  repairs: number
  supportLevel: 0 | 1 | 2 | 3
  supportEvents: SupportEvent[]
  sequence: ProductionSequence
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

export interface TransferTask {
  id: string
  sourcePairId: string
  targetStage: ProductionStage
  targetCategory: MisconceptionCategory
  prompt: string
  expected: string
  options: string[]
}

export interface TransferResult {
  taskId: string
  sourcePairId: string
  targetStage: ProductionStage
  targetCategory: MisconceptionCategory
  submitted: string
  expected: string
  recovered: boolean
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
  screen: Screen
  identity: StudentIdentity
  currentRoundIndex: number
  roundState: RoundState
  feedback: Feedback | null
  roundResults: RoundResult[]
  missedSkills: MissedSkill[]
  startedAt: number
  completedAt: number | null
  elapsedSeconds: number
  isCodonWheelOpen: boolean
  taskDockOpen: boolean
  selectedStationId: StationId | null
  saveStatus: SaveStatus
  replayChallenge: ReplayChallenge | null
  runManifest: RunManifest
  transferTasks: TransferTask[]
  transferResults: TransferResult[]
  recoveredConcepts: MisconceptionCategory[]
  currentTransferIndex: number
  settings: TeacherSettings
}

export interface FinalGamePayload {
  schemaVersion: string
  attemptId: string
  timestamp: string
  game: string
  gameVersion: string
  classPeriod: string
  studentName: string
  isDemo: boolean
  score: number
  maxScore: number
  roundsCompleted: number
  totalRounds: number
  percent: number
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
  runManifest: RunManifest
  stageResults: StageResult[]
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
}

export interface FactorySceneState {
  activeStationId: StationId
  selectedStationId: StationId | null
  completedStationIds: StationId[]
  inputLocked: boolean
  progress: number
  cargoLabel: string
  statusKind: FeedbackKind
  repairActive: boolean
  activeStationLabel: string
}
