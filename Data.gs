function saveAttempt(payload) {
  try {
    var row = normalizeAttemptPayload_(payload || {});
    var spreadsheet = getSpreadsheet_();
    var attemptsSheet = getOrCreateSheet_(spreadsheet, ATTEMPTS_SHEET_NAME, ATTEMPTS_HEADERS);
    var bestSheet = getOrCreateSheet_(spreadsheet, BESTSHEET_NAME, BESTSHEET_HEADERS);

    attemptsSheet.appendRow([
      new Date(),
      row.attemptId,
      row.firstName,
      row.period,
      row.score,
      row.percent,
      row.completedStatus,
      row.roundsCompleted,
      row.totalRounds,
      row.timeSpentSeconds,
      row.currentRound,
      row.submitType,
      JSON.stringify(row.responses || []),
      JSON.stringify(row.roundResults || []),
      JSON.stringify(row.traitMatches || []),
      row.userAgent || ''
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
  if (String(payload.schemaVersion || '') !== 'protein-factory-attempt-v3') {
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
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var existing = sheet.getRange(2, 2, lastRow - 1, 1).createTextFinder(attemptId).matchEntireCell(true).findNext();
      if (existing) return { attemptId: attemptId, duplicate: true, row: existing.getRow() };
    }

    var stageResults = Array.isArray(payload.stageResults) ? payload.stageResults.slice(0, 8) : [];
    var transferResults = Array.isArray(payload.transferResults) ? payload.transferResults.slice(0, 3) : [];
    var misconceptions = Array.isArray(payload.misconceptions) ? payload.misconceptions : [];
    sheet.appendRow([
      new Date(), attemptId, studentName, classPeriod, Boolean(payload.isDemo),
      String(payload.productionRating || ''), Number(payload.independentCount || 0),
      Number(payload.supportCount || 0), Number(payload.repairs || 0),
      Number(payload.durationSeconds || 0), String((payload.orderPair && payload.orderPair.pairId) || ''),
      String(payload.variantEffect || ''), String(payload.seed || ''), String(payload.contentVersion || ''),
      JSON.stringify(stageResults), JSON.stringify(misconceptions), JSON.stringify(transferResults), JSON.stringify(payload)
    ]);
    return { attemptId: attemptId, duplicate: false, row: sheet.getLastRow() };
  } finally {
    lock.releaseLock();
  }
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
    if (data[i][0] === key) {
      foundRow = i + 1;
      existingScore = Number(data[i][3] || 0);
      existingPercent = Number(data[i][4] || 0);
      break;
    }
  }

  if (foundRow === -1) {
    bestSheet.appendRow([
      key,
      row.firstName,
      row.period,
      bestScore,
      bestPercent,
      row.completedStatus,
      row.roundsCompleted,
      row.totalRounds,
      new Date(),
      row.attemptId
    ]);
    return {
      score: bestScore,
      percent: bestPercent
    };
  }

  if (row.score > existingScore || (row.score === existingScore && row.percent > existingPercent)) {
    bestSheet.getRange(foundRow, 1, 1, 10).setValues([[
      key,
      row.firstName,
      row.period,
      row.score,
      row.percent,
      row.completedStatus,
      row.roundsCompleted,
      row.totalRounds,
      new Date(),
      row.attemptId
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
