import type { GameRound, RoundType, StationDefinition, StationId } from '../../types'

export const gameVersion = 'level-2-mvp-0.1.0'

export const codonMap = {
  AUG: 'Met',
  GUC: 'Val',
  CCC: 'Pro',
  UAC: 'Tyr',
  AAG: 'Lys',
  GAA: 'Glu',
} as const

export const tutorialSteps = [
  'Tap the highlighted station to open each task.',
  'DNA stores genetic instructions.',
  'mRNA carries a copied message from DNA to ribosomes.',
  'Ribosomes read mRNA codons, three bases at a time.',
  'Amino acids join to form a protein chain.',
  'Proteins help influence traits.',
] as const

export const conceptGlossary = {
  dna: 'DNA stores genetic instructions.',
  transcription: 'mRNA is built as a complementary message from a DNA template strand.',
  codon: 'A codon is a three-base mRNA word.',
  aminoAcid: 'Amino acids are small pieces that join into protein chains.',
  protein: 'Proteins are long chains that do jobs in cells.',
  trait: 'Traits are features influenced by proteins and other factors.',
} as const

export const periodOptions = ['1', '2', '3', '4', '5', '6', '7'] as const

export const stationDefinitions: StationDefinition[] = [
  {
    id: 'dna-dock',
    roundType: 'dna',
    title: 'DNA Dock',
    shortTitle: 'DNA',
    prompt: 'Build complementary DNA strands from the dock controls.',
  },
  {
    id: 'transcription-press',
    roundType: 'transcription',
    title: 'Transcription Press',
    shortTitle: 'mRNA',
    prompt: 'Use the DNA template to build a complementary mRNA message.',
  },
  {
    id: 'ribosome-galley',
    roundType: 'translation',
    title: 'Ribosome Galley',
    shortTitle: 'Codons',
    prompt: 'Load amino acids by reading mRNA codons.',
  },
  {
    id: 'trait-vault',
    roundType: 'protein',
    title: 'Trait Vault',
    shortTitle: 'Trait',
    prompt: 'Ship the protein chain to the matching trait outcome.',
  },
]

export const rounds: GameRound[] = [
  {
    id: 'dna-1',
    type: 'dna',
    title: 'Round 1: DNA Base Pairing',
    shortTitle: 'DNA Base Pairing',
    prompt: 'Build the new complementary DNA strand.',
    template: 'ATCG',
    answer: 'TAGC',
    options: ['A', 'T', 'C', 'G'],
    hint: 'DNA base pairing: A pairs with T. C pairs with G.',
  },
  {
    id: 'dna-2',
    type: 'dna',
    title: 'Round 2: DNA Base Pairing',
    shortTitle: 'DNA Base Pairing',
    prompt: 'Build the new complementary DNA strand.',
    template: 'CGTA',
    answer: 'GCAT',
    options: ['A', 'T', 'C', 'G'],
    hint: 'Every A needs T, and every T needs A, as a pair.',
  },
  {
    id: 'tx-1',
    type: 'transcription',
    title: 'Round 3: Transcription',
    shortTitle: 'Make mRNA',
    prompt: 'Use the DNA template strand to build complementary mRNA. RNA uses U instead of T.',
    template: 'TAC',
    answer: 'AUG',
    options: ['A', 'U', 'C', 'G'],
    hint: 'mRNA is complementary to template DNA. Template A pairs with RNA U, not T.',
  },
  {
    id: 'tx-2',
    type: 'transcription',
    title: 'Round 4: Transcription',
    shortTitle: 'Make mRNA',
    prompt: 'Use the DNA template strand to build complementary mRNA. RNA uses U instead of T.',
    template: 'CGAT',
    answer: 'GCUA',
    options: ['A', 'U', 'C', 'G'],
    hint: 'Use template pairing: DNA A to RNA U, DNA T to RNA A, C to G, and G to C.',
  },
  {
    id: 'tl-1',
    type: 'translation',
    title: 'Round 5: Translation',
    shortTitle: 'Codon Run',
    prompt: 'Translate each mRNA codon to amino acids, one codon at a time.',
    codons: ['AUG', 'GUC'],
    answers: ['Met', 'Val'],
    mode: 'perCodon',
    codonChoices: [
      ['Met', 'Val', 'Tyr', 'Asn'],
      ['Val', 'Met', 'Pro', 'Gln'],
    ],
    hint: 'Read mRNA three bases at a time, then translate one codon before moving on.',
  },
  {
    id: 'tl-2',
    type: 'translation',
    title: 'Round 6: Translation',
    shortTitle: 'Chain Builder',
    prompt: 'Translate this mRNA segment one codon at a time.',
    codons: ['CCC', 'UAC', 'AAG'],
    answers: ['Pro', 'Tyr', 'Lys'],
    mode: 'full',
    codonChoices: [
      ['Pro', 'Val', 'Asp', 'Glu'],
      ['Tyr', 'Met', 'Asn', 'Ser'],
      ['Lys', 'Arg', 'Asp', 'Glu'],
    ],
    hint: 'Read one three-base codon at a time, then check the whole amino-acid chain.',
  },
  {
    id: 'match-1',
    type: 'protein',
    title: 'Round 7: Protein / Trait Matching',
    shortTitle: 'Trait Match',
    prompt: 'Use this short chain fragment as a model clue for the protein and trait.',
    chain: 'Met-Val',
    options: [
      { protein: 'Lactase', trait: 'Can digest lactose', clue: 'Enzyme model for breaking down lactose.' },
      { protein: 'Altered Lactase', trait: 'Cannot digest lactose', clue: 'Changed enzyme model with weaker function.' },
      { protein: 'Pigment Protein', trait: 'Helps produce melanin', clue: 'Color-related protein model.' },
    ],
    correctTrait: 'Can digest lactose',
    hint: 'This game uses short chain fragments as model clues. Real proteins are much longer.',
  },
  {
    id: 'match-2',
    type: 'protein',
    title: 'Round 8: Protein / Trait Matching',
    shortTitle: 'Trait Match',
    prompt: 'Use this short chain fragment as a model clue for the protein and trait.',
    chain: 'Pro-Tyr-Lys',
    options: [
      { protein: 'Pigment Protein', trait: 'Helps produce melanin', clue: 'Color-related protein model.' },
      { protein: 'Lactase', trait: 'Can digest lactose', clue: 'Enzyme model for breaking down lactose.' },
      { protein: 'Transport Protein', trait: 'Moves substances across cell membranes', clue: 'Membrane movement model.' },
    ],
    correctTrait: 'Helps produce melanin',
    hint: 'This is a simplified model: use the chain fragment as a clue, not a full real protein.',
  },
]

export function stationForRoundType(type: RoundType): StationDefinition {
  return stationDefinitions.find((station) => station.roundType === type) ?? stationDefinitions[0]
}

export function stationIdForRoundType(type: RoundType): StationId {
  return stationForRoundType(type).id
}

export function validateContent(): string[] {
  const errors: string[] = []
  const ids = new Set<string>()

  rounds.forEach((round) => {
    if (ids.has(round.id)) {
      errors.push(`Duplicate round id: ${round.id}`)
    }
    ids.add(round.id)

    if ((round.type === 'dna' || round.type === 'transcription') && round.answer.length !== round.template.length) {
      errors.push(`${round.id} answer length does not match template length`)
    }

    if (round.type === 'translation') {
      if (round.codons.length !== round.answers.length || round.codons.length !== round.codonChoices.length) {
        errors.push(`${round.id} codon data length mismatch`)
      }

      round.codons.forEach((codon, index) => {
        if (codonMap[codon as keyof typeof codonMap] !== round.answers[index]) {
          errors.push(`${round.id} codon ${codon} does not match codon map`)
        }
        if (!round.codonChoices[index].includes(round.answers[index])) {
          errors.push(`${round.id} choices missing correct amino acid for ${codon}`)
        }
      })
    }

    if (round.type === 'protein' && !round.options.some((option) => option.trait === round.correctTrait)) {
      errors.push(`${round.id} has no option for correct trait`)
    }
  })

  return errors
}
