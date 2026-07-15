# Protein Factory Three-Pass Visual Assessment

## Release Candidate

- Branch: `codex/protein-factory-revamp`
- Tested commit: `9da294c4794e074551bacb1194e474a93e7989e8`
- Production status: unchanged
- Intended next deployment: Vercel preview for physical Safari iPad testing
- Public preview: `https://protein-factory-ls31xosb8-keyur159263-5904s-projects.vercel.app`

This pack compares the approved V5 composition ideals with the three implemented UI passes. The boards use real browser screenshots. No image generation, retouching, or replacement scientific content was used.

## Comparison Boards

| Board | Purpose |
| --- | --- |
| [01-transcription-three-pass.png](01-transcription-three-pass.png) | Approved Transcription ideal compared with Passes 1, 2, and 3 on iPad landscape. |
| [02-translation-three-pass.png](02-translation-three-pass.png) | Approved Translation ideal compared with Passes 1, 2, and 3, including the deterministic codon wheel. |
| [03-function-test-three-pass.png](03-function-test-three-pass.png) | Approved Function Test ideal compared with the four canonical assay choices in each pass. |
| [04-responsive-pass-3.png](04-responsive-pass-3.png) | Pass 3 Transcription on desktop, iPad portrait, iPad landscape, and phone. |
| [05-classroom-states-pass-3.png](05-classroom-states-pass-3.png) | Repair, success, protein transition, and final-report states. |

## Verification

- 67 unit tests passed.
- Lint passed.
- Production build passed.
- Renderer bundle: 139.25 KB gzip, below the 150 KB gate.
- Total frontend JavaScript: 236.44 KB gzip, below the 260 KB gate.
- Full Playwright run 1: 34 passed, 122 intentionally skipped, 12.5 minutes.
- Full Playwright run 2: 34 passed, 122 intentionally skipped, 10.8 minutes.
- Each run captured 90 Pass 3 PNGs: 15 states for each of six profiles.
- Profiles: desktop Chromium, iPad Chromium portrait, iPad WebKit portrait, iPad WebKit landscape, phone Chromium, and iPhone WebKit.
- Pixel sampling found no transparent screenshots. Near-black pixels peaked at 0.43% and were confined to codon-wheel text and outlines, not blank or black frames.

## Visual Assessment

| Area | Rating | Assessment |
| --- | ---: | --- |
| Ninth-grade clarity | 4/5 | Each screen asks for one visible action and uses familiar DNA, mRNA, codon, amino-acid, function, and trait labels. |
| iPad ergonomics | 4/5 | Large targets and the repaired landscape shelf keep answer choices, Hint, and Check reachable. A physical Safari check remains required. |
| Task discoverability | 4/5 | The active process step, task heading, evidence, and one primary command form a consistent path. |
| Information density | 4/5 | Transcription and Function Test are well balanced. Translation remains the densest action because the codon wheel and chain evidence must coexist. |
| Feedback and transitions | 4/5 | Repair targets, pending choices, Stop, success shelves, and protein comparisons visibly respond without detached success screens. |
| Alignment with approved ideals | 3.5/5 | The implemented bench achieves the hierarchy and shared instrument concept, but remains more schematic and less materially rich than the illustrative ideals. |

## Strengths

- The same shared workbench supports three distinct actions without changing interaction rules.
- Errors point to the exact base or codon and remain repairable in place.
- The codon wheel is generated from the canonical 64-codon dataset, with three-base path highlighting and Stop treated as a signal.
- Variant Proteins 2 and 3 focus attention on the changed region while preserving full canonical answers and scoring.
- Three.js reflects pending, incorrect, repaired, confirmed, and completed states while accessible React controls remain authoritative.
- The fictional fur-color practice model explicitly avoids implying that all amino-acid changes alter function or that real fur color is controlled by one simple pathway.

## Remaining Gaps

- The laboratory is still a schematic instrument rather than the material, high-detail workbench shown in the ideals.
- Translation is visually denser than the other actions, especially when the full codon wheel is open.
- The phrase `assay row` is more technical than the rest of the ninth-grade vocabulary and could be simplified in a future copy pass.
- The phone final screen's independence summary is accurate but visually awkward; its label and large fraction compete for the same horizontal space.
- Function Test can be completed by literal amino-acid-chain matching. It checks careful comparison, but does not yet require students to reason independently from chain to function to trait.
- On iPad portrait, the protein-transition summary is visible before the next-protein button; beginning the next protein can require one deliberate scroll.
- The laboratory communicates pending and confirmed molecular state, but does not itself carry student input. This makes it useful feedback rather than decision-bearing spatial gameplay.
- The complete automated matrix cannot replace rotation, background/foreground, and sustained rendering checks on a physical Safari iPad.

## Swarm Release Review

Six independent read-only reviewers assessed QA, student and classroom fit, science content, accessibility, gameplay value, and deployment/stack boundaries. All six returned **NO BLOCKER** for a protected preview and physical-iPad gate. None recommended production promotion yet.

The science review confirmed the canonical 64-codon mapping, DNA-to-mRNA complement rules, terminal Stop treatment, four-amino-acid products, and the intended synonymous and amino-acid-changing variants. Student-facing wording deliberately remains `DNA strand` rather than adding template-strand or direction terminology outside this ninth-grade class scope.

The accessibility review confirmed keyboard navigation, focus containment and return, Escape behavior, 48px touch targets, sampled contrast, reduced motion, and semantic DOM controls independent of the canvas. The codon wheel is treated as a standard scientific reference; `independent` means the action was completed without a corrective hint, not that codons were recalled without a reference.

The skeptical review found that the current experience is strongest as a polished, reactive review game. Its primary verb remains select, check, repair, and continue. A future gameplay pass should deepen meaningful decisions before adding renderer complexity.

## Stack Decision

Continue with **React/DOM plus focused, lighter Three.js**.

React should remain responsible for all text, answer choices, focus, touch behavior, validation feedback, and recovery. Three.js should remain a focused visual layer for the active machine, molecular cargo, faults, Stop, and product delivery. Full Three.js would weaken accessibility without adding enough learning value. Phaser is not justified by the current game because students do not need collision-based or spatial direct manipulation.

Reconsider a Phaser prototype only if physical iPad testing reveals a repeatable Three.js failure, or a future design requires direct spatial manipulation in at least two actions.

## Release Boundary

This is a preview candidate, not a production promotion. The linked Vercel project reported no environment variables during this audit, so the preview remains honestly local-only and cannot forward results to Apps Script. Teacher submission must remain disabled or local-only unless the production Apps Script URL and matching write token are configured separately. Production promotion requires a successful physical Safari iPad run and explicit approval.

The public preview was deployed from evidence commit `4d55c79`. A remote browser smoke test confirmed the Protein Factory start screen, tutorial, Protein 1 workbench, a real mRNA selection, one settled Three.js canvas, and `200` responses for the HTML, JavaScript, CSS, and renderer assets. The only console entry was a non-blocking `favicon.ico` 404.
