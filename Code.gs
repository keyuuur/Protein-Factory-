var APP_TITLE = 'Protein Factory';

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(fileName) {
  return HtmlService.createHtmlOutputFromFile(fileName).getContent();
}

function doPost(event) {
  try {
    var body = JSON.parse((event && event.postData && event.postData.contents) || '{}');
    var expectedToken = PropertiesService.getScriptProperties().getProperty('RESULTS_WRITE_TOKEN');
    if (!expectedToken || String(body.token || '') !== expectedToken) {
      return jsonResponse_({ ok: false, error: 'Unauthorized.' });
    }
    var result = saveProteinFactoryAttemptV3(body.attempt || {});
    return jsonResponse_({ ok: true, attemptId: result.attemptId, duplicate: result.duplicate });
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'Submission failed: ' + err.message });
  }
}

function jsonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
