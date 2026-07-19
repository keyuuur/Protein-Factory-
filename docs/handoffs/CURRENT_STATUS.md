# Protein Factory Current Status

## Last Updated and Scope

- Last updated: 2026-07-15 CT.
- Scope: completed three-pass visual revamp, release audit, curated evidence, protected preview deployment, and restart-ready handoff.
- Current status: automated release candidate is complete and ready for a physical Safari iPad gate. Production promotion and teacher submission are not cleared.

## Git and Working-Tree Posture

- Project root: `C:\Users\Keyur\Desktop\Claude Code YEET\Teacher Coding Projects\Biology Games\Pirate Protein Factory LOCAL`.
- Current branch: `codex/protein-factory-revamp`.
- Upstream: `origin/codex/protein-factory-revamp` on GitHub.
- Current HEAD: `59964fbd814be00a530219dd0f3573a8802ea7d3` (`Record Protein Factory preview handoff`).
- Ahead/behind: `0/0` after a fresh fetch.
- The current tracked branch is synchronized with GitHub.
- `docs/handoffs/` and `ui_goal_description.md` are untracked. The handoff files are being refreshed by the explicit `$codex-handoff` workflow; `ui_goal_description.md` remains unrelated and untouched.
- The second local branch `codex/pirate-protein-factory` remains one commit ahead of its own upstream. It was not switched, merged, rebased, or changed.

## Completed Implementation and Release Audit

- Pass 1 (`cd7d4c2`) united the shared workbench and student controls.
- Pass 2 (`e8d4653`) made the Three.js laboratory react to transcription, translation, repair, Stop, function selection, and product delivery.
- Pass 3 (`6336508`) polished classroom spacing, touch sizing, feedback stability, recovery, codon-wheel behavior, reduced motion, and narrow layouts.
- Audit fixes (`3120a07`) aligned browser tests with focused Protein 2/3 challenges and current diagnostic copy.
- Renderer and short-screen fixes (`9da294c`) restored iPad-landscape controls and closed a delayed-frame settling edge case.
- Visual evidence and assessment were committed in `4d55c79`.
- The public preview record was committed in `59964fb`.

## Verified Evidence

Checks already completed against the release-candidate application code:

- `npm run test`: passed, 67 tests.
- `npm run lint`: passed.
- `npm run build`: passed.
- Renderer JavaScript: 139.25 KB gzip, below the 150 KB gate.
- Total frontend JavaScript: 236.44 KB gzip, below the 260 KB gate.
- The existing raw Three.js chunk-size warning remains non-blocking.
- Full Playwright run 1: 34 passed, 122 intentionally skipped, 12.5 minutes.
- Full Playwright run 2: 34 passed, 122 intentionally skipped, 10.8 minutes.
- Ninety fresh Pass 3 PNGs were captured: 15 states for each of six profiles.
- Profiles: desktop Chromium, iPad Chromium portrait, iPad WebKit portrait, iPad WebKit landscape, phone Chromium, and iPhone WebKit.
- Pixel sampling found no transparent or blank frames. Near-black pixels peaked at 0.43 percent in codon-wheel text and outlines.
- Six read-only release reviewers returned no blocker for a protected preview. They did not clear production promotion.

Curated evidence:

- `docs/visual/reviews/three-pass-final/README.md`
- `docs/visual/reviews/three-pass-final/01-transcription-three-pass.png`
- `docs/visual/reviews/three-pass-final/02-translation-three-pass.png`
- `docs/visual/reviews/three-pass-final/03-function-test-three-pass.png`
- `docs/visual/reviews/three-pass-final/04-responsive-pass-3.png`
- `docs/visual/reviews/three-pass-final/05-classroom-states-pass-3.png`

## Preview Deployment

- Public preview: `https://protein-factory-ls31xosb8-keyur159263-5904s-projects.vercel.app`
- Deployment ID: `dpl_6uHk39RMKo68axFEWhCYK2CUneVS`
- Deployed commit: `4d55c79`
- Vercel status: READY, target `preview`.
- Vercel SSO preview protection is disabled so the iPad link is public. Git-fork protection remains enabled.
- The linked Vercel project reports no environment variables. Preview results therefore remain local-only and cannot be forwarded to Apps Script.
- Remote browser smoke passed the start screen, tutorial, Protein 1 workbench, one real mRNA selection, settled renderer revision, one canvas, and application asset requests.
- The only remote console entry was a non-blocking missing `favicon.ico` 404.
- Production Vercel was not promoted or changed.

## Current Risks and Unverified Gates

- No physical Safari iPad run has been completed against this preview.
- Rotation with the codon wheel open, Safari background/foreground recovery, sustained WebGL rendering, the onscreen keyboard, and school-network behavior remain external device checks.
- Teacher submission is not configured. Live Apps Script V4 writes, deduplication, retry, and Sheet-row behavior were not exercised by this preview.
- Function Test can be solved by literal chain matching. It checks careful comparison more than independent function reasoning.
- The 3D laboratory is responsive feedback, not decision-bearing spatial gameplay.
- Translation remains the densest action, and the phone independence summary is visually awkward.
- On iPad portrait, beginning the next protein may require one deliberate scroll after the transition summary.
- The missing favicon is cosmetic and should be handled in a later polish pass unless it becomes a release requirement.

## Exact Next Actions

1. Open the public preview on the intended physical Safari iPad.
2. Complete one full three-protein run.
3. Rotate while Translation has the codon wheel open.
4. Background and restore Safari during an unfinished action.
5. Confirm there are no black frames, clipped controls, lost selections, or unexpected page jumps.
6. Confirm the final rating begins in the visible viewport.
7. Record the iPad model, iPadOS version, orientation findings, and school-network behavior.
8. Decide whether any physical-device finding requires a narrow fix and repeated release gate.
9. Promote production only after the physical gate passes and Keyur gives explicit approval.

## Explicit Boundaries

- First turn after this handoff is read-only context gathering only.
- Do not change production Vercel, Apps Script, environment variables, tokens, or result destinations without explicit approval.
- Do not treat the public preview as production or as proof of teacher submission.
- Do not add advanced strand-direction terminology to the ninth-grade student UI.
- Do not migrate to Phaser or full Three.js without new evidence meeting the reconsideration conditions in `PROJECT_CONTEXT.md`.
- Do not touch or include `ui_goal_description.md` unless Keyur explicitly brings it into scope.
- Do not reset, force-push, merge, rebase, discard, or hide unrelated work.
