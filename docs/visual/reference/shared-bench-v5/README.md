# Protein Factory V5 Ideal UI References

## Purpose

These standalone PNGs are visual targets for the next interface passes. They are not browser screenshots and are not student-facing game assets. Use them to judge composition, hierarchy, scale, and how directly the controls feel attached to the laboratory bench.

## Reference Set

- `ideals/01-transcription-student-pov.png`: filled DNA row, empty mRNA row, large base controls, and a transcription machine on the same shared bench.
- `ideals/02-translation-student-pov.png`: one active codon, four amino-acid slots, a separate Stop indicator, a restrained inline codon-wheel area, and one answer row.
- `ideals/03-function-test-student-pov.png`: one small protein chamber, the completed chain, three broad outcome rows, and simple fur-color swatches.

The earlier, busier Translation and Function Test concepts are retained under `archive/` for iteration history only. They are rejected as implementation targets.

## Design Targets

- The student's task is physically integrated into a gently tilted shared laboratory bench.
- One action dominates the screen while the current molecular product remains visible.
- The process rail stays compact and communicates forward movement from DNA to protein function.
- Touch choices are large, tactile, and close to the molecular object they affect.
- The 3D laboratory reacts to selections instead of acting only as a background.
- Translation and Function Test each use one uncomplicated work surface with no permanent product bays or competing status panels.
- The interface stays bright, practical, and classroom-safe rather than dark or cinematic.

## Accuracy Boundary

The translation image intentionally uses a label-only codon-wheel placeholder. Never extract codon mappings, scientific labels, DNA sequences, mRNA sequences, or scoring behavior from generated pixels. The actual game must continue to render its codon wheel and all molecular content from the frozen validated datasets in code.

Generated text may contain small visual imperfections. Treat the written requirements in this document and the live content engine as authoritative whenever the image and the specification differ.

## Relationship To Browser Evidence

The `output/playwright/v4-*-ui-pass-a-*.png` files show what the app currently renders. This V5 folder shows the visual direction the next passes should move toward. Keep the two sets separate during reviews.
