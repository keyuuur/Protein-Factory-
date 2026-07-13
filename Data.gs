var PROTEIN_FACTORY_V4_SHEET_NAME = 'ProteinFactoryV4';
var PROTEIN_FACTORY_V4_HEADERS = [
  'Timestamp', 'Attempt ID', 'Student Name', 'Period', 'Demo', 'Production Rating',
  'Score', 'Max Score', 'Independent Stages', 'Supported Stages', 'Repairs',
  'Duration Seconds', 'Family ID', 'Sequence IDs JSON', 'Effects JSON', 'Seed',
  'Content Version', 'Stage Results JSON', 'Misconceptions JSON',
  'Completed Products JSON', 'Transfer Results JSON', 'Full Payload JSON',
  'Completion Percent', 'Independence Percent', 'Attempt Kind', 'Parent Attempt ID'
];

function saveAttempt(payload) {
  try {
    var row = normalizeAttemptPayload_(payload || {});
    var spreadsheet = getSpreadsheet_();
    var attemptsSheet = getOrCreateSheet_(spreadsheet, ATTEMPTS_SHEET_NAME, ATTEMPTS_HEADERS);
    var bestSheet = getOrCreateSheet_(spreadsheet, BESTSHEET_NAME, BESTSHEET_HEADERS);

    attemptsSheet.appendRow([
      new Date(),
      literalCell_(row.attemptId),
      literalCell_(row.firstName),
      literalCell_(row.period),
      row.score,
      row.percent,
      literalCell_(row.completedStatus),
      row.roundsCompleted,
      row.totalRounds,
      row.timeSpentSeconds,
      row.currentRound,
      literalCell_(row.submitType),
      literalCell_(JSON.stringify(row.responses || [])),
      literalCell_(JSON.stringify(row.roundResults || [])),
      literalCell_(JSON.stringify(row.traitMatches || [])),
      literalCell_(row.userAgent || '')
    ]);

    var bestRecord = upsertBestScore_(bestSheet, row);
    return {
      success: true,
      message: 'Saved',
      attemptId: row.attemptId,
      bestScore: bestRecord.score,
      bestPercent: bestRecord.percent
    };
  } catch (err) {
    throw new Error('Save failed: ' + err.message);
  }
}

function saveProteinFactoryAttemptV3(payload) {
  var schemaVersion = String((payload && payload.schemaVersion) || '');
  if (schemaVersion === 'protein-factory-v4') {
    return saveProteinFactoryAttemptV4(payload);
  }
  if (schemaVersion !== 'protein-factory-attempt-v3') {
    throw new Error('Unsupported payload schema.');
  }
  var attemptId = String(payload.attemptId || '').trim();
  var studentName = String(payload.studentName || '').trim();
  var classPeriod = String(payload.classPeriod || '').trim();
  if (!attemptId || !studentName || !classPeriod) {
    throw new Error('Attempt ID, student name, and period are required.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var spreadsheet = getSpreadsheet_();
    var sheet = getOrCreateSheet_(spreadsheet, PROTEIN_FACTORY_V3_SHEET_NAME, PROTEIN_FACTORY_V3_HEADERS);
    var existingRow = findAttemptRow_(sheet, attemptId);
    if (existingRow) return { attemptId: attemptId, duplicate: true, row: existingRow };

    var stageResults = Array.isArray(payload.stageResults) ? payload.stageResults.slice(0, 8) : [];
    var transferResults = Array.isArray(payload.transferResults) ? payload.transferResults.slice(0, 3) : [];
    var misconceptions = Array.isArray(payload.misconceptions) ? payload.misconceptions : [];
    sheet.appendRow([
      new Date(), literalCell_(attemptId), literalCell_(studentName), literalCell_(classPeriod), Boolean(payload.isDemo),
      literalCell_(payload.productionRating || ''), Number(payload.independentCount || 0),
      Number(payload.supportCount || 0), Number(payload.repairs || 0),
      Number(payload.durationSeconds || 0), literalCell_((payload.orderPair && payload.orderPair.pairId) || ''),
      literalCell_(payload.variantEffect || ''), literalCell_(payload.seed || ''), literalCell_(payload.contentVersion || ''),
      literalCell_(JSON.stringify(stageResults)), literalCell_(JSON.stringify(misconceptions)),
      literalCell_(JSON.stringify(transferResults)), literalCell_(JSON.stringify(payload))
    ]);
    return { attemptId: attemptId, duplicate: false, row: sheet.getLastRow() };
  } finally {
    lock.releaseLock();
  }
}

function saveProteinFactoryAttemptV4(payload) {
  if (String((payload && payload.schemaVersion) || '') !== 'protein-factory-v4') {
    throw new Error('Unsupported payload schema.');
  }

  var attemptId = String(payload.attemptId || '').trim();
  var studentName = String(payload.studentName || '').trim();
  var classPeriod = String(payload.classPeriod || '').trim();
  var manifest = payload.runManifest || {};
  var sequenceIds = Array.isArray(manifest.sequenceIds) ? manifest.sequenceIds.slice() : [];
  var effects = Array.isArray(manifest.effects) ? manifest.effects.slice() : [];
  var stageResults = Array.isArray(payload.stageResults) ? payload.stageResults.slice() : [];
  var roundResults = Array.isArray(payload.roundResults) ? payload.roundResults.slice() : [];
  var completedProducts = Array.isArray(payload.completedProducts) ? payload.completedProducts.slice() : [];
  var transferResults = Array.isArray(payload.transferResults) ? payload.transferResults.slice() : [];
  var misconceptions = Array.isArray(payload.missedSkills) ? payload.missedSkills : [];
  var attemptKind = payload.attemptKind == null ? 'full-run' : String(payload.attemptKind);
  var parentAttemptId = payload.parentAttemptId == null ? '' : String(payload.parentAttemptId).trim();

  if (!attemptId || !studentName || !classPeriod) {
    throw new Error('Attempt ID, student name, and period are required.');
  }
  if (
    String(manifest.schemaVersion || '') !== 'protein-factory-v4' ||
    !String(manifest.familyId || '').trim() ||
    !String(manifest.seed || '').trim() ||
    String(manifest.contentVersion || '') !== 'fur-pigment-v1' ||
    sequenceIds.length !== 3 ||
    !hasUniqueNonEmptyStrings_(sequenceIds) ||
    !Array.isArray(manifest.rounds) ||
    manifest.rounds.length !== 9 ||
    effects.length !== 2 ||
    effects[0] !== 'same-chain' ||
    effects[1] !== 'amino-acid-change'
  ) {
    throw new Error('Invalid V4 run manifest.');
  }
  if (
    Number(payload.maxScore) !== 9 || Number(payload.totalRounds) !== 9 ||
    stageResults.length > 9 || roundResults.length !== stageResults.length ||
    completedProducts.length !== Math.floor(stageResults.length / 3) || transferResults.length > 3 ||
    ['full-run', 'targeted-practice'].indexOf(attemptKind) === -1 ||
    (attemptKind === 'targeted-practice' && (!parentAttemptId || parentAttemptId === attemptId))
  ) {
    throw new Error('V4 result payload exceeds its allowed limits.');
  }
  var expectedStages = ['transcription', 'translation', 'function-test'];
  var expectedTypes = ['transcription', 'translation', 'protein'];
  var expectedRoles = ['original', 'same-chain-variant', 'changed-chain-variant'];
  var expectedEffects = ['original', 'same-chain', 'amino-acid-change'];
  var resultIds = {};
  var validStageResults = stageResults.every(function(result, index) {
    var sequenceIndex = Math.floor(index / 3);
    var resultId = String((result && result.id) || '').trim();
    var manifestRound = manifest.rounds[index] || {};
    if (!result || !resultId || resultIds[resultId]) return false;
    resultIds[resultId] = true;
    var expectedAnswer = String(manifestRound.type || '') === 'transcription'
      ? String(manifestRound.answer || '')
      : String(manifestRound.type || '') === 'translation'
        ? (Array.isArray(manifestRound.answers) ? manifestRound.answers.join('-') : '')
        : String(manifestRound.correctRowId || '');
    var supportEvents = Array.isArray(result.supportEvents) ? result.supportEvents : [];
    var mistakeCount = Number(result.mistakes);
    var expectedIndependent = mistakeCount === 0 && !supportEvents.some(function(event) {
      return event && event.affectsIndependence === true;
    });
    return Number(result.round) === index + 1 &&
      String(result.familyId || '') === String(manifest.familyId || '') &&
      Number(result.sequenceIndex) === sequenceIndex &&
      String(result.sequenceId || '') === String(sequenceIds[sequenceIndex]) &&
      String(result.sequenceRole || '') === expectedRoles[sequenceIndex] &&
      String(result.sequenceEffect || '') === expectedEffects[sequenceIndex] &&
      String(result.stage || '') === expectedStages[index % 3] &&
      String(result.type || '') === expectedTypes[index % 3] &&
      String(result.expected || '') === expectedAnswer && String(result.submitted || '') === expectedAnswer &&
      result.correct === true && result.independent === expectedIndependent &&
      isFinite(mistakeCount) && mistakeCount >= 0 && mistakeCount <= 100 &&
      Number(result.repairs) === mistakeCount &&
      resultId === String(manifestRound.id || '');
  });
  var mirroredResults = roundResults.every(function(result, index) {
    var stage = stageResults[index] || {};
    return result && JSON.stringify(result) === JSON.stringify(stage);
  });
  var validProducts = completedProducts.every(function(product, index) {
    var manifestRound = manifest.rounds[(index * 3) + 2] || {};
    var sequence = (manifestRound.context && manifestRound.context.sequence) || {};
    var referenceRows = Array.isArray(manifestRound.referenceRows) ? manifestRound.referenceRows : [];
    var reference = referenceRows.filter(function(row) {
      return String((row && row.id) || '') === String(sequence.functionRowId || '');
    })[0] || {};
    if (
      !product ||
      String(product.sequenceId || '') !== String(sequenceIds[index] || '') ||
      String(product.sequenceRole || '') !== expectedRoles[index] ||
      !Array.isArray(product.aminoAcidChain) ||
      product.aminoAcidChain.length !== 4 ||
      !product.aminoAcidChain.every(function(aminoAcid) { return Boolean(String(aminoAcid || '').trim()); }) ||
      !String(product.functionRowId || '').trim() ||
      !String(product.proteinFunction || '').trim() ||
      !String(product.expressedTrait || '').trim() ||
      String(product.dnaStrand || '') !== String(sequence.dnaStrand || '') ||
      String(product.mrna || '') !== String(sequence.mrna || '') ||
      JSON.stringify(product.aminoAcidChain) !== JSON.stringify(sequence.aminoAcidChain) ||
      String(product.functionRowId || '') !== String(sequence.functionRowId || '') ||
      String(product.proteinFunction || '') !== String(reference.proteinFunction || '') ||
      String(product.expressedTrait || '') !== String(reference.expressedTrait || '') ||
      String(product.traitColor || '') !== String(reference.traitColor || '')
    ) return false;
    return true;
  });
  var correctCount = stageResults.filter(function(result) { return result.correct; }).length;
  var independentCount = stageResults.filter(function(result) { return result.independent; }).length;
  var repairCount = stageResults.reduce(function(sum, result) { return sum + Number(result.repairs || 0); }, 0);
  var attemptCount = stageResults.reduce(function(sum, result) { return sum + Number(result.attempts || 0); }, 0);
  var mistakeCount = stageResults.reduce(function(sum, result) { return sum + Number(result.mistakes || 0); }, 0);
  var supportedCount = stageResults.filter(function(result) { return result.correct && !result.independent; }).length;
  var expectedPercent = Math.round((correctCount / 9) * 1000) / 10;
  var expectedIndependencePercent = Math.round((independentCount / 9) * 1000) / 10;
  var completionPercent = payload.completionPercent == null ? expectedPercent : Number(payload.completionPercent);
  var independencePercent = payload.independencePercent == null ? expectedIndependencePercent : Number(payload.independencePercent);
  var expectedStatus = correctCount === 9 ? 'Completed' : 'Incomplete';
  if (
    !validStageResults || !mirroredResults || !validProducts ||
    Number(payload.score) !== correctCount || Number(payload.roundsCompleted) !== correctCount ||
    Number(payload.percent) !== expectedPercent || completionPercent !== expectedPercent ||
    Number(payload.independentStages) !== independentCount || independencePercent !== expectedIndependencePercent ||
    Number(payload.supportedRounds) !== supportedCount || Number(payload.cleanRounds) !== independentCount ||
    Number(payload.repairs) !== repairCount || Number(payload.mistakes) !== mistakeCount ||
    Number(payload.attempts) !== attemptCount || String(payload.completionStatus || '') !== expectedStatus
  ) {
    throw new Error('Invalid V4 stage or product results.');
  }
  if (String(payload.completionStatus || '') === 'Completed' && (correctCount !== 9 || stageResults.length !== 9 || completedProducts.length !== 3)) {
    throw new Error('Completed V4 attempts require nine stage results and three product outcomes.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var spreadsheet = getSpreadsheet_();
    var sheet = getOrCreateSheet_(spreadsheet, PROTEIN_FACTORY_V4_SHEET_NAME, PROTEIN_FACTORY_V4_HEADERS);
    var existingRow = findAttemptRow_(sheet, attemptId);
    if (existingRow) return { attemptId: attemptId, duplicate: true, row: existingRow };

    sheet.appendRow([
      new Date(), literalCell_(attemptId), literalCell_(studentName), literalCell_(classPeriod), Boolean(payload.isDemo),
      literalCell_(payload.productionRating || ''), Number(payload.score || 0), Number(payload.maxScore || 9),
      Number(payload.independentStages || 0), Number(payload.supportedRounds || 0),
      Number(payload.repairs || 0), Number(payload.timeSpent || 0), literalCell_(manifest.familyId || ''),
      literalCell_(JSON.stringify(sequenceIds)), literalCell_(JSON.stringify(effects)), literalCell_(manifest.seed || ''),
      literalCell_(manifest.contentVersion || ''), literalCell_(JSON.stringify(stageResults)),
      literalCell_(JSON.stringify(misconceptions)), literalCell_(JSON.stringify(completedProducts)),
      literalCell_(JSON.stringify(transferResults)), literalCell_(JSON.stringify(payload)),
      completionPercent, independencePercent, literalCell_(attemptKind), literalCell_(parentAttemptId)
    ]);
    return { attemptId: attemptId, duplicate: false, row: sheet.getLastRow() };
  } finally {
    lock.releaseLock();
  }
}

function findAttemptRow_(sheet, attemptId) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  var range = sheet.getRange(2, 2, lastRow - 1, 1);
  var safeAttemptId = literalCell_(attemptId);
  var existing = range.createTextFinder(safeAttemptId)
    .matchEntireCell(true)
    .findNext();
  if (!existing && safeAttemptId !== String(attemptId || '')) {
    existing = range.createTextFinder(String(attemptId || '')).matchEntireCell(true).findNext();
  }
  return existing ? existing.getRow() : 0;
}

function literalCell_(value) {
  var text = String(value == null ? '' : value);
  return /^\s*[=+\-@]/.test(text) ? "'" + text : text;
}

function literalCellValue_(value) {
  var text = String(value == null ? '' : value);
  return text.charAt(0) === "'" && /^\s*[=+\-@]/.test(text.substring(1)) ? text.substring(1) : text;
}

function hasUniqueNonEmptyStrings_(values) {
  var seen = {};
  for (var i = 0; i < values.length; i++) {
    var value = String(values[i] || '').trim();
    if (!value || seen[value]) return false;
    seen[value] = true;
  }
  return true;
}

function normalizeAttemptPayload_(payload) {
  var firstName = String(payload.firstName || '').trim();
  if (!firstName) {
    firstName = 'Unknown';
  }
  var period = String(payload.period || '').trim();
  if (!period) {
    period = 'Unspecified';
  }

  var totalRounds = Number(payload.totalRounds || 0);
  if (!totalRounds || totalRounds < 1) {
    totalRounds = 8;
  }

  var roundsCompleted = Number(payload.roundsCompleted || 0);
  if (isNaN(roundsCompleted)) {
    roundsCompleted = 0;
  }

  var score = Number(payload.score || 0);
  if (isNaN(score)) {
    score = 0;
  }

  var percent = Number(payload.percent || 0);
  if (isNaN(percent)) {
    percent = totalRounds > 0 ? Math.round((score / totalRounds) * 1000) / 10 : 0;
  }

  var currentRound = Number(payload.currentRound || 1);
  if (isNaN(currentRound) || currentRound < 1) {
    currentRound = 1;
  }

  var timeSpent = Number(payload.timeSpentSeconds || 0);
  if (isNaN(timeSpent)) {
    timeSpent = 0;
  }

  var responses = [];
  if (Array.isArray(payload.responses)) {
    responses = payload.responses;
  }

  var roundResults = [];
  if (Array.isArray(payload.roundResults)) {
    roundResults = payload.roundResults;
  }

  var isAutosave = Boolean(payload.isAutosave);
  var isFinalSubmit = Boolean(payload.isFinalSubmit);
  var submitType = isFinalSubmit ? 'Final Submit' : 'Autosave';
  if (!isAutosave && !isFinalSubmit) {
    submitType = 'Checkpoint';
  }

  var completedStatus = String(payload.completedStatus || 'In Progress');
  if (isFinalSubmit && roundsCompleted >= totalRounds) {
    completedStatus = 'Completed';
  } else if (isFinalSubmit) {
    completedStatus = payload.completedStatus || 'Incomplete';
  }

  return {
    attemptId: String(payload.attemptId || Utilities.getUuid()),
    firstName: firstName,
    period: period,
    score: score,
    percent: percent,
    completedStatus: completedStatus,
    roundsCompleted: roundsCompleted,
    totalRounds: totalRounds,
    timeSpentSeconds: timeSpent,
    currentRound: currentRound,
    submitType: submitType,
    responses: responses,
    roundResults: roundResults,
    traitMatches: extractTraitMatches_(roundResults),
    userAgent: String(payload.userAgent || ''),
    isAutosave: isAutosave
  };
}

function extractTraitMatches_(roundResults) {
  return (roundResults || [])
    .filter(function (row) {
      return row && row.type === 'protein';
    })
    .map(function (row) {
      return {
        round: row.round,
        chain: row.chain,
        selectedProtein: row.selectedProtein || '',
        selectedTrait: row.selectedTrait || '',
        correct: Boolean(row.correct)
      };
    });
}

function upsertBestScore_(bestSheet, row) {
  var key = getStudentKey_(row.firstName, row.period);
  var data = bestSheet.getDataRange().getValues();
  var foundRow = -1;
  var existingScore = 0;
  var existingPercent = 0;
  var bestScore = row.score;
  var bestPercent = row.percent;

  for (var i = 1; i < data.length; i++) {
    if (literalCellValue_(data[i][0]) === key) {
      foundRow = i + 1;
      existingScore = Number(data[i][3] || 0);
      existingPercent = Number(data[i][4] || 0);
      break;
    }
  }

  if (foundRow === -1) {
    bestSheet.appendRow([
      literalCell_(key),
      literalCell_(row.firstName),
      literalCell_(row.period),
      bestScore,
      bestPercent,
      literalCell_(row.completedStatus),
      row.roundsCompleted,
      row.totalRounds,
      new Date(),
      literalCell_(row.attemptId)
    ]);
    return {
      score: bestScore,
      percent: bestPercent
    };
  }

  if (row.score > existingScore || (row.score === existingScore && row.percent > existingPercent)) {
    bestSheet.getRange(foundRow, 1, 1, 10).setValues([[
      literalCell_(key),
      literalCell_(row.firstName),
      literalCell_(row.period),
      row.score,
      row.percent,
      literalCell_(row.completedStatus),
      row.roundsCompleted,
      row.totalRounds,
      new Date(),
      literalCell_(row.attemptId)
    ]]);
    return {
      score: row.score,
      percent: row.percent
    };
  }

  return {
    score: existingScore,
    percent: existingPercent
  };
}
