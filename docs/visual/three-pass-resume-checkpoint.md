# Protein Factory Three-Pass Resume Checkpoint

## Clean stopping point

All three visual implementation passes are complete on `codex/protein-factory-revamp`. Pass 3 is ready to be committed and pushed with this checkpoint. Production Vercel remains unchanged.

## Completed work

- Pass 1 (`cd7d4c2`) united the laboratory, student controls, and shared bench.
- Pass 2 (`e8d4653`) made the Three.js laboratory visibly react to transcription, translation, repair, Stop, and function selections.
- Pass 3 polished classroom spacing, start/end/recovery states, touch sizing, feedback stability, codon-wheel accessibility, keyboard navigation, reduced motion, and narrow-screen behavior.
- Phone results now open at the rating and independence summary instead of inheriting gameplay scroll.
- Recovery Start Over now requires confirmation and manages keyboard focus.
- Function rows retain a valid keyboard tab stop if progressive narrowing removes the stored selection.
- Mobile codon-wheel locking restores the nearest valid page position after rotation without horizontal overflow.
- Landscape Translation resets its console to the top when the wheel opens.
- The storage-denied full-run test now follows focused variant transcription and translation instead of repeating all Protein 1 inputs.
- Fresh isolated phone and iPad-landscape Pass 3 screenshots are stored under `output/playwright/`.

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

## Important test isolation note

Do not reuse an unknown server already listening on port 4173. A stale sibling-game server once overwrote one phone start screenshot before the isolation problem was caught. Run release evidence with `CI=1`, or first stop the listener on port 4173. The visual matrix now asserts that the Protein Factory heading is present before capturing its initial PNG.

## Resume here

1. Confirm the worktree contains no unexpected changes; leave `ui_goal_description.md` and `docs/handoffs/` untouched unless the user explicitly brings them into scope.
2. Run the complete Playwright suite twice consecutively with one isolated server and no reused port: set `CI=1` and use `--workers=1` if reliability is more important than speed.
3. Recapture the final six-profile Pass 3 matrix after the latest accessibility fixes: desktop Chromium, iPad Chromium portrait, iPad WebKit portrait, iPad landscape, phone Chromium, and iPhone WebKit.
4. Inspect the saved PNG pixels and key screenshots. Do not treat the Codex image-preview black-block artifact as a real canvas failure unless the PNG pixel checks also fail.
5. Package Pass 1, Pass 2, and Pass 3 comparisons against `docs/visual/reference/shared-bench-v5/` and write the final visual assessment.
6. Complete the stack decision. Current evidence favors React/DOM controls with a focused, lighter Three.js laboratory; Phaser is not justified unless a repeatable device failure or direct-manipulation requirement emerges.
7. Perform the external physical Safari iPad check before any production promotion.

## Release boundaries

- Do not merge the older default branch.
- Do not open a pull request unless requested.
- Do not change production Vercel during the remaining audit.
- Do not add gameplay, biology content, dependencies, or backend changes during the release audit.
- Teacher submission remains dependent on separately supplied production configuration.
