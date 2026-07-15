# Protein Factory Three-Pass Resume Checkpoint

## Release-candidate stopping point

All three visual implementation passes and the automated release audit are complete on `codex/protein-factory-revamp`. Production Vercel remains unchanged. The next external gate is a physical Safari iPad run against the non-production preview.

## Completed work

- Pass 1 (`cd7d4c2`) united the laboratory, student controls, and shared bench.
- Pass 2 (`e8d4653`) made the Three.js laboratory visibly react to transcription, translation, repair, Stop, and function selections.
- Pass 3 polished classroom spacing, start/end/recovery states, touch sizing, feedback stability, codon-wheel accessibility, keyboard navigation, reduced motion, and narrow-screen behavior.
- Audit fixes (`3120a07`) aligned the release suites with focused variants and current diagnostic copy, added keyboard coverage, and stabilized reaction timing assertions.
- Renderer and short-screen fixes (`9da294c`) exposed iPad-landscape controls and closed a delayed-frame settling edge case.
- Phone results now open at the rating and independence summary instead of inheriting gameplay scroll.
- Recovery Start Over now requires confirmation and manages keyboard focus.
- Function rows retain a valid keyboard tab stop if progressive narrowing removes the stored selection.
- Mobile codon-wheel locking restores the nearest valid page position after rotation without horizontal overflow.
- Landscape Translation resets its console to the top when the wheel opens.
- The storage-denied full-run test now follows focused variant transcription and translation instead of repeating all Protein 1 inputs.
- Ninety fresh Pass 3 screenshots are stored under `output/playwright/`: 15 states for each of six browser profiles.
- Five deterministic comparison boards and the final assessment are tracked under `docs/visual/reviews/three-pass-final/`.

## Verified at this checkpoint

- 67 unit tests pass.
- Lint passes.
- Production build passes.
- Renderer bundle is 139.25 KB gzip; total frontend JavaScript is about 236.4 KB gzip.
- The existing raw Three.js chunk-size warning remains non-blocking.
- Storage-denied online completion passes.
- Classroom control stability, reduced-motion, 320x568, persistence confirmation, and mobile codon-wheel suites have targeted coverage.
- Fresh phone evidence shows the correct Protein Factory app and the final heading in the initial result viewport.
- Fresh iPad-landscape evidence shows the Translation task and wheel beginning at the top of the console.
- Two consecutive complete Playwright runs passed from `9da294c`: `34 passed / 122 intentionally skipped` in 12.5 minutes, then the same result in 10.8 minutes.
- The 90 final PNGs contain no transparent or blank frames. Sampled near-black pixels peak at 0.43% in codon-wheel text and outlines.
- Six read-only release reviewers returned no blocker for a protected preview. They did not clear production promotion.
- Vercel CLI authentication works for the linked `protein-factory` project. The project reports no configured environment variables, keeping the preview local-only.

## Important test isolation note

Do not reuse an unknown server already listening on port 4173. A stale sibling-game server once overwrote one phone start screenshot before the isolation problem was caught. Run release evidence with `CI=1`, or first stop the listener on port 4173. The visual matrix now asserts that the Protein Factory heading is present before capturing its initial PNG.

## Resume here

1. Open the non-production preview URL recorded below on a physical Safari iPad.
2. Complete one full three-protein run.
3. Rotate while Translation has the codon wheel open.
4. Background and restore Safari during an unfinished action.
5. Confirm there are no black frames, clipped controls, lost selections, or unexpected page jumps.
6. Confirm the final rating begins in the visible viewport.
7. Record the iPad model, iPadOS version, orientation findings, and any school-network behavior before considering production promotion.

## Preview record

- Preview URL: pending evidence commit and deployment
- Deployed commit: pending
- Submission mode: local-only; no Vercel environment variables are configured

## Release boundaries

- Do not merge the older default branch.
- Do not open a pull request unless requested.
- Do not change production Vercel during the remaining audit.
- Do not add gameplay, biology content, dependencies, or backend changes during the release audit.
- Teacher submission remains dependent on separately supplied production configuration.

## Stack decision

Continue with React/DOM controls plus a focused, lighter Three.js laboratory. Do not migrate to Phaser unless physical-device evidence reveals a repeatable renderer failure or future gameplay requires direct spatial manipulation in at least two actions.
