export const RNA_BASES = ['U', 'C', 'A', 'G'] as const

export type RnaBase = (typeof RNA_BASES)[number]
export type AminoAcidAbbreviation =
  | 'Ala'
  | 'Arg'
  | 'Asn'
  | 'Asp'
  | 'Cys'
  | 'Gln'
  | 'Glu'
  | 'Gly'
  | 'His'
  | 'Ile'
  | 'Leu'
  | 'Lys'
  | 'Met'
  | 'Phe'
  | 'Pro'
  | 'Ser'
  | 'Thr'
  | 'Trp'
  | 'Tyr'
  | 'Val'

export type TranslationSignal = AminoAcidAbbreviation | 'Stop'

export const CODON_TABLE: Readonly<Record<string, TranslationSignal>> = {
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

export const CODON_ENTRIES = RNA_BASES.flatMap((firstBase) =>
  RNA_BASES.flatMap((secondBase) =>
    RNA_BASES.map((thirdBase) => {
      const codon = `${firstBase}${secondBase}${thirdBase}`
      return {
        codon,
        firstBase,
        secondBase,
        thirdBase,
        aminoAcid: CODON_TABLE[codon],
      }
    }),
  ),
)

export function translateCodon(codon: string): TranslationSignal {
  const result = CODON_TABLE[codon]
  if (!result) throw new Error(`Unknown mRNA codon: ${codon}`)
  return result
}
