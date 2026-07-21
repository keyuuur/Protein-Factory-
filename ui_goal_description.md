# Protein Factory UI Goal and Next Visual Polish

## Purpose

Protein Factory is an iPad-first Biology review game for ninth-grade students. It is a fast, mistake-tolerant checkpoint rather than a first-teach lesson. Students practice the connected pathway from a DNA strand to mRNA, from mRNA codons to an amino-acid chain, and from that chain to a modeled protein function and expressed trait.

The public product name is **Protein Factory**. The local folder retains the older `Pirate Protein Factory LOCAL` name.

This document records the current student experience and defines the next focused visual-meaning polish pass. It does not authorize a redesign, architecture migration, deployment, or data-contract change.

## Audience and Classroom Conditions

- Ninth-grade Biology students using school iPads, Chromebooks, or touch-capable browsers.
- Teachers may demonstrate the game on a projector while students play independently.
- Controls must remain obvious, readable, touch-friendly, and forgiving under classroom time pressure.
- Feedback must tell students exactly what needs attention without trapping them or using punitive language.
- The interface should remain bright and practical rather than dark, cinematic, or visually overloaded.

## Current V4 Game Contract

Each run contains **nine connected actions** across three protein products:

1. Original protein: Transcription, Translation, Function Test.
2. One-base variant that preserves the amino-acid chain: Transcription, Translation, Function Test.
3. One-base variant that changes one amino acid and the modeled outcome: Transcription, Translation, Function Test.

The complete flow is:

`Start → Tutorial → Protein 1 actions → Protein 2 actions → Protein 3 actions → Final comparison → Replay`

The game must continue to preserve:

- The V4 nine-action, three-product content and results contract.
- Compatibility with the legacy and V3 teacher-submission paths.
- Four amino acids followed by a separate terminal Stop signal.
- The codon wheel as a standard reference tool, not a corrective hint.
- Reload recovery, local result saving, queued submissions, and retry behavior.
- Student-facing terms such as `DNA strand`, `mRNA strand`, `codon`, `amino acid chain`, `protein function`, and `trait`.
- The existing ninth-grade scope without adding 5-prime/3-prime or template/coding-strand terminology.

## Active Application and Architecture

The active student application is under `web/` and uses Vite, React, TypeScript, and focused Three.js.

- React and the DOM own all prompts, controls, focus behavior, validation, feedback, recovery, and accessible status.
- Three.js provides a noninteractive laboratory view that reflects the active molecular state and student progress.
- The content engine owns validated sequences, codon mappings, function rows, scoring, and corrective feedback.
- Generated images and decorative graphics are never sources of biology facts, answer keys, or scoring behavior.

Keep this architecture. Do not reopen Phaser or move the controls into a full Three.js experience unless new physical-device or gameplay evidence justifies that change.

## Current UI Strengths

- The compact process rail clearly connects DNA, transcription, mRNA, translation, amino-acid chain, Function Test, and protein function.
- Each action presents one dominant student task with large controls and repairable feedback.
- Changed bases, active codons, repair targets, pending amino acids, Stop, and completed products already reach the Three.js renderer as structured state.
- The codon wheel highlights the active three-base path and gives students a deterministic scientific reference.
- The final report directly compares all three protein products, amino-acid chains, modeled functions, and traits.
- The fictional fur-color model includes an explicit disclaimer so students do not overgeneralize the simplified practice relationship.

## Verified Visual-Meaning Concern

The upper laboratory is polished and responsive, but much of its meaning is not immediately understandable to an average ninth-grade student. The task console below it currently carries most of the instruction.

- In Transcription, the colored spheres and boxes change, but they are not visibly identified as the DNA base being read and the mRNA base being added.
- In Translation, the machine resembles a ribosome only to a student who already recognizes the shape. The active codon-to-amino-acid relationship is too small and indirect.
- In Function Test, the abstract chamber, protein knot, and color swatch do not clearly communicate amino-acid chain to modeled function to trait.
- The product rings, status ring, progress strip, bench furniture, and empty background provide atmosphere but duplicate clearer information elsewhere.
- On iPad portrait, the laboratory occupies substantial vertical space before the student reaches the decision-bearing task controls.

The laboratory is therefore best treated as **responsive process feedback and game identity**, not as the primary instructional representation.

## Next Focused Visual-Meaning Polish

### 1. Make the task controls dominant

- Reduce the normal laboratory viewport from roughly `29vh` toward `18–22vh` where screen height permits.
- Preserve a stable, usable minimum height on short screens.
- Allow temporary emphasis only when it supports a deliberate reference view or brief success transition.
- Keep the task prompt, evidence, choices, feedback, and primary Check action visible as early as possible.

### 2. Replace the generic laboratory label

Replace `Active Laboratory` with one short, stage-specific sentence:

- Transcription: **Pair DNA bases to build the mRNA message.**
- Translation: **Read this codon to add one amino acid.**
- Function Test: **Connect the completed chain to its modeled outcome.**

The caption should describe the current biological relationship, not every decorative machine part.

### 3. Show one readable relationship per action

- Transcription: highlighted DNA base → newly placed mRNA base.
- Translation: highlighted three-base codon → selected amino acid → growing chain.
- Function Test: completed chain → modeled pigment output → trait.

Use the same accent color and position identifier in the laboratory and the task console. For example, `Codon 2` must be unmistakably the same codon in both places.

### 4. Simplify the laboratory machinery

- Keep the shared factory identity and responsive motion.
- Reduce the visual weight of inactive machinery, bench furniture, rails, empty background, and duplicated progress indicators.
- Keep animations as confirmation and reward, but ensure the settled frame remains understandable without motion.
- Do not add more decorative assets merely to make the laboratory look busier.

### 5. Simplify Function Test substantially

- Replace the ambiguous assay-machine emphasis with a compact, explicitly labeled modeled-outcome display.
- Echo the selected row's amino-acid chain, modeled pigment output, and trait color.
- Do not imply that the simplified fictional relationship is a realistic physical assay or a universal one-protein/one-trait rule.
- Keep the candidate rows and their accessible DOM controls as the authoritative decision surface.

### 6. Preserve and clarify the codon wheel

- Keep the wheel large when the student intentionally opens it.
- Preserve the highlighted active-codon path and `AUG to Met`-style readout.
- Place a compact reading cue near the active path: **1st base → 2nd base → 3rd base → amino acid**.
- Preserve modal focus containment, close behavior, touch panning, rotation recovery, and return focus.

## Screen-Level Expectations

### Start and Tutorial

- Keep identity inputs short and clear.
- Explain the three-product comparison and nine-action structure without a large text block.
- Keep student data off projector-oriented or public summary views.

### Transcription

- Keep the DNA evidence, mRNA build slots, base choices, repair controls, Hint, and Check action authoritative.
- Make the same active or repaired base visible in the compact laboratory view.

### Translation

- Keep one active codon, four amino-acid positions, and a separate Stop signal.
- Make the current codon and its pending or confirmed amino acid the dominant laboratory relationship.
- Keep the codon wheel contextual and available throughout Translation.

### Function Test

- Keep the completed chain and function/trait reference rows easy to compare.
- Use the upper visual only as a concise echo of the selected modeled outcome.

### Protein Transitions and Final Report

- Make the original-versus-variant comparison the focal information.
- Keep the final report text-first; it does not need a large decorative laboratory scene.
- Preserve score, independence, repair, completion, recovery, Replay, and New Student behavior.

## Acceptance Criteria for the Future Polish Pass

- A student can explain what the upper visual represents in each action without relying on animation alone.
- The active DNA base, codon number, amino acid, or modeled outcome matches the task console in every pending, repaired, and confirmed state.
- The task controls remain visible and dominant on desktop, iPad portrait, iPad landscape, phone Chromium, and iPhone/WebKit profiles.
- The codon wheel remains readable, focus-safe, pannable on compact screens, and correct for all 64 RNA codons.
- Reduced-motion behavior remains understandable without animated cues.
- The V4 nine-action results payload, V3 compatibility, scoring, persistence, and submission behavior remain unchanged.
- Unit tests, lint, build, renderer-size gates, relevant Playwright flows, and the visual device matrix pass.
- Production remains approval-gated until a physical Safari iPad run succeeds.

## Out of Scope for This Document Update

- Implementing the visual polish described above.
- Changing biology content, sequences, codon mappings, scoring, or result schemas.
- Changing student identity fields, Apps Script destinations, tokens, or Vercel environment variables.
- Promoting the current preview to production.
- Replacing React/DOM controls or migrating the game to Phaser.

## Canonical References

- `docs/handoffs/PROJECT_CONTEXT.md` — stable decisions and architecture boundaries.
- `docs/handoffs/CURRENT_STATUS.md` — current verified release and deployment posture.
- `docs/visual/reviews/three-pass-final/README.md` — existing visual evidence and release assessment.
- `docs/visual/three-pass-resume-checkpoint.md` — implementation checkpoint and resume details.
- `web/README.md` — active application, testing, and deployment contract.
- `web/src/game/content/rounds.ts` — validated V4 content and nine-action run construction.
