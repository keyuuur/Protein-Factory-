var SPREADSHEET_ID_KEY = 'PPF_SPREADSHEET_ID';
var ATTEMPTS_SHEET_NAME = 'Attempts';
var BESTSHEET_NAME = 'BestScores';
var PROTEIN_FACTORY_V3_SHEET_NAME = 'ProteinFactoryV3';

var PROTEIN_FACTORY_V3_HEADERS = [
  'Timestamp', 'Attempt ID', 'Student Name', 'Period', 'Demo', 'Production Rating',
  'Independent Stages', 'Supported Stages', 'Repairs', 'Duration Seconds', 'Pair ID',
  'Variant Effect', 'Seed', 'Content Version', 'Stage Results JSON', 'Misconceptions JSON',
  'Transfer Results JSON', 'Full Payload JSON'
];

var ATTEMPTS_HEADERS = [
  'Timestamp',
  'Attempt ID',
  'First Name',
  'Period',
  'Score',
  'Percent',
  'Completed Status',
  'Rounds Completed',
  'Total Rounds',
  'Time Spent Seconds',
  'Current Round',
  'Autosave or Final Submit',
  'Responses JSON',
  'Round Results JSON',
  'Trait Matches JSON',
  'User Agent'
];

var BESTSHEET_HEADERS = [
  'Student Key',
  'First Name',
  'Period',
  'Best Score',
  'Best Percent',
  'Completed Status',
  'Rounds Completed',
  'Total Rounds',
  'Last Update',
  'Last Attempt ID'
];

function initializeStorage() {
  return ensureSpreadsheet();
}

function ensureSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty(SPREADSHEET_ID_KEY);

  if (spreadsheetId) {
    try {
      var found = SpreadsheetApp.openById(spreadsheetId);
      ensureLoggingSheets(found);
      return spreadsheetId;
    } catch (err) {
      // Continue to create a new one if the saved ID is no longer valid.
    }
  }

  var newSheet = SpreadsheetApp.create('Protein Factory - Data');
  props.setProperty(SPREADSHEET_ID_KEY, newSheet.getId());
  ensureLoggingSheets(newSheet);
  return newSheet.getId();
}

function ensureLoggingSheets(spreadsheet) {
  var ss = spreadsheet || getSpreadsheet_();
  getOrCreateSheet_(ss, ATTEMPTS_SHEET_NAME, ATTEMPTS_HEADERS);
  getOrCreateSheet_(ss, BESTSHEET_NAME, BESTSHEET_HEADERS);
  getOrCreateSheet_(ss, PROTEIN_FACTORY_V3_SHEET_NAME, PROTEIN_FACTORY_V3_HEADERS);
  getOrCreateSheet_(ss, PROTEIN_FACTORY_V4_SHEET_NAME, PROTEIN_FACTORY_V4_HEADERS);
}

function getSpreadsheet_() {
  var spreadsheetId = ensureSpreadsheet();
  return SpreadsheetApp.openById(spreadsheetId);
}

function getOrCreateSheet_(spreadsheet, sheetName, headers) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    var range = sheet.getRange(1, 1, 1, headers.length);
    range.setFontWeight('bold');
  }

  if (sheet.getLastColumn() < headers.length) {
    for (var i = sheet.getLastColumn() + 1; i <= headers.length; i++) {
      sheet.getRange(1, i).setValue(headers[i - 1]);
    }
  }

  return sheet;
}

function getStudentKey_(firstName, period) {
  var cleanName = String(firstName || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return cleanName + '|' + String(period || '').trim();
}
