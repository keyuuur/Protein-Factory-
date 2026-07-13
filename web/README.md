# Protein Factory Web

This folder is the Vercel-ready Protein Factory classroom game.

The legacy Apps Script interface remains in the repository root. The active app is a Vite + React + TypeScript + Three.js implementation with nine connected actions across an original protein sequence, a same-chain one-base variant, and an amino-acid-changing one-base variant.

## Active Source Map

- Active student UI: `src/ui/*`
- Active game state/content: `src/game/*`
- Active results/local saving: `src/results/*`
- Active Three.js runtime: `src/render/*`
- Archived reference code: `legacy-src/*`

The root Apps Script files also contain versioned teacher-submission endpoints. Keep legacy and V3 behavior intact when changing the V4 backend.

## Local Commands

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test
npm run test:e2e
```

`npm run test:e2e` runs desktop, iPad Chromium, iPad WebKit portrait/landscape, and phone flows. Review screenshots are written to `../output/playwright/*-v3-*.png` and are intentionally ignored by Git.

## Vercel Setup

Use Git integration and set the Vercel project root directory to `web`.

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`
- Node: use a current Node version compatible with `package.json` engines
- Server environment: set `APPS_SCRIPT_WEB_APP_URL` and `RESULTS_WRITE_TOKEN` from `.env.example`

The browser posts final attempts to `/api/attempt`. The Vercel function validates the request and forwards it to Apps Script without exposing the write token to students.

## Classroom Accountability Status

The app saves versioned checkpoints and up to 30 local results, queues failed submissions, and retries when the device reconnects. Apps Script stores V4 attempts in `ProteinFactoryV4` and deduplicates by `attemptId` while preserving the legacy and V3 tabs.

Before enabling student traffic:

1. Set the same long random `RESULTS_WRITE_TOKEN` in Apps Script Script Properties and Vercel.
2. Deploy the updated Apps Script web app and set its `/exec` URL in Vercel.
3. Use demo records in a Vercel preview deployment.
4. Confirm rows appear once in `ProteinFactoryV4`, including after a deliberate retry.
5. Complete the physical-iPad check, then promote the preview deployment.

## Pre-Handoff Checklist

1. Run `npm run test`, `npm run lint`, `npm run build`, and relevant Playwright tests from this folder.
2. Review generated screenshots in `../output/playwright/`.
3. Keep generated artifacts uncommitted unless a task explicitly asks for screenshots.
4. Confirm `clasp status` lists only Apps Script source files before pushing.
5. Keep `.env` files and generated artifacts uncommitted.
