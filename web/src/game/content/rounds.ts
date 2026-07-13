import type {
  FunctionReferenceRow,
  GameRound,
  MisconceptionCategory,
  MutationEffect,
  ProteinSequence,
  ProteinSequenceFamily,
  ProductionAction,
  RoundType,
  RunManifestV4,
  SequenceRole,
  StageContext,
  StageResult,
  StationDefinition,
  StationId,
  TransferTask,
} from '../../types'
import {
  V4_CONTENT_VERSION,
  V4_FAMILY_DEFINITIONS,
  V4_FUNCTION_REFERENCE_ROWS,
  V4_SCHEMA_VERSION,
} from '../../../shared/catalogV4.js'
import { CODON_TABLE, translateCodon, type TranslationSignal } from './codonTable'

export const gameName = 'Protein Factory'
export const gameVersion = 'protein-factory-v4'
export const schemaVersion = V4_SCHEMA_VERSION as 'protein-factory-v4'
export const contentVersion = V4_CONTENT_VERSION
export const stagesPerRun = 9
export const sequencesPerRun = 3
export const actionsPerSequence = 3
export const codonMap = CODON_TABLE

export const functionReferenceRows: FunctionReferenceRow[] = V4_FUNCTION_REFERENCE_ROWS.map((row) => ({
  ...row,
  aminoAcidSequence: [...row.aminoAcidSequence] as FunctionReferenceRow['aminoAcidSequence'],
}))

const functionRowsById = new Map(functionReferenceRows.map((row) => [row.id, row]))

export const tutorialSteps = [
  'Process an original DNA strand and two one-base changes.',
  'Build an mRNA strand by pairing RNA bases with the DNA strand.',
  'Read five mRNA codons from AUG through the final Stop signal.',
  'Use the codon wheel to build a four-amino-acid chain.',
  'Match the chain to the fictional protein-function and fur-color model.',
  'Corrections add support gradually; the codon wheel is always a reference tool.',
] as const

export const conceptGlossary = {
  dna: 'DNA stores genetic instructions.',
  transcription: 'Transcription builds an mRNA message by pairing RNA bases with a DNA strand.',
  codon: 'A codon is a group of three mRNA bases.',
  aminoAcid: 'Amino acids join in the order specified by mRNA codons.',
  protein: 'An amino acid chain folds into a protein with a particular function.',
  trait: 'In this simplified model, protein pigment production is connected to fur color.',
} as const

export const periodOptions = ['1', '2', '3', '4', '5', '6', '7'] as const

export const stationDefinitions: StationDefinition[] = [
  {
    id: 'transcription-press',
    roundType: 'transcription',
    action: 'transcription',
    title: 'Transcription',
    shortTitle: 'mRNA',
    prompt: 'Build the mRNA strand from the DNA strand.',
  },
  {
    id: 'ribosome-galley',
    roundType: 'translation',
    action: 'translation',
    title: 'Translation',
    shortTitle: 'Amino Acids',
    prompt: 'Use the codon wheel to build the amino acid chain.',
  },
  {
    id: 'trait-vault',
    roundType: 'protein',
    action: 'function-test',
    title: 'Function Test',
    shortTitle: 'Function',
    prompt: 'Match the amino acid chain to its modeled protein function and fur color.',
  },
]

type FiveCodons = [string, string, string, string, string]

export const proteinSequenceFamilies: ProteinSequenceFamily[] = V4_FAMILY_DEFINITIONS.map((definition) => createFamily(
  definition.id,
  definition.name,
  [...definition.original.codons] as FiveCodons,
  [...definition.sameChain.codons] as FiveCodons,
  [...definition.changedChain.codons] as FiveCodons,
  definition.original.functionRowId,
  definition.changedChain.functionRowId,
))

export function buildRunManifest(seed: string | number, excludeFamilyIds: string[] = []): RunManifestV4 {
  const normalizedSeed = String(seed)
  const startIndex = hashSeed(normalizedSeed) % proteinSequenceFamilies.length
  const excluded = new Set(excludeFamilyIds)
  const selectedFamily = Array.from({ length: proteinSequenceFamilies.length }, (_, offset) =>
    proteinSequenceFamilies[(startIndex + offset) % proteinSequenceFamilies.length],
  ).find((family) => !excluded.has(family.id))

  if (!selectedFamily) throw new Error('Run manifest cannot exclude every protein sequence family.')

  return {
    schemaVersion,
    contentVersion,
    seed: normalizedSeed,
    selectionIndex: proteinSequenceFamilies.indexOf(selectedFamily),
    familyId: selectedFamily.id,
    sequenceIds: [selectedFamily.original.id, selectedFamily.sameChainVariant.id, selectedFamily.changedChainVariant.id],
    effects: ['same-chain', 'amino-acid-change'],
    rounds: buildRoundsForFamily(selectedFamily),
  }
}

export const defaultRunManifest = buildRunManifest('protein-factory-v4-default')
export const rounds = defaultRunManifest.rounds

export function buildRoundsForFamily(family: ProteinSequenceFamily): GameRound[] {
  const sequences = [family.original, family.sameChainVariant, family.changedChainVariant] as const

  return sequences.flatMap((sequence, sequenceIndex) => {
    const context = (action: ProductionAction): StageContext => ({
      action,
      familyId: family.id,
      sequenceId: sequence.id,
      sequenceRole: sequence.role,
      sequenceEffect: sequence.effect,
      sequenceIndex: sequenceIndex as 0 | 1 | 2,
      sequence,
    })
    const sequenceLabel = sequenceIndex === 0 ? 'Original Protein' : sequenceIndex === 1 ? 'Change A' : 'Change B'
    const actionOffset = sequenceIndex * actionsPerSequence

    return [
      {
        id: `${sequence.id}-transcription`,
        type: 'transcription',
        title: `Action ${actionOffset + 1}: ${sequenceLabel} Transcription`,
        shortTitle: `${sequenceLabel} mRNA`,
        prompt: 'Build the mRNA strand by pairing an RNA base with each base in the DNA strand.',
        template: sequence.dnaStrand,
        answer: sequence.mrna,
        options: ['A', 'U', 'C', 'G'],
        hint: 'Pair A with U, T with A, C with G, and G with C.',
        context: context('transcription'),
      },
      {
        id: `${sequence.id}-translation`,
        type: 'translation',
        title: `Action ${actionOffset + 2}: ${sequenceLabel} Translation`,
        shortTitle: `${sequenceLabel} Amino Acids`,
        prompt: 'Read each mRNA codon from the center of the wheel outward and build the amino acid chain.',
        codons: [...sequence.mrnaCodons],
        answers: [...sequence.translatedSignals],
        mode: 'perCodon',
        codonChoices: sequence.translatedSignals.map((answer, index) => buildCodonChoices(answer, index)),
        hint: 'Use one mRNA codon at a time. The final Stop signal ends translation and is not an amino acid.',
        context: context('translation'),
      },
      {
        id: `${sequence.id}-function`,
        type: 'protein',
        title: `Action ${actionOffset + 3}: ${sequenceLabel} Function Test`,
        shortTitle: `${sequenceLabel} Function`,
        prompt: 'Select the table row that matches the completed amino acid chain.',
        chain: sequence.aminoAcidChain.join('-'),
        referenceRows: functionReferenceRows,
        correctRowId: sequence.functionRowId,
        hint: 'Match all four amino acids first, then read across the same row to the function and fur color.',
        context: context('function-test'),
      },
    ] satisfies GameRound[]
  })
}

export function buildTransferTasks(
  manifest: RunManifestV4,
  results: StageResult[],
  seed: string | number = `${manifest.seed}:transfer`,
): TransferTask[] {
  const supportedAction = results.find((result) => !result.independent)?.stage
  if (!supportedAction) return []

  const candidates = proteinSequenceFamilies.filter((family) => family.id !== manifest.familyId)
  const family = candidates[hashSeed(`${seed}:${supportedAction}`) % candidates.length]
  const round = buildRoundsForFamily(family).find(
    (candidate) => candidate.context.sequenceRole === 'changed-chain-variant' && candidate.context.action === supportedAction,
  )!
  const expected = expectedForRound(round)

  return [{
    id: `transfer-${supportedAction}-${family.id}`,
    sourceFamilyId: family.id,
    targetStage: supportedAction,
    targetCategory: categoryForStage(supportedAction),
    skillLabel: skillLabelForStage(supportedAction),
    prompt: round.prompt,
    evidencePrompt: evidencePromptForRound(round),
    stimulus: transferStimulus(round),
    expected,
    options: transferChoices(round, expected),
    correctiveFeedback: correctiveFeedbackForStage(supportedAction),
    attempts: 0,
    submittedAnswers: [],
  }]
}

export function stationForRoundType(type: RoundType): StationDefinition {
  return stationDefinitions.find((station) => station.roundType === type) ?? stationDefinitions[0]
}

export function stationIdForRoundType(type: RoundType): StationId {
  return stationForRoundType(type).id
}

export function validateProteinSequenceFamilies(families = proteinSequenceFamilies): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  if (families.length !== 6) errors.push(`Expected 6 protein sequence families, received ${families.length}`)

  families.forEach((family) => {
    if (ids.has(family.id)) errors.push(`Duplicate family id: ${family.id}`)
    ids.add(family.id)
    const sequences = [family.original, family.sameChainVariant, family.changedChainVariant]
    sequences.forEach((sequence) => validateSequence(sequence, errors))

    if (countDifferences(family.original.dnaStrand, family.sameChainVariant.dnaStrand) !== 1) {
      errors.push(`${family.id} same-chain variant must differ by one DNA base`)
    }
    if (countDifferences(family.original.dnaStrand, family.changedChainVariant.dnaStrand) !== 1) {
      errors.push(`${family.id} changed-chain variant must differ by one DNA base`)
    }
    if (family.original.aminoAcidChain.join('|') !== family.sameChainVariant.aminoAcidChain.join('|')) {
      errors.push(`${family.id} same-chain variant changes the amino acid chain`)
    }
    if (family.original.functionRowId !== family.sameChainVariant.functionRowId) {
      errors.push(`${family.id} same-chain variant changes the function row`)
    }
    const aminoAcidDifferences = countArrayDifferences(
      family.original.aminoAcidChain,
      family.changedChainVariant.aminoAcidChain,
    )
    if (aminoAcidDifferences !== 1) errors.push(`${family.id} changed-chain variant must change one amino acid`)
    if (family.original.functionRowId === family.changedChainVariant.functionRowId) {
      errors.push(`${family.id} changed-chain variant must change the function row`)
    }
  })
  return errors
}

export function validateContent(manifest: RunManifestV4 = defaultRunManifest): string[] {
  const errors = validateProteinSequenceFamilies()
  const ids = new Set<string>()
  if (manifest.rounds.length !== stagesPerRun) errors.push(`Run must contain ${stagesPerRun} actions`)
  if (manifest.sequenceIds.length !== sequencesPerRun) errors.push('Run must contain three protein sequences')

  manifest.rounds.forEach((round, index) => {
    if (ids.has(round.id)) errors.push(`Duplicate round id: ${round.id}`)
    ids.add(round.id)
    if (round.context.familyId !== manifest.familyId) errors.push(`${round.id} does not belong to manifest family`)
    if (round.context.sequenceIndex !== Math.floor(index / actionsPerSequence)) {
      errors.push(`${round.id} has the wrong sequence index`)
    }
    if (round.type === 'transcription' && round.answer.length !== round.template.length) {
      errors.push(`${round.id} answer length does not match the DNA strand`)
    }
    if (round.type === 'translation') {
      if (round.codons.length !== 5 || round.answers.length !== 5 || round.codonChoices.length !== 5) {
        errors.push(`${round.id} translation data must contain five codons`)
      }
      round.answers.forEach((answer, answerIndex) => {
        if (!round.codonChoices[answerIndex].includes(answer)) errors.push(`${round.id} choices are missing ${answer}`)
      })
    }
    if (round.type === 'protein' && !round.referenceRows.some((row) => row.id === round.correctRowId)) {
      errors.push(`${round.id} has no matching function row`)
    }
  })
  return errors
}

function createFamily(
  id: string,
  name: string,
  originalCodons: FiveCodons,
  sameChainCodons: FiveCodons,
  changedChainCodons: FiveCodons,
  originalFunctionRowId: string,
  changedFunctionRowId: string,
): ProteinSequenceFamily {
  const original = createSequence(`${id}-original`, 'original', 'original', originalCodons, originalFunctionRowId, null)
  const sameChainVariant = createVariantSequence(
    `${id}-same`, 'same-chain-variant', 'same-chain', sameChainCodons, originalFunctionRowId, original,
  )
  const changedChainVariant = createVariantSequence(
    `${id}-changed`, 'changed-chain-variant', 'amino-acid-change', changedChainCodons, changedFunctionRowId, original,
  )
  return { id, name, original, sameChainVariant, changedChainVariant }
}

function createVariantSequence(
  id: string,
  role: SequenceRole,
  effect: MutationEffect,
  codons: FiveCodons,
  functionRowId: string,
  original: ProteinSequence,
): ProteinSequence {
  const sequence = createSequence(id, role, effect, codons, functionRowId, null)
  return { ...sequence, changedDnaIndex: firstDifference(original.dnaStrand, sequence.dnaStrand) }
}

function createSequence(
  id: string,
  role: SequenceRole,
  effect: ProteinSequence['effect'],
  mrnaCodons: FiveCodons,
  functionRowId: string,
  changedDnaIndex: number | null,
): ProteinSequence {
  const translatedSignals = mrnaCodons.map(translateCodon) as ProteinSequence['translatedSignals']
  const aminoAcidChain = translatedSignals.slice(0, 4) as ProteinSequence['aminoAcidChain']
  const mrna = mrnaCodons.join('')
  return {
    id,
    role,
    effect,
    dnaStrand: dnaTemplateForMrna(mrna),
    mrna,
    mrnaCodons: [...mrnaCodons],
    translatedSignals,
    aminoAcidChain,
    functionRowId,
    changedDnaIndex,
  }
}

function validateSequence(sequence: ProteinSequence, errors: string[]): void {
  if (sequence.mrna.length !== 15 || sequence.dnaStrand.length !== 15) {
    errors.push(`${sequence.id} must contain 15 DNA and mRNA bases`)
  }
  if (sequence.mrnaCodons[0] !== 'AUG') errors.push(`${sequence.id} must begin with AUG`)
  if (sequence.translatedSignals[0] !== 'Met') errors.push(`${sequence.id} must begin with Met`)
  if (sequence.translatedSignals[4] !== 'Stop') errors.push(`${sequence.id} must end with Stop`)
  if (sequence.translatedSignals.slice(0, 4).includes('Stop')) errors.push(`${sequence.id} contains an early Stop`)
  if (sequence.dnaStrand !== dnaTemplateForMrna(sequence.mrna)) errors.push(`${sequence.id} DNA does not transcribe to mRNA`)
  if (sequence.mrna !== sequence.mrnaCodons.join('')) errors.push(`${sequence.id} mRNA does not match its codons`)
  if (sequence.aminoAcidChain.join('|') !== sequence.translatedSignals.slice(0, 4).join('|')) {
    errors.push(`${sequence.id} amino acid chain does not match translation`)
  }
  const functionRow = functionRowsById.get(sequence.functionRowId)
  if (!functionRow) errors.push(`${sequence.id} has an unknown function row`)
  else if (functionRow.aminoAcidSequence.join('|') !== sequence.aminoAcidChain.join('|')) {
    errors.push(`${sequence.id} chain does not match function row ${functionRow.id}`)
  }
}

function dnaTemplateForMrna(mrna: string): string {
  const pairs: Record<string, string> = { A: 'T', U: 'A', C: 'G', G: 'C' }
  return [...mrna].map((base) => pairs[base] ?? '?').join('')
}

function buildCodonChoices(answer: TranslationSignal, index: number): string[] {
  if (answer === 'Stop') return ['Stop', 'Trp', 'Gln', 'Met']
  const distractorSets = [
    ['Met', 'Ile', 'Val', 'Leu'],
    ['Ala', 'Val', 'Thr', 'Ser'],
    ['Tyr', 'His', 'Phe', 'Gln'],
    ['Gly', 'Asp', 'Ala', 'Val'],
  ]
  return [answer, ...distractorSets[index % distractorSets.length].filter((choice) => choice !== answer)].slice(0, 4)
}

function expectedForRound(round: GameRound): string {
  if (round.type === 'transcription') return round.answer
  if (round.type === 'translation') return round.answers.join('-')
  return round.correctRowId
}

function transferChoices(round: GameRound, expected: string): string[] {
  if (round.type === 'protein') return round.referenceRows.map((row) => row.id)
  if (round.type === 'translation') {
    const alternatives = round.codonChoices[0].slice(1).map((choice) => [choice, ...round.answers.slice(1)].join('-'))
    return [expected, ...alternatives].slice(0, 4)
  }
  const alternatives = ['A', 'U', 'C', 'G'].filter((base) => base !== expected[0]).map((base) => `${base}${expected.slice(1)}`)
  return [expected, ...alternatives].slice(0, 4)
}

function categoryForStage(action: ProductionAction): MisconceptionCategory {
  if (action === 'transcription') return 'rna-template-pairing'
  if (action === 'translation') return 'codon-lookup'
  return 'protein-trait-model'
}

function skillLabelForStage(action: ProductionAction): string {
  if (action === 'transcription') return 'Transcribe DNA into complementary mRNA'
  if (action === 'translation') return 'Translate mRNA codons into amino-acid signals'
  return 'Use an amino-acid chain to identify protein function'
}

function evidencePromptForRound(round: GameRound): string {
  if (round.type === 'transcription') return 'New DNA strand'
  if (round.type === 'translation') return 'New mRNA codons'
  return 'New amino-acid chain and function table'
}

function transferStimulus(round: GameRound): TransferTask['stimulus'] {
  if (round.type === 'transcription') {
    return { dnaTemplate: round.template, kind: 'transcription' }
  }
  if (round.type === 'translation') {
    return { kind: 'translation', mrnaCodons: [...round.codons] }
  }
  return {
    aminoAcidChain: [...round.context.sequence.aminoAcidChain],
    kind: 'function-test',
    referenceRows: round.referenceRows.map((row) => ({
      ...row,
      aminoAcidSequence: [...row.aminoAcidSequence],
    })),
  }
}

function correctiveFeedbackForStage(action: ProductionAction): string {
  if (action === 'transcription') {
    return 'Pair each DNA base with its complementary RNA base: A-U, T-A, C-G, and G-C.'
  }
  if (action === 'translation') {
    return 'Read each mRNA codon in order, translate one codon at a time, and treat Stop as a signal rather than an amino acid.'
  }
  return 'Match all four amino acids to one table row, then use the function and trait from that same row.'
}

function firstDifference(left: string, right: string): number | null {
  const index = [...left].findIndex((value, position) => value !== right[position])
  return index === -1 ? null : index
}

function countDifferences(left: string, right: string): number {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY
  return [...left].reduce((count, value, index) => count + (value === right[index] ? 0 : 1), 0)
}

function countArrayDifferences(left: readonly string[], right: readonly string[]): number {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY
  return left.reduce((count, value, index) => count + (value === right[index] ? 0 : 1), 0)
}

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
