const fs = require('fs');
const vm = require('vm');

const AUTO_SAVE_DEBOUNCE_MS = 1250;
const TRANSITION_COOLDOWN_MS = 420;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeEnv() {
  const htmlById = new Map();

  function fakeEl(id) {
    return {
      id,
      _innerHTML: '',
      _value: '',
      style: {},
      showModalCalled: false,
      closeCalled: false,
      set innerHTML(v) {
        this._innerHTML = String(v);
      },
      get innerHTML() {
        return this._innerHTML;
      },
      get textContent() {
        return this._innerHTML;
      },
      set textContent(v) {
        this._innerHTML = String(v);
      },
      set value(v) {
        this._value = String(v);
      },
      get value() {
        return this._value;
      },
      addEventListener() {},
      showModal() {
        this.showModalCalled = true;
      },
      close() {
        this.closeCalled = true;
      }
    };
  }

  const app = fakeEl('app');
  const modal = fakeEl('codon-modal');
  const modalCells = fakeEl('codon-wheel-cells');
  const firstName = fakeEl('first-name');
  const period = fakeEl('period');
  [app, modal, modalCells, firstName, period].forEach((el) => htmlById.set(el.id, el));

  const savedPayloads = [];
  const windowListeners = {};
  let successHandler;
  let failureHandler;

  const ctx = {
    console,
    Date,
    Math,
    navigator: { userAgent: 'agent-mock-browser' },
    alert: (msg) => {
      throw new Error('ALERT:' + msg);
    },
    setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    Number,
    String,
    Math,
    Boolean,
    JSON,
    Array,
    Object,
    RegExp,
    encodeURIComponent,
    window: {},
    requestAnimationFrame: (fn) => setTimeout(fn, 0)
  };

  const doc = {
    getElementById(id) {
      if (!htmlById.has(id)) {
        htmlById.set(id, fakeEl(id));
      }
      return htmlById.get(id);
    }
  };

  const scriptService = {
    run: {
      withFailureHandler(fn) {
        failureHandler = fn;
        return this;
      },
      withSuccessHandler(fn) {
        successHandler = fn;
        return this;
      },
      saveAttempt(payload) {
        savedPayloads.push(payload);
        if (!successHandler) {
          return;
        }
        setTimeout(() => {
          successHandler({
            bestScore: payload.score,
            bestPercent: payload.percent
          });
        }, 0);
      }
    }
  };

  ctx.document = doc;
  ctx.window = {
    addEventListener: (name, fn) => {
      windowListeners[name] = fn;
    },
    confirm: () => true
  };
  const googleNamespace = { script: scriptService };
  ctx.google = googleNamespace;
  ctx.window.google = googleNamespace;
  // self-reference
  ctx.window.window = ctx.window;

  return {
    ctx,
    app,
    firstName,
    period,
    modal,
    modalCells,
    savedPayloads,
    getWindowListeners: () => windowListeners
  };
}

function loadGame(ctxBundle) {
  const scriptHtml = fs.readFileSync('ClientScript.html', 'utf8');
  const match = scriptHtml.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('No script block found');
  }
  vm.createContext(ctxBundle.ctx);
  vm.runInContext(match[1], ctxBundle.ctx);
  return ctxBundle.ctx.window;
}

function appendToRound(win, values) {
  for (let i = 0; i < values.length; i++) {
    win.appendBase(values[i]);
  }
}

function assertContains(html, phrase, label) {
  if (!html.includes(phrase)) {
    throw new Error(`${label}: expected to find ${JSON.stringify(phrase)}`);
  }
}

async function completeBaseRound(win, sequence) {
  win.clearInput();
  appendToRound(win, sequence);
  win.checkCurrentRound();
  await proceedToNextRound(win);
}

async function proceedToNextRound(win) {
  win.proceedToNextRound();
  await sleep(TRANSITION_COOLDOWN_MS);
}

async function runHappyPath() {
  const env = makeEnv();
  const win = loadGame(env);

  env.firstName.value = 'Testy';
  env.period.value = '2';
  win.startGame();
  win.skipTutorial();

  await completeBaseRound(win, ['T', 'A', 'G', 'C']);
  await completeBaseRound(win, ['G', 'C', 'A', 'T']);
  await completeBaseRound(win, ['A', 'U', 'G']);
  await completeBaseRound(win, ['G', 'C', 'U', 'A']);

  win.selectTranslationAA(0, 'Met');
  await sleep(20);
  win.selectTranslationAA(1, 'Val');
  await proceedToNextRound(win);

  win.selectTranslationAA(0, 'Pro');
  await sleep(20);
  win.selectTranslationAA(1, 'Tyr');
  await sleep(20);
  win.selectTranslationAA(2, 'Lys');
  win.checkTranslationFull();
  await proceedToNextRound(win);

  win.selectProteinMatch(0);
  await proceedToNextRound(win);

  win.selectProteinMatch(0);
  await proceedToNextRound(win);

  assertContains(env.app.innerHTML, 'Game Complete', 'happy path');
  assertContains(env.app.innerHTML, 'Final score:</strong> 8 / 8', 'happy path');
  assertContains(env.app.innerHTML, 'Status:</strong> Completed', 'happy path');

  const last = env.savedPayloads[env.savedPayloads.length - 1] || null;
  if (!last) {
    throw new Error('happy path: expected final save payload');
  }
  if (!last.isFinalSubmit) {
    throw new Error('happy path: expected final payload');
  }
  if (last.completedStatus !== 'Completed') {
    throw new Error('happy path: expected completed status');
  }

  return {
    passed: true,
    payloads: env.savedPayloads.length,
    finalScore: last.score
  };
}

async function runWrongAttempt() {
  const env = makeEnv();
  const win = loadGame(env);

  env.firstName.value = 'Testy';
  win.startGame();
  win.skipTutorial();

  appendToRound(win, ['A', 'A', 'A', 'A']);
  win.checkCurrentRound();
  assertContains(env.app.innerHTML, 'check position', 'wrong attempt');

  await completeBaseRound(win, ['T', 'A', 'G', 'C']);
  assertContains(env.app.innerHTML, 'Round 2', 'wrong attempt');

  appendToRound(win, ['A', 'A', 'A']);
  win.checkCurrentRound();
  assertContains(env.app.innerHTML, 'check the length and use only valid DNA/RNA bases.', 'wrong attempt');
  await completeBaseRound(win, ['A', 'U', 'G']);
  assertContains(env.app.innerHTML, 'Round 3', 'wrong attempt');

  return { passed: true };
}

async function runAutosaveThrottle() {
  const env = makeEnv();
  const win = loadGame(env);

  env.firstName.value = 'Testy';
  win.startGame();
  win.skipTutorial();

  win.clearInput();
  appendToRound(win, ['T', 'A', 'G', 'C']);
  win.checkCurrentRound();
  if (env.savedPayloads.length !== 0) {
    throw new Error('autosave should be debounced and not send immediately');
  }

  await sleep(AUTO_SAVE_DEBOUNCE_MS - 100);
  if (env.savedPayloads.length !== 0) {
    throw new Error('autosave should not send before debounce window');
  }

  await sleep(250);
  if (env.savedPayloads.length === 0) {
    throw new Error('expected autosave after debounce');
  }

  const autosave = env.savedPayloads[0];
  if (autosave.isFinalSubmit) {
    throw new Error('autosave payload must not be marked final');
  }

  return {
    passed: true,
    payloads: env.savedPayloads.length
  };
}

async function runCodonWheelContext() {
  const env = makeEnv();
  const win = loadGame(env);

  env.firstName.value = 'Testy';
  win.startGame();
  win.skipTutorial();

  win.openCodonWheel();
  assertContains(env.app.innerHTML, 'Codon wheel is only available during translation rounds.', 'codon wheel');
  if (env.modal.showModalCalled) {
    throw new Error('codon wheel should not open on non-translation rounds');
  }

  await completeBaseRound(win, ['T', 'A', 'G', 'C']);
  await completeBaseRound(win, ['G', 'C', 'A', 'T']);
  await completeBaseRound(win, ['A', 'U', 'G']);
  await completeBaseRound(win, ['G', 'C', 'U', 'A']);

  win.openCodonWheel();
  if (!env.modal.showModalCalled) {
    throw new Error('codon wheel should open in translation');
  }
  assertContains(env.modalCells.innerHTML, 'AUG', 'codon wheel');
  assertContains(env.modalCells.innerHTML, 'GUC', 'codon wheel');
  if (env.modalCells.innerHTML.includes('CGAT')) {
    throw new Error('translation wheel should show codon map entries, not template text');
  }

  return { passed: true };
}

async function runReplayReset() {
  const env = makeEnv();
  const win = loadGame(env);

  env.firstName.value = 'Replay Guy';
  env.period.value = '4';
  win.startGame();
  win.skipTutorial();

  await completeBaseRound(win, ['T', 'A', 'G', 'C']);
  await sleep(AUTO_SAVE_DEBOUNCE_MS + 20);
  const beforeReplayAttemptId = (env.savedPayloads[0] && env.savedPayloads[0].attemptId) || '';
  if (!beforeReplayAttemptId) {
    throw new Error('expected an attempt id from pre-replay payload');
  }

  win.replayGame();
  if (env.firstName.value !== '') {
    throw new Error('first name should clear on replay');
  }
  if (env.period.value !== '1') {
    throw new Error('period should reset on replay');
  }
  assertContains(env.app.innerHTML, 'Start Game', 'replay');

  env.firstName.value = 'Replay Guy2';
  win.startGame();
  win.skipTutorial();
  await completeBaseRound(win, ['T', 'A', 'G', 'C']);
  await sleep(AUTO_SAVE_DEBOUNCE_MS + 20);
  const afterReplayPayload = env.savedPayloads[env.savedPayloads.length - 1];
  if (!afterReplayPayload || !afterReplayPayload.attemptId) {
    throw new Error('expected attempt id after replay start');
  }
  if (afterReplayPayload.attemptId === beforeReplayAttemptId) {
    throw new Error('replay should generate a new attempt id');
  }

  return {
    passed: true,
    beforeAttemptId: beforeReplayAttemptId,
    afterAttemptId: afterReplayPayload.attemptId
  };
}

async function runQuitPath() {
  const env = makeEnv();
  const win = loadGame(env);

  env.firstName.value = 'Testy';
  win.startGame();
  win.skipTutorial();
  await completeBaseRound(win, ['T', 'A', 'G', 'C']);
  win.quitEarly();

  assertContains(env.app.innerHTML, 'Game Complete', 'quit');
  assertContains(env.app.innerHTML, 'Incomplete', 'quit');

  const payload = env.savedPayloads[env.savedPayloads.length - 1];
  if (!payload || !payload.isFinalSubmit) {
    throw new Error('quit should send final submit payload');
  }
  if (payload.completedStatus !== 'Incomplete') {
    throw new Error('quit should force incomplete status');
  }

  return { passed: true };
}

async function runMissedReview() {
  const env = makeEnv();
  const win = loadGame(env);

  env.firstName.value = 'Testy';
  win.startGame();
  win.skipTutorial();
  await completeBaseRound(win, ['T', 'A', 'G', 'C']);

  appendToRound(win, ['G', 'T', 'A', 'T']);
  win.checkCurrentRound();
  win.quitEarly();

  assertContains(env.app.innerHTML, 'Missed-skills review', 'missed review');
  assertContains(env.app.innerHTML, 'Round 2', 'missed review');
  assertContains(env.app.innerHTML, 'Round 3', 'missed review');
  assertContains(env.app.innerHTML, 'Round 8', 'missed review');
  assertContains(env.app.innerHTML, 'Expected', 'missed review');

  return { passed: true };
}

async function runDuplicateNext() {
  const env = makeEnv();
  const win = loadGame(env);

  env.firstName.value = 'Testy';
  win.startGame();
  win.skipTutorial();

  await completeBaseRound(win, ['T', 'A', 'G', 'C']);
  win.proceedToNextRound();
  win.proceedToNextRound();

  await sleep(10);
  assertContains(env.app.innerHTML, 'Round 3', 'duplicate next');

  return { passed: true };
}

async function runFinalSubmitAfterPendingAutosave() {
  const env = makeEnv();
  const win = loadGame(env);

  env.firstName.value = 'Testy';
  env.period.value = '2';
  win.startGame();
  win.skipTutorial();

  await completeBaseRound(win, ['T', 'A', 'G', 'C']);
  await completeBaseRound(win, ['G', 'C', 'A', 'T']);
  await completeBaseRound(win, ['A', 'U', 'G']);
  await completeBaseRound(win, ['G', 'C', 'U', 'A']);
  win.selectTranslationAA(0, 'Met');
  await sleep(20);
  win.selectTranslationAA(1, 'Val');
  await proceedToNextRound(win);
  win.selectTranslationAA(0, 'Pro');
  await sleep(20);
  win.selectTranslationAA(1, 'Tyr');
  await sleep(20);
  win.selectTranslationAA(2, 'Lys');
  win.checkTranslationFull();
  await proceedToNextRound(win);
  win.selectProteinMatch(0);
  await proceedToNextRound(win);
  win.selectProteinMatch(0);
  await proceedToNextRound(win);

  const finalPayload = env.savedPayloads[env.savedPayloads.length - 1];
  if (!finalPayload || !finalPayload.isFinalSubmit) {
    throw new Error('final submit should be sent after completion');
  }
  if (finalPayload.completedStatus !== 'Completed') {
    throw new Error('final payload should be completed');
  }

  return {
    passed: true,
    finalPayload,
    sawOnlyFinal: env.savedPayloads.every((payload) => payload.isFinalSubmit === true),
    payloadCount: env.savedPayloads.length
  };
}

const label = process.argv[2] || 'all';

(async () => {
  if (label === 'happy') {
    console.log('PASS_HAPPY', JSON.stringify(await runHappyPath()));
    return;
  }
  if (label === 'wrong') {
    console.log('PASS_WRONG', JSON.stringify(await runWrongAttempt()));
    return;
  }
  if (label === 'throttle') {
    console.log('PASS_THROTTLE', JSON.stringify(await runAutosaveThrottle()));
    return;
  }
  if (label === 'wheel') {
    console.log('PASS_WHEEL', JSON.stringify(await runCodonWheelContext()));
    return;
  }
  if (label === 'replay') {
    console.log('PASS_REPLAY', JSON.stringify(await runReplayReset()));
    return;
  }
  if (label === 'quit') {
    console.log('PASS_QUIT', JSON.stringify(await runQuitPath()));
    return;
  }
  if (label === 'missed') {
    console.log('PASS_MISSED', JSON.stringify(await runMissedReview()));
    return;
  }
  if (label === 'duplicate') {
    console.log('PASS_DUP', JSON.stringify(await runDuplicateNext()));
    return;
  }
  if (label === 'final') {
    console.log('PASS_FINAL', JSON.stringify(await runFinalSubmitAfterPendingAutosave()));
    return;
  }

  console.log('PASS_HAPPY', JSON.stringify(await runHappyPath()));
  console.log('PASS_WRONG', JSON.stringify(await runWrongAttempt()));
  console.log('PASS_THROTTLE', JSON.stringify(await runAutosaveThrottle()));
  console.log('PASS_WHEEL', JSON.stringify(await runCodonWheelContext()));
  console.log('PASS_REPLAY', JSON.stringify(await runReplayReset()));
  console.log('PASS_QUIT', JSON.stringify(await runQuitPath()));
  console.log('PASS_MISSED', JSON.stringify(await runMissedReview()));
  console.log('PASS_DUP', JSON.stringify(await runDuplicateNext()));
  console.log('PASS_FINAL', JSON.stringify(await runFinalSubmitAfterPendingAutosave()));
})();
