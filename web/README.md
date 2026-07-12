# Pirate Protein Factory Web

This folder is the Vercel-ready rebuild of Pirate Protein Factory.

The legacy Apps Script version remains in the repository root. This web app is a separate Vite + React + TypeScript implementation that keeps the original 8-round biology content while improving the game loop, feedback, and classroom UI.

## Active Source Map

- Active student UI: `src/ui/*`
- Active game state/content: `src/game/*`
- Active results/local saving: `src/results/*`
- Active Three.js runtime: `src/render/*`
- Archived reference code: `legacy-src/*`

Do not edit the root Apps Script files or `legacy-src/*` for the web app unless a task explicitly brings those files back into scope.

## Local Commands

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test
npm run test:e2e
```

`npm run test:e2e` runs the desktop and iPad-sized browser flows and writes review screenshots to `../output/playwright/*level2*.png`.

## Vercel Setup

Use Git integration and set the Vercel project root directory to `web`.

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`
- Node: use a current Node version compatible with `package.json` engines

Score saving is intentionally local/fake for this phase. Apps Script and Google Sheets submission are deferred until the game loop and UI are stable.

## Classroom Accountability Status

The web app currently writes final results to browser storage and keeps a local history on the device. It does not submit to Google Sheets yet. Before enabling real teacher submission, map the web payload through `src/results/appsScriptMapper.ts` and test it against the legacy `saveAttempt` payload shape in the root Apps Script files.

## Pre-Handoff Checklist

1. Run `npm run test`, `npm run lint`, `npm run build`, and relevant Playwright tests from this folder.
2. Review generated screenshots in `../output/playwright/`.
3. Keep generated artifacts uncommitted unless a task explicitly asks for screenshots.
4. Stage the intended `web/` app files before pushing; the repo root contains legacy Apps Script code.
