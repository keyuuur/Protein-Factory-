# Protein Factory Shared-Bench Reference

## Status

Historical planning record for the V4 three-protein game. Do not use the recovered desktop composite as the guiding visual ideal. The standalone V5 ideal references under `../shared-bench-v5/` replace it for future visual work.

The recoverable source composite includes unrelated desktop and browser details, so it is kept in the ignored local artifact folder and emailed directly to Keyur. It must not be committed or used as a student-facing asset.

## Approved Direction

- One student action fills the screen at a time.
- The laboratory reads as one shared bench tilted toward a seated student.
- The Three.js molecular specimen stays visible in a dedicated viewport.
- Accessible React controls dock to the front edge of the bench instead of floating in a detached modal.
- The process rail shows DNA, mRNA, amino acid chain, and protein function, with Transcription, Translation, and Function Test between them.
- Protein 1 uses the complete transcription, translation, and function-test workflow.
- Proteins 2 and 3 focus on tracing one changed DNA base through the affected mRNA codon, amino-acid result, modeled function, and trait.
- Every gameplay control is at least 48 by 48 pixels and remains usable without WebGL.
- The codon wheel is generated from the frozen 64-codon dataset. Generated images must never supply scientific labels or codon mappings.
- Function choices use the fictional fur-color practice model with complete four-amino-acid sequences.

## Visual Checkpoints

- `pass-a`: shared-bench structure, hierarchy, and classroom flow.
- `pass-b`: active molecular feedback, repairs, and product comparison.
- `pass-c`: spacing, typography, contrast, and final device polish.

Implementation evidence belongs in `output/playwright/`; approved clean reference screenshots may be copied here after review.
