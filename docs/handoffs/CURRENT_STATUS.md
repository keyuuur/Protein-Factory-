# Protein Factory Current Status

## Last Updated and Scope

- Last updated: 2026-07-21 CT.
- Scope: visual-hierarchy implementation, local verification, Git handoff refresh, and a new non-production preview attempt.
- Current status: implementation is verified and prepared for publication on the expected GitHub branch. Preview deployment is the next release step. Production remains unchanged and approval-gated.

## Git and Working-Tree Posture

- Project root: `/workspace/scratch/7cee5e57bcec/Protein-Factory-`.
- GitHub repository: `https://github.com/keyuuur/Protein-Factory-.git`.
- Current branch: `codex/protein-factory-revamp`.
- Upstream: `origin/codex/protein-factory-revamp`.
- Verified starting commit: `c23539ce3a93b5a86eae49ab76b795725a0f8868`.
- Canonical GitHub implementation commit: `f4a7c2cccf2b63ac91a246da2d78828f0d153dc2` (`Clarify Protein Factory visual relationships`).
- The implementation commit contains the verified starting commit in its ancestry.
- The GitHub publication uses the exact locally verified implementation tree and a separate handoff refresh commit.

## Current Architecture and Preserved Contract

- The active app remains the Vite + React + TypeScript application under `web/`.
- React and the DOM continue to own student controls, keyboard behavior, focus, screen-reader output, feedback, and submission state.
- `FactoryCanvas` sends a serializable snapshot from `sceneState.ts` to the focused, noninteractive Three.js `FactoryRuntime` visual-feedback layer.
- The V4 nine-action, three-product flow is unchanged.
- Scoring, sequences, codon mappings, persistence, result schemas, submission behavior, Apps Script integration, and legacy/V3 compatibility are unchanged.
- The codon wheel remains an always-available reference and does not count as a hint.

## Implemented Visual Hierarchy

- The laboratory now states the current relationship directly for each action:
  - DNA base to mRNA base during transcription.
  - Codon to signal to growing amino-acid chain during translation.
  - Completed chain to pigment outcome to modeled trait during the function action.
- Live captions and relationship strips are derived from the same scene snapshot as the Three.js layer, including repair targets and provisional selections.
- The function visual now uses a pigment-output level, directional cue, and trait swatch instead of a decorative assay vessel.
- Decorative laboratory rings, trays, and progress elements have less visual weight.
- The codon-wheel reading key now shows an explicit first-base to second-base to third-base to amino-acid/Stop direction.
- The later V5 cascade is authoritative: the laboratory is approximately 21vh on desktop/landscape, 205px on iPad portrait, 154px on phone portrait, and 22vh for short desktop landscape. The earlier 29vh rule remains overridden.

## Local Verification

- `npm run test`: passed, 67 tests in 9 files.
- `npm run lint`: passed.
- `npm run build`: passed.
- Renderer JavaScript: 139.45 KB gzip, below the 150 KB gate.
- Total frontend JavaScript: 237.19 KB gzip, below the 260 KB gate.
- The existing raw Three.js chunk-size warning remains non-blocking.
- `npx playwright test --list`: passed; 156 tests in 10 files were discovered across desktop Chromium, iPad Chromium portrait, iPad WebKit portrait, iPad WebKit landscape, phone Chromium, and iPhone WebKit.
- The visual-flow test still intercepts `/api/attempt`; no real student submission is made by that automation.
- The Playwright browser run and fresh screenshots are not complete in this environment. No compatible browser binary is installed, and the sanctioned Playwright Chromium/WebKit download failed at the environment's browser CDN/certificate boundary. This is an environment limitation, not a passing browser result.

## Visual Evidence

- Existing curated screenshots remain available under `docs/visual/reviews/three-pass-final/` for historical comparison.
- Those images predate `f4a7c2c` and are not evidence for the new implementation.
- Fresh browser screenshots must be captured from the new preview or from an environment with a working Chromium/WebKit installation.

## Preview Deployment

- Existing preview: `https://protein-factory-ls31xosb8-keyur159263-5904s-projects.vercel.app`.
- The existing preview is an older release candidate and is not implementation evidence for `f4a7c2c`.
- A new preview has not yet been created at the time of this handoff refresh.
- At bootstrap, no local Vercel CLI or `.vercel/project.json` was present, and the available Vercel connector could not authenticate to the known project. Git integration and deployment status will be checked after the commits are pushed.
- Any new deployment must target preview only, use `web/` as the project root, retain local-only results, and add no submission environment variables.
- Production has not been promoted, aliased, rolled back, or otherwise changed.

## Current Risks and Remaining Gates

- Full browser execution and fresh screenshot capture remain blocked in the current workspace until a browser or remote capture path is available.
- A new preview still needs to be created and smoke-checked after GitHub push.
- Automated WebKit does not replace the physical Safari iPad gate.
- Rotation with the codon wheel open, Safari background/foreground recovery, sustained WebGL rendering, the onscreen keyboard, and school-network behavior remain physical-device checks.
- Teacher submission is not configured for preview and must remain local-only.

## Exact Next Actions

1. Check the published commit for a Vercel Git-integration preview.
2. If Git integration does not create one, try the authenticated preview-only deployment tooling without production flags or environment changes.
3. Smoke-check the resulting preview and capture fresh screenshots if an approved browser path is available.
4. Run the physical Safari iPad gate separately before any production decision.

## Explicit Boundaries

- Do not change production Vercel, Apps Script, environment variables, tokens, result destinations, or student data.
- Do not treat a preview as production or as proof of teacher submission.
- Do not add strand-direction or template/coding-strand terminology to the ninth-grade student UI.
- Do not migrate controls into WebGL, reopen Phaser, or expand Three.js beyond focused noninteractive feedback.
- Do not reset, force-push, merge, rebase, discard, or hide unrelated work.
