import {
  V4_CONTENT_VERSION,
  V4_FAMILY_DEFINITIONS,
  V4_FUNCTION_REFERENCE_ROWS,
  V4_SCHEMA_VERSION,
} from '../shared/catalogV4.js'

const MAX_BODY_BYTES = 250_000
const TOTAL_STAGES = 9
const ATTEMPT_KINDS = ['full-run', 'targeted-practice']
const STAGES = ['transcription', 'translation', 'function-test']
const TYPES = ['transcription', 'translation', 'protein']
const ROLES = ['original', 'same-chain-variant', 'changed-chain-variant']
const EFFECTS = ['original', 'same-chain', 'amino-acid-change']
const MISCONCEPTION_CATEGORIES = [
  'codon-grouping', 'codon-lookup', 'hint-support', 'incomplete',
  'protein-trait-model', 'rna-template-pairing', 'rna-uses-u', 'stop-signal',
]

export const submissionErrorCodes = Object.freeze({
  invalidAttempt: 'INVALID_ATTEMPT',
  methodNotAllowed: 'METHOD_NOT_ALLOWED',
  notConfigured: 'SUBMISSION_NOT_CONFIGURED',
  payloadTooLarge: 'PAYLOAD_TOO_LARGE',
  storageRejected: 'STORAGE_REJECTED',
  storageTimeout: 'STORAGE_TIMEOUT',
  storageUnavailable: 'STORAGE_UNAVAILABLE',
})

export default async function handler(request, response) {
  const attemptId = readableAttemptId(request.body?.attempt)
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendError(response, 405, submissionErrorCodes.methodNotAllowed, 'Method not allowed.', false, attemptId)
  }

  const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL
  const writeToken = process.env.RESULTS_WRITE_TOKEN
  if (!appsScriptUrl || !writeToken) {
    return sendError(
      response, 503, submissionErrorCodes.notConfigured,
      'Teacher submission is not configured.', false, attemptId,
    )
  }

  const serialized = JSON.stringify(request.body ?? {})
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) {
    return sendError(response, 413, submissionErrorCodes.payloadTooLarge, 'Attempt payload is too large.', false, attemptId)
  }

  const attempt = normalizeAttemptForSubmission(request.body?.attempt)
  if (!isValidAttempt(attempt)) {
    return sendError(
      response, 400, submissionErrorCodes.invalidAttempt,
      'Invalid Protein Factory attempt.', false, attemptId,
    )
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const upstream = await fetch(appsScriptUrl, {
      body: JSON.stringify({ attempt, token: writeToken }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      method: 'POST',
      redirect: 'follow',
      signal: controller.signal,
    })
    const result = await upstream.json().catch(() => ({}))
    if (!upstream.ok || result.ok !== true) {
      return sendError(
        response,
        502,
        typeof result.code === 'string' ? result.code : submissionErrorCodes.storageRejected,
        result.error || 'Teacher storage rejected the attempt.',
        Boolean(result.retryable),
        attempt.attemptId,
      )
    }
    return response.status(200).json({
      attemptId: attempt.attemptId,
      code: 'OK',
      duplicate: Boolean(result.duplicate),
      ok: true,
      retryable: false,
    })
  } catch (error) {
    const timedOut = error?.name === 'AbortError'
    return sendError(
      response,
      502,
      timedOut ? submissionErrorCodes.storageTimeout : submissionErrorCodes.storageUnavailable,
      timedOut ? 'Teacher storage timed out.' : 'Teacher storage could not be reached.',
      true,
      attempt.attemptId,
    )
  } finally {
    clearTimeout(timeout)
  }
}

export function normalizeAttemptForSubmission(attempt) {
  if (!attempt || typeof attempt !== 'object') return attempt
  if (attempt.schemaVersion === V4_SCHEMA_VERSION) {
    const independentStages = Number(attempt.independentStages)
    return {
      ...attempt,
      attemptKind: attempt.attemptKind == null ? 'full-run' : attempt.attemptKind,
      completionPercent: attempt.completionPercent == null ? attempt.percent : attempt.completionPercent,
      independencePercent: attempt.independencePercent == null && Number.isFinite(independentStages)
        ? percent(independentStages)
        : attempt.independencePercent,
      parentAttemptId: attempt.parentAttemptId == null ? null : attempt.parentAttemptId,
    }
  }
  if (attempt.schemaVersion === 'protein-factory-attempt-v3') {
    return {
      ...attempt,
      attemptKind: attempt.attemptKind == null ? 'full-run' : attempt.attemptKind,
      parentAttemptId: attempt.parentAttemptId == null ? null : attempt.parentAttemptId,
    }
  }
  return attempt
}

export function isValidAttempt(attempt) {
  const normalized = normalizeAttemptForSubmission(attempt)
  if (!hasAttemptIdentity(normalized)) return false
  if (normalized.schemaVersion === 'protein-factory-attempt-v3') return isValidV3Attempt(normalized)
  if (normalized.schemaVersion === V4_SCHEMA_VERSION) return isValidV4Attempt(normalized)
  return false
}

function hasAttemptIdentity(attempt) {
  return Boolean(
    attempt &&
      typeof attempt === 'object' &&
      typeof attempt.attemptId === 'string' &&
      attempt.attemptId.length >= 8 &&
      attempt.attemptId.length <= 200 &&
      typeof attempt.studentName === 'string' &&
      attempt.studentName.trim() &&
      attempt.studentName.length <= 200 &&
      typeof attempt.classPeriod === 'string' &&
      attempt.classPeriod.trim() &&
      attempt.classPeriod.length <= 100,
  )
}

function isValidV3Attempt(attempt) {
  return Boolean(
    Array.isArray(attempt.stageResults) &&
      attempt.stageResults.length <= 8 &&
      Array.isArray(attempt.transferResults) &&
      attempt.transferResults.length <= 3 &&
      ATTEMPT_KINDS.includes(attempt.attemptKind) &&
      hasValidLineage(attempt),
  )
}

function isValidV4Attempt(attempt) {
  const canonical = canonicalManifest(attempt.runManifest)
  if (!canonical || !isCanonicalManifest(attempt.runManifest, canonical)) return false
  if (
    attempt.maxScore !== TOTAL_STAGES ||
    attempt.totalRounds !== TOTAL_STAGES ||
    !Array.isArray(attempt.stageResults) ||
    attempt.stageResults.length > TOTAL_STAGES ||
    !Array.isArray(attempt.roundResults) ||
    attempt.roundResults.length !== attempt.stageResults.length ||
    !Array.isArray(attempt.transferResults) ||
    attempt.transferResults.length > 3 ||
    !Array.isArray(attempt.completedProducts) ||
    attempt.completedProducts.length !== Math.floor(attempt.stageResults.length / 3) ||
    !ATTEMPT_KINDS.includes(attempt.attemptKind) ||
    !hasValidLineage(attempt)
  ) return false

  const validStages = attempt.stageResults.every((result, index) => isCanonicalStageResult(result, canonical.rounds[index], index))
  const mirroredResults = attempt.roundResults.every((result, index) => deepEqual(result, attempt.stageResults[index]))
  const validProducts = attempt.completedProducts.every((product, index) => (
    deepEqual(product, canonical.products[index])
  ))
  const validTransfers = attempt.transferResults.every((result) => isCanonicalTransferResult(result, canonical))
  if (!validStages || !mirroredResults || !validProducts || !validTransfers) return false

  const aggregates = recomputeAggregates(attempt.stageResults)
  const expectedStatus = aggregates.score === TOTAL_STAGES ? 'Completed' : 'Incomplete'
  const expectedRating = productionRating(expectedStatus === 'Completed', aggregates.independentStages, aggregates.repairs)
  if (!hasCanonicalAttemptClaims(attempt, canonical, expectedRating)) return false
  return Boolean(
    attempt.score === aggregates.score &&
    attempt.roundsCompleted === aggregates.score &&
    attempt.percent === aggregates.completionPercent &&
    attempt.completionPercent === aggregates.completionPercent &&
    attempt.independentStages === aggregates.independentStages &&
    attempt.independencePercent === aggregates.independencePercent &&
    attempt.supportedRounds === aggregates.supportedRounds &&
    attempt.cleanRounds === aggregates.independentStages &&
    attempt.repairs === aggregates.repairs &&
    attempt.mistakes === aggregates.mistakes &&
    attempt.attempts === aggregates.attempts &&
    attempt.completionStatus === expectedStatus &&
    attempt.productionRating === expectedRating &&
    attempt.factoryRating === expectedRating &&
    attempt.currentRound === Math.min(attempt.stageResults.length + 1, TOTAL_STAGES)
  )
}

function hasValidLineage(attempt) {
  if (attempt.attemptKind === 'full-run') return attempt.parentAttemptId === null
  return attempt.attemptKind === 'targeted-practice' &&
    isNonEmptyString(attempt.parentAttemptId) && attempt.parentAttemptId !== attempt.attemptId
}

function hasCanonicalAttemptClaims(attempt, canonical, rating) {
  if (!Array.isArray(attempt.missedSkills) || !Array.isArray(attempt.recoveredConcepts) ||
      !Array.isArray(attempt.reviewSummary)) return false
  if (!hasCanonicalMissedSkills(attempt.missedSkills, attempt.stageResults, canonical)) return false

  const firstSupported = attempt.stageResults.find((result) => !result.independent)
  if (attempt.attemptKind === 'full-run') {
    if (attempt.transferResults.length !== 0 || attempt.recoveredConcepts.length !== 0) return false
    if (attempt.activeReplayChallenge === '' && attempt.replayChallengeMet !== false) return false
  } else {
    if (attempt.stageResults.length !== TOTAL_STAGES || attempt.transferResults.length !== 1 || !firstSupported) return false
    const transfer = attempt.transferResults[0]
    if (transfer.targetStage !== firstSupported.stage ||
        transfer.targetCategory !== categoryForStage(firstSupported.stage)) return false
    const expectedChallenge = `Clear ${firstSupported.title} independently with a new family.`
    if (attempt.activeReplayChallenge !== expectedChallenge || attempt.replayChallengeMet !== transfer.recovered) return false
  }

  const recovered = [...new Set(
    attempt.transferResults.filter((result) => result.recovered).map((result) => result.targetCategory),
  )]
  if (!deepEqual(attempt.recoveredConcepts, recovered)) return false
  const expectedReview = reviewSummary(attempt.missedSkills, recovered)
  const expectedGoal = replayGoal(rating, attempt.missedSkills)
  return deepEqual(attempt.reviewSummary, expectedReview) && attempt.replayGoal === expectedGoal
}

function hasCanonicalMissedSkills(skills, results, manifest) {
  const seen = new Set()
  for (const skill of skills) {
    if (!skill || typeof skill !== 'object' || !MISCONCEPTION_CATEGORIES.includes(skill.category)) return false
    const index = Number(skill.round) - 1
    const expected = manifest.rounds[index]
    if (!expected) return false
    const result = results[index]
    const key = `${skill.roundId}:${skill.category}:${skill.reason}`
    if (seen.has(key)) return false
    seen.add(key)
    if (skill.roundId !== expected.id || skill.type !== expected.type || skill.title !== canonicalStageTitle(expected, index) ||
        skill.expected !== expected.expected || skill.skillId !== `${expected.id}-${skill.category}-${skill.reason}`) return false

    if (skill.reason === 'incomplete') {
      if (result || skill.category !== 'incomplete' || skill.attempts !== 0 || skill.submitted !== 'Not answered') return false
    } else if (skill.reason === 'hint') {
      if (!result?.hintUsed || skill.category !== 'hint-support' || skill.attempts !== result.attempts ||
          skill.submitted !== result.submitted) return false
    } else if (skill.reason === 'mistake') {
      if (!result || result.mistakes < 1 || !categoryMatchesStage(skill.category, result.stage) ||
          !Number.isInteger(skill.attempts) || skill.attempts < 1 || skill.attempts > result.attempts ||
          typeof skill.submitted !== 'string' || !skill.submitted || skill.submitted === result.expected) return false
    } else return false
  }

  return manifest.rounds.every((round, index) => {
    const result = results[index]
    const roundSkills = skills.filter((skill) => skill.round === index + 1)
    if (!result) return roundSkills.some((skill) => skill.reason === 'incomplete')
    if (result.mistakes > 0 && !roundSkills.some((skill) => skill.reason === 'mistake')) return false
    if (result.hintUsed && !roundSkills.some((skill) => skill.reason === 'hint')) return false
    return roundSkills.every((skill) => skill.reason !== 'incomplete')
  })
}

function categoryMatchesStage(category, stage) {
  if (stage === 'transcription') return ['rna-template-pairing', 'rna-uses-u'].includes(category)
  if (stage === 'translation') return ['codon-grouping', 'codon-lookup', 'stop-signal'].includes(category)
  return stage === 'function-test' && category === 'protein-trait-model'
}

function categoryForStage(stage) {
  if (stage === 'transcription') return 'rna-template-pairing'
  if (stage === 'translation') return 'codon-lookup'
  return 'protein-trait-model'
}

function replayGoal(rating, skills) {
  const target = skills.find((skill) => skill.reason !== 'incomplete')
  if (rating === 'Precision') return 'Run a different sequence family and keep all nine actions independent.'
  if (target) return `Use a different family to clear ${target.title} without support.`
  return 'Complete all nine production actions with fewer repairs.'
}

function reviewSummary(skills, recovered) {
  const categories = [...new Set(skills.map((skill) => skill.category))]
  return categories.map((category) => `${categoryLabel(category)}${recovered.includes(category) ? ' (recovered on transfer)' : ''}`)
}

function categoryLabel(category) {
  return {
    'codon-grouping': 'Codon grouping',
    'codon-lookup': 'Codon wheel use',
    'hint-support': 'Explicit hint use',
    incomplete: 'Incomplete production',
    'protein-trait-model': 'Protein function model',
    'rna-template-pairing': 'DNA-to-mRNA pairing',
    'rna-uses-u': 'RNA uses U instead of T',
    'stop-signal': 'Stop signal',
  }[category]
}

function canonicalManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return null
  const familyIndex = V4_FAMILY_DEFINITIONS.findIndex((item) => item.id === manifest.familyId)
  if (familyIndex === -1) return null
  const definition = V4_FAMILY_DEFINITIONS[familyIndex]
  const rowsById = new Map(V4_FUNCTION_REFERENCE_ROWS.map((row) => [row.id, row]))
  const original = canonicalSequence(definition, 'original', definition.original, rowsById)
  const same = canonicalSequence(definition, 'same', definition.sameChain, rowsById, original)
  const changed = canonicalSequence(definition, 'changed', definition.changedChain, rowsById, original)
  const sequences = [original, same, changed]
  const rounds = sequences.flatMap((sequence, sequenceIndex) => STAGES.map((stage, actionIndex) => {
    const type = TYPES[actionIndex]
    return {
      action: stage,
      expected: type === 'transcription'
        ? sequence.mrna
        : type === 'translation' ? sequence.translatedSignals.join('-') : sequence.functionRowId,
      familyId: definition.id,
      id: `${sequence.id}-${stage === 'function-test' ? 'function' : stage}`,
      sequence,
      sequenceEffect: EFFECTS[sequenceIndex],
      sequenceId: sequence.id,
      sequenceIndex,
      sequenceRole: ROLES[sequenceIndex],
      type,
    }
  }))
  const products = sequences.map((sequence, index) => {
    const row = rowsById.get(sequence.functionRowId)
    return {
      aminoAcidChain: [...sequence.aminoAcidChain],
      dnaStrand: sequence.dnaStrand,
      expressedTrait: row.expressedTrait,
      functionRowId: row.id,
      label: index === 0 ? 'Original protein' : index === 1 ? 'Same-chain change' : 'Changed-chain change',
      mrna: sequence.mrna,
      proteinFunction: row.proteinFunction,
      sequenceId: sequence.id,
      sequenceRole: ROLES[index],
      traitColor: row.traitColor,
    }
  })
  return { definition, familyIndex, products, rounds, sequences }
}

function canonicalSequence(definition, suffix, sequenceDefinition, rowsById, original = null) {
  const row = rowsById.get(sequenceDefinition.functionRowId)
  const mrnaCodons = [...sequenceDefinition.codons]
  const mrna = mrnaCodons.join('')
  const dnaStrand = [...mrna].map((base) => ({ A: 'T', U: 'A', C: 'G', G: 'C' })[base] || '?').join('')
  return {
    aminoAcidChain: [...row.aminoAcidSequence],
    changedDnaIndex: original ? firstDifference(original.dnaStrand, dnaStrand) : null,
    dnaStrand,
    effect: suffix === 'original' ? 'original' : suffix === 'same' ? 'same-chain' : 'amino-acid-change',
    functionRowId: row.id,
    id: `${definition.id}-${suffix}`,
    mrna,
    mrnaCodons,
    role: suffix === 'original' ? 'original' : suffix === 'same' ? 'same-chain-variant' : 'changed-chain-variant',
    translatedSignals: [...row.aminoAcidSequence, 'Stop'],
  }
}

function isCanonicalManifest(manifest, canonical) {
  if (
    manifest.schemaVersion !== V4_SCHEMA_VERSION ||
    manifest.contentVersion !== V4_CONTENT_VERSION ||
    !isNonEmptyString(manifest.seed) ||
    manifest.selectionIndex !== canonical.familyIndex ||
    !deepEqual(manifest.sequenceIds, canonical.sequences.map((sequence) => sequence.id)) ||
    !deepEqual(manifest.effects, ['same-chain', 'amino-acid-change']) ||
    !Array.isArray(manifest.rounds) ||
    manifest.rounds.length !== TOTAL_STAGES
  ) return false

  return manifest.rounds.every((round, index) => {
    const expected = canonical.rounds[index]
    if (
      !round || round.id !== expected.id || round.type !== expected.type ||
      !round.context || round.context.action !== expected.action ||
      round.context.familyId !== expected.familyId ||
      round.context.sequenceId !== expected.sequenceId ||
      round.context.sequenceIndex !== expected.sequenceIndex ||
      round.context.sequenceRole !== expected.sequenceRole ||
      round.context.sequenceEffect !== expected.sequenceEffect ||
      !deepEqual(round.context.sequence, expected.sequence)
    ) return false
    if (round.type === 'transcription') {
      return round.template === expected.sequence.dnaStrand && round.answer === expected.sequence.mrna
    }
    if (round.type === 'translation') {
      return deepEqual(round.codons, expected.sequence.mrnaCodons) &&
        deepEqual(round.answers, expected.sequence.translatedSignals) && round.mode === 'perCodon'
    }
    return round.chain === expected.sequence.aminoAcidChain.join('-') &&
      round.correctRowId === expected.sequence.functionRowId &&
      deepEqual(round.referenceRows, V4_FUNCTION_REFERENCE_ROWS)
  })
}

function isCanonicalStageResult(result, expected, index) {
  if (!result || !expected || typeof result !== 'object') return false
  const mistakes = Number(result.mistakes)
  const attempts = Number(result.attempts)
  if (!Number.isInteger(mistakes) || mistakes < 0 || mistakes > 100) return false
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 100 || attempts < mistakes + 1) return false
  if (!Array.isArray(result.supportEvents) || result.supportEvents.length > 100) return false
  const independent = mistakes === 0 && !result.supportEvents.some((event) => event?.affectsIndependence === true)
  const supportLevel = Math.min(3, Math.max(result.hintUsed ? 3 : 0, mistakes >= 2 ? 2 : mistakes))
  return Boolean(
    result.id === expected.id &&
    result.title === canonicalStageTitle(expected, index) &&
    result.round === index + 1 &&
    result.familyId === expected.familyId &&
    result.sequenceIndex === expected.sequenceIndex &&
    result.sequenceId === expected.sequenceId &&
    result.sequenceRole === expected.sequenceRole &&
    result.sequenceEffect === expected.sequenceEffect &&
    result.stage === expected.action &&
    result.type === expected.type &&
    result.expected === expected.expected &&
    result.submitted === expected.expected &&
    result.correct === true &&
    result.repairs === mistakes &&
    result.independent === independent &&
    result.firstTryCorrect === (mistakes === 0 && !result.hintUsed) &&
    result.supportLevel === supportLevel &&
    deepEqual(result.sequence, expected.sequence) &&
    (expected.type === 'transcription' || result.chain === expected.sequence.aminoAcidChain.join('-')) &&
    (expected.type !== 'protein' || (
      result.expectedFunctionRowId === expected.sequence.functionRowId &&
      result.selectedFunctionRowId === expected.sequence.functionRowId
    ))
  )
}

function canonicalStageTitle(round, index) {
  const sequenceLabel = round.sequenceIndex === 0 ? 'Original Protein' : round.sequenceIndex === 1 ? 'Change A' : 'Change B'
  const actionLabel = round.action === 'transcription' ? 'Transcription' : round.action === 'translation' ? 'Translation' : 'Function Test'
  return `Action ${index + 1}: ${sequenceLabel} ${actionLabel}`
}

function isCanonicalTransferResult(result, manifest) {
  if (!result || typeof result !== 'object') return false
  const source = canonicalManifest({ familyId: result.sourceFamilyId })
  if (!source || source.definition.id === manifest.definition.id) return false
  const actionIndex = STAGES.indexOf(result.targetStage)
  if (actionIndex === -1) return false
  const expectedRound = source.rounds[6 + actionIndex]
  const expectedCategory = result.targetStage === 'transcription'
    ? 'rna-template-pairing'
    : result.targetStage === 'translation' ? 'codon-lookup' : 'protein-trait-model'
  return Boolean(
    result.taskId === `transfer-${result.targetStage}-${result.sourceFamilyId}` &&
    result.targetCategory === expectedCategory &&
    result.expected === expectedRound.expected &&
    typeof result.submitted === 'string' &&
    result.recovered === (result.submitted === result.expected)
  )
}

function recomputeAggregates(results) {
  const score = results.filter((result) => result.correct).length
  const independentStages = results.filter((result) => result.independent).length
  return {
    attempts: results.reduce((sum, result) => sum + result.attempts, 0),
    completionPercent: percent(score),
    independencePercent: percent(independentStages),
    independentStages,
    mistakes: results.reduce((sum, result) => sum + result.mistakes, 0),
    repairs: results.reduce((sum, result) => sum + result.repairs, 0),
    score,
    supportedRounds: results.filter((result) => result.correct && !result.independent).length,
  }
}

function productionRating(complete, independent, repairs) {
  if (!complete || independent < 5) return 'Recalibration'
  if (independent === 9) return 'Precision'
  if (independent >= 7 && repairs <= 2) return 'Stable'
  return 'Supported'
}

function percent(value) {
  return Math.round((value / TOTAL_STAGES) * 1000) / 10
}

function firstDifference(left, right) {
  const index = [...left].findIndex((value, position) => value !== right[position])
  return index === -1 ? null : index
}

function deepEqual(left, right) {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((item, index) => deepEqual(item, right[index]))
  }
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined).sort()
  const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined).sort()
  return deepEqual(leftKeys, rightKeys) && leftKeys.every((key) => deepEqual(left[key], right[key]))
}

function isNonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= 200
}

function readableAttemptId(attempt) {
  return isNonEmptyString(attempt?.attemptId) ? attempt.attemptId : null
}

function sendError(response, status, code, error, retryable, attemptId) {
  return response.status(status).json({ attemptId, code, error, ok: false, retryable })
}
