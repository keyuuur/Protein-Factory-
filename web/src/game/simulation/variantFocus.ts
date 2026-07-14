import type {
  GameRound,
  GameSessionState,
  ProteinSequence,
  RunManifestV4,
  TranslationRound,
  TranscriptionRound,
  VariantComparisonConsequences,
  VariantComparisonSnapshot,
  VariantFocus,
} from '../../types'

export const variantInputBlank = ' '

export function selectVariantFocus(round: GameRound): VariantFocus | null {
  const sequenceIndex = round.context.sequenceIndex
  const changedDnaIndex = round.context.sequence.changedDnaIndex
  if (
    sequenceIndex === 0
    || changedDnaIndex === null
    || changedDnaIndex < 0
    || changedDnaIndex >= round.context.sequence.dnaStrand.length
  ) return null

  const changedCodonIndex = Math.floor(changedDnaIndex / 3)
  return {
    changedCodonIndex,
    changedCodonOffset: (changedDnaIndex % 3) as 0 | 1 | 2,
    changedDnaIndex,
    changedMrnaIndex: changedDnaIndex,
    editableCodonIndices: [changedCodonIndex],
    editableDnaIndices: [changedDnaIndex],
    sequenceIndex,
  }
}

export function buildVariantTranscriptionInput(round: TranscriptionRound): string | null {
  const focus = selectVariantFocus(round)
  return focus ? replaceAt(round.answer, focus.changedMrnaIndex, variantInputBlank) : null
}

export function buildVariantTranslationAnswers(round: TranslationRound): string[] | null {
  const focus = selectVariantFocus(round)
  if (!focus || focus.changedCodonIndex >= round.answers.length) return null
  const answers: string[] = [...round.answers]
  answers[focus.changedCodonIndex] = ''
  return answers
}

export function selectCurrentVariantComparisonConsequences(
  state: GameSessionState,
): VariantComparisonConsequences | null {
  const sequenceIndex = state.runManifest.rounds[state.currentRoundIndex]?.context.sequenceIndex
  return sequenceIndex === 1 || sequenceIndex === 2
    ? selectVariantComparisonConsequences(state.runManifest, sequenceIndex)
    : null
}

export function selectVariantComparisonConsequences(
  manifest: RunManifestV4,
  sequenceIndex: 1 | 2,
): VariantComparisonConsequences | null {
  const original = sequenceFor(manifest, 0)
  const variant = sequenceFor(manifest, sequenceIndex)
  const variantRound = manifest.rounds[sequenceIndex * 3]
  const functionRound = manifest.rounds[sequenceIndex * 3 + 2]
  if (!original || !variant || !variantRound || functionRound?.type !== 'protein') return null

  const focus = selectVariantFocus(variantRound)
  if (!focus) return null
  const originalRow = functionRound.referenceRows.find((row) => row.id === original.functionRowId)
  const variantRow = functionRound.referenceRows.find((row) => row.id === variant.functionRowId)
  if (!originalRow || !variantRow) return null

  const originalSnapshot = comparisonSnapshot(original, focus, originalRow)
  const variantSnapshot = comparisonSnapshot(variant, focus, variantRow)
  return {
    aminoAcidChainChanged: originalSnapshot.aminoAcidChain.join('-') !== variantSnapshot.aminoAcidChain.join('-'),
    aminoAcidChanged: originalSnapshot.translatedSignal !== variantSnapshot.translatedSignal,
    codonChanged: originalSnapshot.codon !== variantSnapshot.codon,
    dnaBaseChanged: originalSnapshot.dnaBase !== variantSnapshot.dnaBase,
    effect: variant.effect === 'original' ? 'same-chain' : variant.effect,
    expressedTraitChanged: originalSnapshot.expressedTrait !== variantSnapshot.expressedTrait,
    focus,
    mrnaBaseChanged: originalSnapshot.mrnaBase !== variantSnapshot.mrnaBase,
    original: originalSnapshot,
    proteinFunctionChanged: originalSnapshot.functionRowId !== variantSnapshot.functionRowId,
    sequenceIndex,
    variant: variantSnapshot,
  }
}

function sequenceFor(manifest: RunManifestV4, sequenceIndex: 0 | 1 | 2): ProteinSequence | undefined {
  return manifest.rounds[sequenceIndex * 3]?.context.sequence
}

function comparisonSnapshot(
  sequence: ProteinSequence,
  focus: VariantFocus,
  row: { id: string; proteinFunction: string; expressedTrait: string },
): VariantComparisonSnapshot {
  return {
    aminoAcidChain: [...sequence.aminoAcidChain],
    codon: sequence.mrnaCodons[focus.changedCodonIndex],
    dnaBase: sequence.dnaStrand[focus.changedDnaIndex],
    expressedTrait: row.expressedTrait,
    functionRowId: row.id,
    mrnaBase: sequence.mrna[focus.changedMrnaIndex],
    proteinFunction: row.proteinFunction,
    translatedSignal: sequence.translatedSignals[focus.changedCodonIndex],
  }
}

function replaceAt(input: string, index: number, value: string): string {
  return `${input.slice(0, index)}${value}${input.slice(index + 1)}`
}
