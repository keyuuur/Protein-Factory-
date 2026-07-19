# Protein Factory Project Context

## Project Purpose and Audience

Protein Factory is a browser-based Biology review game for ninth-grade students. It is designed for classroom use on school iPads and other touch-capable browsers, with clear enough status for teacher monitoring or projection. The public product name is **Protein Factory**; the local folder retains the older `Pirate Protein Factory LOCAL` name.

The game is a fast, mistake-tolerant checkpoint rather than a full first-teach lesson. Students practice the connected flow from a DNA strand to mRNA, from mRNA codons to amino-acid signals, and from an amino-acid chain to protein function and an expressed trait.

## Current Product or Learning Goals

- Each run contains nine connected actions: transcription, translation, and function testing for an original protein sequence, a one-base variant that preserves the amino-acid chain, and a one-base variant that changes one amino acid and the resulting function row.
- Students should see how a DNA change can have no protein effect or can change an amino acid and downstream trait outcome.
- Actions should be obvious, touch-friendly, encouraging after errors, and recoverable after reload or temporary network failure.
- The laboratory should make molecular state and progress visible without turning the activity into a passive animation or a decorated quiz.

## Approved Architecture and Stack Decisions

- The active student application is under `web/` and uses Vite, React, TypeScript, and Three.js.
- React owns game screens, controls, state transitions, and accessible status. The Three.js runtime renders the reactive laboratory bench from state passed through the render adapter.
- The settled stack direction is React/DOM controls with a focused, noninteractive Three.js laboratory. Do not migrate to full Three.js or Phaser unless physical-device evidence shows a repeatable renderer failure or future gameplay requires direct spatial manipulation in at least two actions.
- The content engine under `web/src/game/` owns the validated sequences, codon mappings, function rows, run construction, scoring, and corrective feedback. Generated images are never a source for biology facts or scoring behavior.
- The active content contract is V4. The root Apps Script files retain legacy UI code and versioned teacher-submission endpoints; changes must preserve legacy and V3 behavior unless a separately approved migration changes that boundary.
- Final attempts post to the same-origin Vercel endpoint `/api/attempt`, which validates and forwards them to Apps Script without exposing the write token in the browser.
- The browser keeps versioned checkpoints and local results, queues failed submissions, retries after reconnection, and supports recovery/export behavior. Apps Script deduplicates V4 attempts by `attemptId` in `ProteinFactoryV4`.

## Non-Negotiable Constraints and Safety Boundaries

- Optimize student flows for iPad/touch use: large targets, readable contrast, no hover-only controls, stable controls after feedback, and clear recovery from wrong answers.
- Treat student names, periods, attempts, scores, and result destinations as sensitive classroom data. Do not expose names on public/projector views or change collected fields or destinations without Keyur's approval.
- Never commit or document `.env` values, Apps Script tokens, OAuth material, `.clasp.json` contents, private student data, or machine-local credentials.
- A source commit is not proof of Vercel promotion, Apps Script deployment, backend acceptance, school-network success, or physical-iPad readiness. Verify each gate directly.
- Keep generated ideal images separate from browser screenshots. Ideal images guide composition and hierarchy; live source, tests, and captured browser output prove implementation.
- Preserve the versioned content/data contracts and legacy backend boundary unless the task explicitly authorizes a migration.

## Important Design and Content Decisions

- The approved V5 direction is one gently tilted shared laboratory bench with one dominant student action, the current molecular product remaining visible, a compact process rail, and controls placed close to the object they affect.
- The 3D laboratory must react to student selections and progress; it is not decorative background.
- Translation uses one active codon, four amino-acid slots, a separate Stop signal, and a restrained contextual codon-wheel helper. Function testing uses one uncomplicated chamber/work surface and broad outcome rows.
- Student-facing language intentionally uses `DNA strand`, `mRNA strand`, `codons`, and `amino acid chain`. Do not add 5-prime/3-prime notation, template/coding-strand terminology, or advanced mutation labels unless Keyur changes the ninth-grade scope.
- The codon wheel is a standard scientific reference and does not count as a hint. An `independent` action means no corrective hint was used; it does not mean unaided codon recall.
- The interface should be bright, practical, and classroom-safe rather than dark, cinematic, or visually overloaded.
- Written requirements and frozen validated datasets override text, labels, sequences, codon mappings, or scoring implied by generated pixels.

## Rejected Approaches

- The busier Translation and Function Test concepts in the V5 `archive/` folder are not implementation targets. Permanent product bays and competing status panels weakened the one-action hierarchy and increased classroom scanning load.
- Generated visuals are rejected as a biology-data source because their labels and molecular details can be imperfect.
- A decorative laboratory that does not respond to the learner's action is rejected; visual feedback must communicate state or progress.
- A parallel rewrite of the legacy Apps Script interface is not the active product path. The Vite/React app is active while legacy and V3 backend compatibility remains preserved.

## Durable Role-Agent Findings

- Student UX and Classroom Fit reviews should check control stability, touch size, readable feedback, recovery, and whether the active task remains obvious at iPad dimensions.
- Science Content reviews should use the validated code datasets and explicitly check transcription, codon translation, same-chain variants, amino-acid-changing variants, function rows, and Stop handling.
- Visual reviews must compare live browser screenshots with the written V5 targets without treating generated reference pixels as implementation evidence.
- QA and Deployment/Ops reviews must keep local tests, browser matrices, Vercel deployment, Apps Script deployment, backend acceptance, and physical-device evidence as separate gates.

## Canonical References

- [Active application and deployment contract](../../web/README.md)
- [Validated game content and run construction](../../web/src/game/content/rounds.ts)
- [V5 visual direction and accuracy boundary](../visual/reference/shared-bench-v5/README.md)
- [Approved V5 ideal images](../visual/reference/shared-bench-v5/ideals/)
- [Final three-pass visual assessment](../visual/reviews/three-pass-final/README.md)
- [Release-candidate resume checkpoint](../visual/three-pass-resume-checkpoint.md)
- [Unit and integration tests](../../web/tests/unit/)
- [Browser and device-matrix tests](../../web/tests/e2e/)
- `output/playwright/` contains local browser evidence; verify capture date and tested commit before relying on any screenshot.

## Conditions for Reconsideration

Reopen a major decision only when new curriculum requirements, direct student/teacher pilot evidence, physical-iPad or school-network evidence, an approved data/backend migration, a material accessibility failure, or an explicit product-scope change shows the current decision no longer meets the classroom goal. Record the evidence and the replacement decision here; do not silently reopen settled direction.
