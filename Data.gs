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
