import { describe, expect, it } from 'vitest'
import { CODON_ENTRIES, CODON_TABLE, RNA_BASES } from '../../src/game/content/codonTable'
import {
  buildRunManifest,
  functionReferenceRows,
  proteinSequenceFamilies,
  validateContent,
  validateProteinSequenceFamilies,
} from '../../src/game/content/rounds'

const reviewedCodonFixture = {
  UUU: 'Phe', UUC: 'Phe', UUA: 'Leu', UUG: 'Leu',
  UCU: 'Ser', UCC: 'Ser', UCA: 'Ser', UCG: 'Ser',
  UAU: 'Tyr', UAC: 'Tyr', UAA: 'Stop', UAG: 'Stop',
  UGU: 'Cys', UGC: 'Cys', UGA: 'Stop', UGG: 'Trp',
  CUU: 'Leu', CUC: 'Leu', CUA: 'Leu', CUG: 'Leu',
  CCU: 'Pro', CCC: 'Pro', CCA: 'Pro', CCG: 'Pro',
  CAU: 'His', CAC: 'His', CAA: 'Gln', CAG: 'Gln',
  CGU: 'Arg', CGC: 'Arg', CGA: 'Arg', CGG: 'Arg',
  AUU: 'Ile', AUC: 'Ile', AUA: 'Ile', AUG: 'Met',
  ACU: 'Thr', ACC: 'Thr', ACA: 'Thr', ACG: 'Thr',
  AAU: 'Asn', AAC: 'Asn', AAA: 'Lys', AAG: 'Lys',
  AGU: 'Ser', AGC: 'Ser', AGA: 'Arg', AGG: 'Arg',
  GUU: 'Val', GUC: 'Val', GUA: 'Val', GUG: 'Val',
  GCU: 'Ala', GCC: 'Ala', GCA: 'Ala', GCG: 'Ala',
  GAU: 'Asp', GAC: 'Asp', GAA: 'Glu', GAG: 'Glu',
  GGU: 'Gly', GGC: 'Gly', GGA: 'Gly', GGG: 'Gly',
} as const

describe('protein factory v4 biology content', () => {
  it('contains a complete and unique 64-codon RNA reference', () => {
    expect(CODON_ENTRIES).toHaveLength(64)
    expect(new Set(CODON_ENTRIES.map((entry) => entry.codon)).size).toBe(64)
    expect(CODON_ENTRIES.every((entry) => [...entry.codon].every((base) => RNA_BASES.includes(base as never)))).toBe(true)
    expect(CODON_TABLE.AUG).toBe('Met')
    expect(CODON_TABLE.CAU).toBe('His')
    expect(CODON_TABLE.UAA).toBe('Stop')
    expect(CODON_TABLE.UAG).toBe('Stop')
    expect(CODON_TABLE.UGA).toBe('Stop')
    expect(CODON_TABLE).toEqual(reviewedCodonFixture)
    expect(CODON_ENTRIES.slice(0, 8).map((entry) => entry.codon)).toEqual([
      'UUU', 'UUC', 'UUA', 'UUG', 'UCU', 'UCC', 'UCA', 'UCG',
    ])
  })

  it('validates all six three-sequence families', () => {
    expect(proteinSequenceFamilies).toHaveLength(6)
    expect(validateProteinSequenceFamilies()).toEqual([])
    const dnaToMrna = { A: 'U', T: 'A', C: 'G', G: 'C' } as const
    proteinSequenceFamilies.flatMap((family) => [family.original, family.sameChainVariant, family.changedChainVariant])
      .forEach((sequence) => {
        expect([...sequence.dnaStrand].map((base) => dnaToMrna[base as keyof typeof dnaToMrna]).join(''))
          .toBe(sequence.mrna)
      })
  })

  it('builds a deterministic nine-action manifest', () => {
    const manifest = buildRunManifest('classroom-seed')
    expect(manifest.schemaVersion).toBe('protein-factory-v4')
    expect(manifest.sequenceIds).toHaveLength(3)
    expect(manifest.rounds).toHaveLength(9)
    expect(validateContent(manifest)).toEqual([])
    expect(buildRunManifest('classroom-seed')).toEqual(manifest)
  })

  it('uses complete four-amino-acid function rows', () => {
    expect(functionReferenceRows.map((row) => row.aminoAcidSequence)).toEqual([
      ['Met', 'Ala', 'Tyr', 'Gly'],
      ['Met', 'Val', 'Tyr', 'Gly'],
      ['Met', 'Val', 'His', 'Gly'],
      ['Met', 'Val', 'His', 'Asp'],
    ])
    expect(functionReferenceRows.every((row) => row.aminoAcidSequence.length === 4)).toBe(true)
  })
})
