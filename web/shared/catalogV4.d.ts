type AminoAcid = 'Met' | 'Ala' | 'Tyr' | 'Gly' | 'Val' | 'His' | 'Asp'
type TraitColor = 'black' | 'brown' | 'tan' | 'white'
type FiveCodons = readonly [string, string, string, string, string]

export const V4_SCHEMA_VERSION: 'protein-factory-v4'
export const V4_CONTENT_VERSION: 'fur-pigment-v1'

export const V4_FUNCTION_REFERENCE_ROWS: readonly {
  readonly id: string
  readonly aminoAcidSequence: readonly [AminoAcid, AminoAcid, AminoAcid, AminoAcid]
  readonly proteinFunction: string
  readonly expressedTrait: string
  readonly traitColor: TraitColor
}[]

export const V4_FAMILY_DEFINITIONS: readonly {
  readonly id: string
  readonly name: string
  readonly original: { readonly codons: FiveCodons; readonly functionRowId: string }
  readonly sameChain: { readonly codons: FiveCodons; readonly functionRowId: string }
  readonly changedChain: { readonly codons: FiveCodons; readonly functionRowId: string }
}[]
