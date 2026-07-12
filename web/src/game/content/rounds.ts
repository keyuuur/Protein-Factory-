import type {
  GameRound,
  MisconceptionCategory,
  MutationEffect,
  ProteinOrder,
  ProteinOrderPair,
  ProductionStage,
  RoundType,
  RunManifest,
  StageContext,
  StageResult,
  StationDefinition,
  StationId,
  TransferTask,
} from '../../types'

export const gameName = 'Protein Factory'
export const gameVersion = 'protein-factory-v3'
export const schemaVersion = 'protein-factory-v3' as const
export const stagesPerRun = 8

export const codonMap: Record<string, string> = {
  AUG: 'Met',
  GCU: 'Ala',
  GCC: 'Ala',
  UUU: 'Phe',
  UUC: 'Phe',
  GGU: 'Gly',
  GGC: 'Gly',
  AAA: 'Lys',
  AAG: 'Lys',
  GAA: 'Glu',
  GAG: 'Glu',
  GUA: 'Val',
  GUC: 'Val',
  AGA: 'Arg',
  CGU: 'Arg',
  UGG: 'Trp',
  UAU: 'Tyr',
  UAC: 'Tyr',
  CAA: 'Gln',
  CAG: 'Gln',
  UAA: 'Stop',
  UAG: 'Stop',
  UGA: 'Stop',
}

const usualFunction = 'The pigment enzyme stays active, so the model cell produces its usual pigment.'
const changedFunction = 'The pigment enzyme may work differently, so the model cell produces a changed pigment level.'
const earlyStopFunction = 'Translation ends early, so the model cell produces little or no pigment enzyme.'
const functionChoices = [usualFunction, changedFunction, earlyStopFunction]

export const tutorialSteps = [
  'Complete one normal protein order and one linked one-base variant.',
  'Assemble complementary DNA using A-T and C-G pairing.',
  'Transcribe template DNA into mRNA, using U instead of T.',
  'Read four mRNA codons from AUG through a stop signal.',
  'Use the amino-acid chain to predict the protein outcome.',
  'Corrections add support gradually; the codon chart is always a science tool.',
] as const

export const conceptGlossary = {
  dna: 'DNA stores genetic instructions.',
  transcription: 'mRNA is built as a complementary message from a DNA template strand.',
  codon: 'A codon is a three-base mRNA word.',
  aminoAcid: 'Amino acids join in the order specified by mRNA codons.',
  protein: 'A protein chain folds into a shape that affects its function.',
  trait: 'A one-base DNA difference can leave a protein unchanged, change an amino acid, or end translation early.',
} as const

export const periodOptions = ['1', '2', '3', '4', '5', '6', '7'] as const

export const stationDefinitions: StationDefinition[] = [
  {
    id: 'dna-dock',
    roundType: 'dna',
    title: 'DNA Assembly',
    shortTitle: 'DNA',
    prompt: 'Assemble a complementary DNA template strand.',
  },
  {
    id: 'transcription-press',
    roundType: 'transcription',
    title: 'Transcription',
    shortTitle: 'mRNA',
    prompt: 'Build the mRNA message from template DNA.',
  },
  {
    id: 'ribosome-galley',
    roundType: 'translation',
    title: 'Translation',
    shortTitle: 'Codons',
    prompt: 'Use the codon chart to follow the ribosome through the message.',
  },
  {
    id: 'trait-vault',
    roundType: 'protein',
    title: 'Function Test',
    shortTitle: 'Function',
    prompt: 'Predict how the completed amino-acid chain affects protein function.',
  },
]

export const proteinOrderPairs: ProteinOrderPair[] = [
  createPair('cargo-alpha', 'no-change', ['AUG', 'GCU', 'UUU', 'UAA'], ['AUG', 'GCC', 'UUU', 'UAA'], 5),
  createPair('cargo-gly', 'no-change', ['AUG', 'GGU', 'AAA', 'UAG'], ['AUG', 'GGC', 'AAA', 'UAG'], 5),
  createPair('cargo-glu', 'amino-acid-change', ['AUG', 'GAA', 'UUU', 'UAA'], ['AUG', 'GUA', 'UUU', 'UAA'], 4),
  createPair('cargo-lys', 'amino-acid-change', ['AUG', 'AAA', 'GCU', 'UGA'], ['AUG', 'AGA', 'GCU', 'UGA'], 4),
  createPair('cargo-trp', 'early-stop', ['AUG', 'UGG', 'GCU', 'UAA'], ['AUG', 'UGA', 'GCU', 'UAA'], 5),
  createPair('cargo-tyr', 'early-stop', ['AUG', 'UAU', 'CAA', 'UAG'], ['AUG', 'UAA', 'CAA', 'UAG'], 5),
]

export function buildRunManifest(seed: string | number, excludePairIds: string[] = []): RunManifest {
  const normalizedSeed = String(seed)
  const startIndex = hashSeed(normalizedSeed) % proteinOrderPairs.length
  const excluded = new Set(excludePairIds)
  const selectedPair = Array.from({ length: proteinOrderPairs.length }, (_, offset) =>
    proteinOrderPairs[(startIndex + offset) % proteinOrderPairs.length],
  ).find((pair) => !excluded.has(pair.id))

  if (!selectedPair) {
    throw new Error('Run manifest cannot exclude every protein order pair.')
  }

  return {
    schemaVersion,
    seed: normalizedSeed,
    selectionIndex: proteinOrderPairs.indexOf(selectedPair),
    pairId: selectedPair.id,
    effect: selectedPair.effect,
    orderIds: [selectedPair.normal.id, selectedPair.variant.id],
    rounds: buildRoundsForPair(selectedPair),
  }
}

export const defaultRunManifest = buildRunManifest('protein-factory-default')
export const rounds: GameRound[] = defaultRunManifest.rounds

export function buildRoundsForPair(pair: ProteinOrderPair): GameRound[] {
  return [pair.normal, pair.variant].flatMap((order, orderIndex) => {
    const stageOffset = orderIndex * 4
    const context = (stage: ProductionStage): StageContext => ({
      stage,
      pairId: pair.id,
      orderId: order.id,
      orderRole: order.role,
      effect: pair.effect,
      sequence: order.sequence,
    })
    const orderLabel = order.role === 'normal' ? 'Order A' : 'Order B'
    const sequence = order.sequence

    return [
      {
        id: `${order.id}-dna`,
        type: 'dna',
        title: `Stage ${stageOffset + 1}: ${orderLabel} DNA Assembly`,
        shortTitle: `${orderLabel} DNA`,
        prompt: `Assemble the template DNA strand complementary to the ${orderLabel} coding DNA blueprint.`,
        template: sequence.codingDna,
        answer: sequence.templateDna,
        options: ['A', 'T', 'C', 'G'],
        hint: 'Apply DNA pairing one position at a time: A-T and C-G.',
        context: context('dna-assembly'),
      },
      {
        id: `${order.id}-transcription`,
        type: 'transcription',
        title: `Stage ${stageOffset + 2}: ${orderLabel} Transcription`,
        shortTitle: `${orderLabel} mRNA`,
        prompt: `Transcribe the completed ${orderLabel} template DNA into mRNA.`,
        template: sequence.templateDna,
        answer: sequence.mrna,
        options: ['A', 'U', 'C', 'G'],
        hint: 'Pair mRNA to the DNA template and use U in RNA instead of T.',
        context: context('transcription'),
      },
      {
        id: `${order.id}-translation`,
        type: 'translation',
        title: `Stage ${stageOffset + 3}: ${orderLabel} Translation`,
        shortTitle: `${orderLabel} Codons`,
        prompt: `Use the codon chart to follow how the ribosome reads the four-codon ${orderLabel} message.`,
        codons: [...sequence.mrnaCodons],
        answers: [...sequence.translatedSlots],
        mode: 'full',
        codonChoices: sequence.translatedSlots.map((answer) => buildCodonChoices(answer)),
        hint: 'Start at AUG, read one codon at a time, and stop translating after the first stop signal.',
        context: context('translation'),
      },
      {
        id: `${order.id}-function`,
        type: 'protein',
        title: `Stage ${stageOffset + 4}: ${orderLabel} Function Test`,
        shortTitle: `${orderLabel} Function`,
        prompt: `Use the completed ${orderLabel} mRNA message and amino-acid chain to predict the protein outcome.`,
        chain: sequence.proteinChain.join('-'),
        options: functionChoices.map((trait, index) => ({
          protein: index === 0 ? 'Active pigment enzyme' : index === 1 ? 'Changed pigment enzyme' : 'Short pigment enzyme',
          trait,
          clue: index === 0 ? 'Usual activity and pigment output' : index === 1 ? 'Changed fold or activity' : 'Translation stopped before the full chain formed',
        })),
        correctTrait: sequence.functionOutcome,
        hint: 'Compare the amino-acid chain with the linked order and notice whether translation reached the final stop.',
        context: context('function-test'),
      },
    ] satisfies GameRound[]
  })
}

export function buildTransferTasks(
  manifest: RunManifest,
  results: StageResult[],
  seed: string | number = `${manifest.seed}:transfer`,
): TransferTask[] {
  const supportedStages = [...new Set(results.filter((result) => !result.independent).map((result) => result.stage))].slice(0, 3)

  return supportedStages.map((stage, index) => {
    const candidates = proteinOrderPairs.filter(
      (pair) => pair.id !== manifest.pairId && pair.effect !== manifest.effect,
    )
    const fallbackCandidates = proteinOrderPairs.filter((pair) => pair.id !== manifest.pairId)
    const pool = candidates.length > 0 ? candidates : fallbackCandidates
    const pair = pool[(hashSeed(`${seed}:${stage}`) + index) % pool.length]
    const round = buildRoundsForPair(pair).find(
      (candidate) => candidate.context.orderRole === 'one-base-variant' && candidate.context.stage === stage,
    )!
    const expected = expectedForRound(round)

    return {
      id: `transfer-${stage}-${pair.id}`,
      sourcePairId: pair.id,
      targetStage: stage,
      targetCategory: categoryForStage(stage),
      prompt: round.prompt,
      expected,
      options: transferChoices(round, expected),
    }
  })
}

export function stationForRoundType(type: RoundType): StationDefinition {
  return stationDefinitions.find((station) => station.roundType === type) ?? stationDefinitions[0]
}

export function stationIdForRoundType(type: RoundType): StationId {
  return stationForRoundType(type).id
}

export function validateProteinOrderPairs(pairs: ProteinOrderPair[] = proteinOrderPairs): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  const effectCounts: Record<MutationEffect, number> = {
    'no-change': 0,
    'amino-acid-change': 0,
    'early-stop': 0,
  }

  if (pairs.length !== 6) errors.push(`Expected 6 protein order pairs, received ${pairs.length}`)

  pairs.forEach((pair) => {
    if (ids.has(pair.id)) errors.push(`Duplicate pair id: ${pair.id}`)
    ids.add(pair.id)
    effectCounts[pair.effect] += 1

    const normal = pair.normal.sequence
    const variant = pair.variant.sequence
    if (normal.mrnaCodons.length !== 4 || variant.mrnaCodons.length !== 4) {
      errors.push(`${pair.id} must contain four mRNA codons per order`)
    }
    if (normal.mrnaCodons[0] !== 'AUG' || variant.mrnaCodons[0] !== 'AUG') {
      errors.push(`${pair.id} must begin with AUG`)
    }
    if (countDifferences(normal.mrna, variant.mrna) !== 1) {
      errors.push(`${pair.id} normal and variant orders must differ by exactly one mRNA base`)
    }
    if (normal.mrna[pair.changedMrnaIndex] === variant.mrna[pair.changedMrnaIndex]) {
      errors.push(`${pair.id} changedMrnaIndex does not identify the changed base`)
    }

    ;[pair.normal, pair.variant].forEach((order) => {
      const sequence = order.sequence
      if (sequence.mrna !== sequence.mrnaCodons.join('')) errors.push(`${order.id} mRNA does not match its codons`)
      if (sequence.codingDna !== sequence.mrna.replaceAll('U', 'T')) errors.push(`${order.id} coding DNA does not match mRNA`)
      if (sequence.templateDna !== complementDna(sequence.codingDna)) errors.push(`${order.id} template DNA is not complementary`)
      if (sequence.translatedSlots.join('|') !== translateCodons(sequence.mrnaCodons).join('|')) {
        errors.push(`${order.id} translated slots do not match the codon map`)
      }
    })

    if (pair.effect === 'no-change' && normal.proteinChain.join('|') !== variant.proteinChain.join('|')) {
      errors.push(`${pair.id} no-change pair changes the amino-acid chain`)
    }
    if (pair.effect === 'amino-acid-change' && normal.proteinChain.join('|') === variant.proteinChain.join('|')) {
      errors.push(`${pair.id} amino-acid-change pair does not change the chain`)
    }
    if (pair.effect === 'early-stop' && variant.proteinChain.length >= normal.proteinChain.length) {
      errors.push(`${pair.id} early-stop variant does not shorten the chain`)
    }
  })

  Object.entries(effectCounts).forEach(([effect, count]) => {
    if (count !== 2) errors.push(`Expected 2 ${effect} pairs, received ${count}`)
  })
  return errors
}

export function validateContent(manifest: RunManifest = defaultRunManifest): string[] {
  const errors = validateProteinOrderPairs()
  const ids = new Set<string>()

  if (manifest.rounds.length !== stagesPerRun) errors.push(`Run must contain ${stagesPerRun} stages`)
  manifest.rounds.forEach((round) => {
    if (ids.has(round.id)) errors.push(`Duplicate round id: ${round.id}`)
    ids.add(round.id)
    if (round.context.pairId !== manifest.pairId) errors.push(`${round.id} does not belong to manifest pair`)
    if ((round.type === 'dna' || round.type === 'transcription') && round.answer.length !== round.template.length) {
      errors.push(`${round.id} answer length does not match template length`)
    }
    if (round.type === 'translation') {
      if (round.codons.length !== 4 || round.answers.length !== 4 || round.codonChoices.length !== 4) {
        errors.push(`${round.id} translation data must contain four slots`)
      }
      round.answers.forEach((answer, index) => {
        if (!round.codonChoices[index].includes(answer)) errors.push(`${round.id} choices missing ${answer}`)
      })
    }
    if (round.type === 'protein' && !round.options.some((option) => option.trait === round.correctTrait)) {
      errors.push(`${round.id} has no correct function option`)
    }
  })
  return errors
}

function createPair(
  id: string,
  effect: MutationEffect,
  normalCodons: [string, string, string, string],
  variantCodons: [string, string, string, string],
  changedMrnaIndex: number,
): ProteinOrderPair {
  return {
    id,
    effect,
    changedMrnaIndex,
    normal: createOrder(`${id}-normal`, `${id} normal order`, 'normal', normalCodons, usualFunction),
    variant: createOrder(
      `${id}-variant`,
      `${id} linked order`,
      'one-base-variant',
      variantCodons,
      effect === 'no-change' ? usualFunction : effect === 'amino-acid-change' ? changedFunction : earlyStopFunction,
    ),
  }
}

function createOrder(
  id: string,
  name: string,
  role: ProteinOrder['role'],
  mrnaCodons: [string, string, string, string],
  functionOutcome: string,
): ProteinOrder {
  const mrna = mrnaCodons.join('')
  const codingDna = mrna.replaceAll('U', 'T')
  const translatedSlots = translateCodons(mrnaCodons)
  const firstStop = translatedSlots.indexOf('Stop')
  const proteinChain = translatedSlots.slice(0, firstStop === -1 ? translatedSlots.length : firstStop)

  return {
    id,
    name,
    role,
    sequence: {
      codingDna,
      templateDna: complementDna(codingDna),
      mrna,
      mrnaCodons: [...mrnaCodons],
      translatedSlots,
      proteinChain,
      functionOutcome,
    },
  }
}

function translateCodons(codons: [string, string, string, string]): [string, string, string, string] {
  let stopped = false
  return codons.map((codon) => {
    if (stopped) return 'Not translated'
    const aminoAcid = codonMap[codon] ?? 'Unknown'
    if (aminoAcid === 'Stop') stopped = true
    return aminoAcid
  }) as [string, string, string, string]
}

function complementDna(sequence: string): string {
  const pairs: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C' }
  return [...sequence].map((base) => pairs[base] ?? '?').join('')
}

function buildCodonChoices(answer: string): string[] {
  const distractors = answer === 'Not translated' ? ['Ala', 'Stop', 'Met'] : answer === 'Stop' ? ['Trp', 'Gln', 'Not translated'] : ['Met', 'Ala', 'Val', 'Lys', 'Phe', 'Gly', 'Arg', 'Trp', 'Tyr', 'Gln', 'Stop']
  return [answer, ...distractors.filter((choice) => choice !== answer)].slice(0, 4)
}

function expectedForRound(round: GameRound): string {
  if (round.type === 'dna' || round.type === 'transcription') return round.answer
  if (round.type === 'translation') return round.answers.join('-')
  return 'correctTrait' in round ? round.correctTrait : ''
}

function transferChoices(round: GameRound, expected: string): string[] {
  if (round.type === 'protein') return round.options.map((option) => option.trait)
  if (round.type === 'translation') {
    const alternatives = [
      round.answers.map((answer, index) => (index === 1 ? 'Val' : answer)).join('-'),
      round.answers.map((answer, index) => (index === 2 ? 'Stop' : answer)).join('-'),
      round.context.sequence.proteinChain.join('-'),
    ]
    return [...new Set([expected, ...alternatives])].slice(0, 4)
  }
  const alphabet = round.type === 'dna' ? ['A', 'T', 'C', 'G'] : ['A', 'U', 'C', 'G']
  const alternatives = alphabet
    .filter((base) => base !== expected[0])
    .map((base) => `${base}${expected.slice(1)}`)
  return [expected, ...alternatives].slice(0, 4)
}

function categoryForStage(stage: ProductionStage): MisconceptionCategory {
  if (stage === 'dna-assembly') return 'dna-base-pairing'
  if (stage === 'transcription') return 'rna-template-pairing'
  if (stage === 'translation') return 'codon-lookup'
  return 'protein-trait-model'
}

function countDifferences(left: string, right: string): number {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY
  return [...left].reduce((count, value, index) => count + (value === right[index] ? 0 : 1), 0)
}

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
