export const V4_SCHEMA_VERSION = 'protein-factory-v4'
export const V4_CONTENT_VERSION = 'fur-pigment-v1'

export const V4_FUNCTION_REFERENCE_ROWS = deepFreeze([
  {
    id: 'black-fur',
    aminoAcidSequence: ['Met', 'Ala', 'Tyr', 'Gly'],
    proteinFunction: 'High pigment production',
    expressedTrait: 'Black fur',
    traitColor: 'black',
  },
  {
    id: 'brown-fur',
    aminoAcidSequence: ['Met', 'Val', 'Tyr', 'Gly'],
    proteinFunction: 'Moderate pigment production',
    expressedTrait: 'Brown fur',
    traitColor: 'brown',
  },
  {
    id: 'tan-fur',
    aminoAcidSequence: ['Met', 'Val', 'His', 'Gly'],
    proteinFunction: 'Low pigment production',
    expressedTrait: 'Tan fur',
    traitColor: 'tan',
  },
  {
    id: 'white-fur',
    aminoAcidSequence: ['Met', 'Val', 'His', 'Asp'],
    proteinFunction: 'No pigment production',
    expressedTrait: 'White fur',
    traitColor: 'white',
  },
])

export const V4_FAMILY_DEFINITIONS = deepFreeze([
  family('black-to-brown-a', 'Black to brown pigment model',
    ['AUG', 'GCU', 'UAU', 'GGU', 'UAA'], ['AUG', 'GCC', 'UAU', 'GGU', 'UAA'],
    ['AUG', 'GUU', 'UAU', 'GGU', 'UAA'], 'black-fur', 'brown-fur'),
  family('brown-to-black-b', 'Brown to black pigment model',
    ['AUG', 'GUU', 'UAU', 'GGU', 'UAA'], ['AUG', 'GUC', 'UAU', 'GGU', 'UAA'],
    ['AUG', 'GCU', 'UAU', 'GGU', 'UAA'], 'brown-fur', 'black-fur'),
  family('brown-to-tan-c', 'Brown to tan pigment model',
    ['AUG', 'GUU', 'UAU', 'GGU', 'UAA'], ['AUG', 'GUU', 'UAC', 'GGU', 'UAA'],
    ['AUG', 'GUU', 'CAU', 'GGU', 'UAA'], 'brown-fur', 'tan-fur'),
  family('tan-to-brown-d', 'Tan to brown pigment model',
    ['AUG', 'GUU', 'CAU', 'GGU', 'UAA'], ['AUG', 'GUU', 'CAC', 'GGU', 'UAA'],
    ['AUG', 'GUU', 'UAU', 'GGU', 'UAA'], 'tan-fur', 'brown-fur'),
  family('tan-to-white-e', 'Tan to white pigment model',
    ['AUG', 'GUU', 'CAU', 'GGU', 'UAA'], ['AUG', 'GUU', 'CAU', 'GGC', 'UAA'],
    ['AUG', 'GUU', 'CAU', 'GAU', 'UAA'], 'tan-fur', 'white-fur'),
  family('white-to-tan-f', 'White to tan pigment model',
    ['AUG', 'GUU', 'CAU', 'GAU', 'UAA'], ['AUG', 'GUU', 'CAU', 'GAC', 'UAA'],
    ['AUG', 'GUU', 'CAU', 'GGU', 'UAA'], 'white-fur', 'tan-fur'),
])

function family(id, name, originalCodons, sameChainCodons, changedChainCodons, originalFunctionRowId, changedFunctionRowId) {
  return {
    id,
    name,
    original: { codons: originalCodons, functionRowId: originalFunctionRowId },
    sameChain: { codons: sameChainCodons, functionRowId: originalFunctionRowId },
    changedChain: { codons: changedChainCodons, functionRowId: changedFunctionRowId },
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}
