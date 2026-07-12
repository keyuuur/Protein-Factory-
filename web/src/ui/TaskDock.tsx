import { Check, Compass, Eraser, Lightbulb, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { codonMap, conceptGlossary } from '../game/content/rounds'
import { formatChain } from '../game/simulation/gameReducer'
import type { BaseRound, Feedback, GameRound, ProteinOption, ProteinRound, RoundState, TranslationRound } from '../types'

interface TaskDockProps {
  feedback: Feedback | null
  onAppendBase: (base: string) => void
  onBackspace: () => void
  onCheckBaseRound: () => void
  onCheckFullTranslation: () => void
  onCheckProtein: () => void
  onCheckTranslationCodon: () => void
  onClear: () => void
  onClose: () => void
  onGoToTranslationCodon: (index: number) => void
  onOpenCodonWheel: () => void
  onSelectProtein: (option: ProteinOption) => void
  onSelectTranslation: (index: number, value: string) => void
  onToggleHint: () => void
  round: GameRound
  roundNumber: number
  roundState: RoundState
  totalRounds: number
}

export function TaskDock({
  feedback,
  onAppendBase,
  onBackspace,
  onCheckBaseRound,
  onCheckFullTranslation,
  onCheckProtein,
  onCheckTranslationCodon,
  onClear,
  onClose,
  onGoToTranslationCodon,
  onOpenCodonWheel,
  onSelectProtein,
  onSelectTranslation,
  onToggleHint,
  round,
  roundNumber,
  roundState,
  totalRounds,
}: TaskDockProps) {
  const visibleFeedback = feedback?.kind === 'info' ? null : feedback
  const feedbackRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (visibleFeedback) {
      feedbackRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [visibleFeedback])

  return (
    <section
      className={`task-dock ${round.type} ${roundState.repairTarget ? 'repair-mode' : ''}`}
      aria-labelledby="task-dock-title"
      data-testid="task-dock"
    >
      <header className="task-dock-header">
        <div>
          <p className="round-count">
            Round {roundNumber} of {totalRounds}
          </p>
          <h2 id="task-dock-title">{round.shortTitle}</h2>
        </div>
        <div className="task-dock-tools">
          {round.type === 'translation' && (
          <button className="secondary-action compact" onClick={onOpenCodonWheel} type="button">
            <Compass aria-hidden="true" size={18} />
              Codon Key
            </button>
          )}
          <button aria-label="Close station task" className="icon-button quiet" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
      </header>

      <ConceptBreadcrumb activeType={round.type} />
      <p className="challenge-prompt">{round.prompt}</p>
      <GlossaryStrip activeType={round.type} />

      {visibleFeedback && (
        <div className={`inline-feedback ${visibleFeedback.kind}`} ref={feedbackRef} role="status">
          <strong>{visibleFeedback.title}</strong>
          <span>{visibleFeedback.message}</span>
          {visibleFeedback.detail && <small>{visibleFeedback.detail}</small>}
        </div>
      )}

      {isBaseRound(round) ? (
        <BaseTask
          onAppendBase={onAppendBase}
          onBackspace={onBackspace}
          onCheck={onCheckBaseRound}
          onClear={onClear}
          onToggleHint={onToggleHint}
          round={round}
          roundState={roundState}
        />
      ) : isTranslationRound(round) ? (
        <TranslationTask
          onCheckFullTranslation={onCheckFullTranslation}
          onCheckTranslationCodon={onCheckTranslationCodon}
          onGoToTranslationCodon={onGoToTranslationCodon}
          onSelectTranslation={onSelectTranslation}
          onToggleHint={onToggleHint}
          round={round}
          roundState={roundState}
        />
      ) : (
        <ProteinTask
          onCheckProtein={onCheckProtein}
          onSelectProtein={onSelectProtein}
          onToggleHint={onToggleHint}
          round={round}
          roundState={roundState}
        />
      )}
    </section>
  )
}

function ConceptBreadcrumb({ activeType }: { activeType: GameRound['type'] }) {
  const steps = [
    { label: 'DNA', type: 'dna' },
    { label: 'mRNA', type: 'transcription' },
    { label: 'Amino acids', type: 'translation' },
    { label: 'Protein', type: 'protein' },
    { label: 'Trait', type: 'protein' },
  ] as const

  return (
    <ol className="concept-breadcrumb" aria-label="DNA to trait path">
      {steps.map((step) => (
        <li className={step.type === activeType ? 'active' : ''} key={step.label}>
          {step.label}
        </li>
      ))}
    </ol>
  )
}

function BaseTask({
  onAppendBase,
  onBackspace,
  onCheck,
  onClear,
  onToggleHint,
  round,
  roundState,
}: {
  onAppendBase: (base: string) => void
  onBackspace: () => void
  onCheck: () => void
  onClear: () => void
  onToggleHint: () => void
  round: BaseRound
  roundState: RoundState
}) {
  return (
    <div className={`task-surface ${round.type === 'dna' ? 'dna-tray-interface' : 'rna-press-interface'}`}>
      <div className="instrument-label">
        <span>{round.type === 'dna' ? 'DNA assembly trays' : 'Transcription press'}</span>
        <strong>{round.type === 'dna' ? 'Place one complementary base in each tray.' : 'Load RNA bases under the DNA template.'}</strong>
      </div>
      <div className="sequence-board">
        <div>
          <span>{round.type === 'dna' ? "Coding DNA blueprint (5' to 3')" : "Template DNA (3' to 5')"}</span>
          <SequenceTiles value={round.template} repairIndex={roundState.repairTarget?.kind === 'base' ? roundState.repairTarget.index : -1} />
        </div>
        <div>
          <span>{round.type === 'transcription' ? 'mRNA output strip' : 'Complementary DNA trays'}</span>
          <SequenceTiles
            expected={round.answer}
            repairIndex={roundState.repairTarget?.kind === 'base' ? roundState.repairTarget.index : -1}
            value={roundState.input.padEnd(round.answer.length, '-')}
          />
        </div>
      </div>

      {roundState.repairTarget?.kind === 'base' && (
        <p className="repair-callout">Tap the correct base to repair position {roundState.repairTarget.index + 1}.</p>
      )}

      <div className="base-grid" aria-label={round.type === 'dna' ? 'DNA base cartridges' : 'RNA base cartridges'}>
        {(roundState.narrowedChoices.length > 0 ? roundState.narrowedChoices : round.options).map((base) => (
          <button className="base-button" key={base} onClick={() => onAppendBase(base)} type="button">
            {base}
          </button>
        ))}
      </div>

      <div className="control-row">
        <button className="secondary-action" onClick={onBackspace} type="button">
          <RotateCcw aria-hidden="true" size={20} />
          Backspace
        </button>
        <button className="secondary-action" onClick={onClear} type="button">
          <Eraser aria-hidden="true" size={20} />
          Clear
        </button>
        <button className="primary-action" disabled={roundState.input.length !== round.answer.length} onClick={onCheck} type="button">
          <Check aria-hidden="true" size={22} />
          Check answer
        </button>
      </div>

      <HintBlock hint={round.hint} isOpen={roundState.showHint} onToggle={onToggleHint} />
    </div>
  )
}

function TranslationTask({
  onCheckFullTranslation,
  onCheckTranslationCodon,
  onGoToTranslationCodon,
  onSelectTranslation,
  onToggleHint,
  round,
  roundState,
}: {
  onCheckFullTranslation: () => void
  onCheckTranslationCodon: () => void
  onGoToTranslationCodon: (index: number) => void
  onSelectTranslation: (index: number, value: string) => void
  onToggleHint: () => void
  round: TranslationRound
  roundState: RoundState
}) {
  const activeCodonIndex = roundState.currentCodonIndex
  const currentChoice = roundState.answers[activeCodonIndex]
  const fullSequenceReady = roundState.answers.every(Boolean)
  const repairIndex = roundState.repairTarget?.kind === 'codon' ? roundState.repairTarget.index : -1

  return (
    <div className="task-surface">
      <div className="instrument-label">
        <span>Ribosome loading line</span>
        <strong>Read each mRNA codon from 5' to 3', then load its amino acid capsule.</strong>
      </div>
      <div className="sequence-board">
        <div>
          <span>mRNA</span>
          <CodonTiles codons={round.codons} activeIndex={activeCodonIndex} repairIndex={repairIndex} />
        </div>
        <div>
          <span>Current chain</span>
          <strong>{formatChain(roundState)}</strong>
        </div>
      </div>

      <div className="inline-codon-chart" aria-label="Simplified mRNA codon chart">
        <span>mRNA codon chart</span>
        <div>
          {Object.entries(codonMap).map(([codon, aminoAcid]) => (
            <p className={codon === round.codons[activeCodonIndex] ? 'active' : ''} key={codon}>
              <strong>{codon}</strong>
              <span>{aminoAcid}</span>
            </p>
          ))}
        </div>
      </div>

      {round.mode === 'perCodon' ? (
        <div className={`codon-card ${repairIndex === activeCodonIndex ? 'repair-target' : ''}`}>
          <p>
            Codon {activeCodonIndex + 1} of {round.codons.length}
          </p>
          <h3>{round.codons[activeCodonIndex]}</h3>
          <div className="answer-grid">
            {(roundState.narrowedChoices.length > 0 ? roundState.narrowedChoices : round.codonChoices[activeCodonIndex]).map((choice) => (
              <button
                aria-pressed={roundState.answers[activeCodonIndex] === choice}
                className={`answer-button ${roundState.answers[activeCodonIndex] === choice ? 'selected' : ''}`}
                key={choice}
                onClick={() => onSelectTranslation(activeCodonIndex, choice)}
                type="button"
              >
                {choice}
              </button>
            ))}
          </div>
          <button className="primary-action full-width" disabled={!currentChoice} onClick={onCheckTranslationCodon} type="button">
            <Check aria-hidden="true" size={22} />
            Check codon
          </button>
        </div>
      ) : (
        <div className="full-translation stepper">
          <div className="codon-step-list" aria-label="Codon steps">
            {round.codons.map((codon, index) => (
              <button
                aria-current={index === activeCodonIndex ? 'step' : undefined}
                className={[
                  'codon-step',
                  index === activeCodonIndex ? 'active' : '',
                  roundState.answers[index] ? 'loaded' : '',
                  repairIndex === index ? 'repair' : '',
                ].join(' ')}
                key={codon}
                onClick={() => onGoToTranslationCodon(index)}
                type="button"
              >
                <span>{index + 1}</span>
                <strong>{codon}</strong>
              </button>
            ))}
          </div>
          <div className={`codon-card compact-card ${repairIndex === activeCodonIndex ? 'repair-target' : ''}`}>
            <p>Codon {activeCodonIndex + 1} of {round.codons.length}</p>
            <h3>{round.codons[activeCodonIndex]}</h3>
            <div className="answer-grid">
              {(roundState.narrowedChoices.length > 0 ? roundState.narrowedChoices : round.codonChoices[activeCodonIndex]).map((choice) => (
                <button
                  aria-pressed={roundState.answers[activeCodonIndex] === choice}
                  className={`answer-button ${roundState.answers[activeCodonIndex] === choice ? 'selected' : ''}`}
                  key={choice}
                  onClick={() => onSelectTranslation(activeCodonIndex, choice)}
                  type="button"
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>
          <button className="primary-action full-width" disabled={!fullSequenceReady} onClick={onCheckFullTranslation} type="button">
            <Check aria-hidden="true" size={22} />
            Check sequence
          </button>
        </div>
      )}

      <HintBlock hint={round.hint} isOpen={roundState.showHint} onToggle={onToggleHint} />
    </div>
  )
}

function ProteinTask({
  onCheckProtein,
  onSelectProtein,
  onToggleHint,
  round,
  roundState,
}: {
  onCheckProtein: () => void
  onSelectProtein: (option: ProteinOption) => void
  onToggleHint: () => void
  round: ProteinRound
  roundState: RoundState
}) {
  return (
    <div className="task-surface">
      <div className="instrument-label">
        <span>Function test chamber</span>
        <strong>Compare fold and activity, then choose the result that matches this chain model.</strong>
      </div>
      <div className="sequence-board single">
        <div>
          <span>Model chain fragment</span>
          <strong>{round.chain}</strong>
          <small>Short clue, not a full real protein.</small>
        </div>
      </div>

      <div className="protein-comparison" aria-label="Normal and variant protein comparison">
        <div className="normal">
          <span className="fold-model" aria-hidden="true" />
          <strong>Normal fold</strong>
          <small>Active site fits its target</small>
        </div>
        <div className="variant">
          <span className="fold-model" aria-hidden="true" />
          <strong>Variant fold</strong>
          <small>Shape may change activity or pigment</small>
        </div>
      </div>

      <div className="trait-grid" aria-label="Trait choices">
        {round.options.filter((option) => roundState.narrowedChoices.length === 0 || roundState.narrowedChoices.includes(option.trait)).map((option) => (
          <button
            aria-pressed={roundState.selectedTrait === option.trait}
            className={[
              'trait-card',
              roundState.selectedTrait === option.trait ? 'selected' : '',
              roundState.repairTarget?.kind === 'protein' && roundState.selectedTrait === option.trait ? 'repair-target' : '',
            ].join(' ')}
            key={`${option.protein}-${option.trait}`}
            onClick={() => onSelectProtein(option)}
            type="button"
          >
            <span>{option.protein}</span>
            <strong>{option.trait}</strong>
            {option.clue && <small>{option.clue}</small>}
          </button>
        ))}
      </div>

      {roundState.repairTarget?.kind === 'protein' && (
        <p className="repair-callout">Use the model clue to choose the matching protein and trait.</p>
      )}

      <button className="primary-action full-width" disabled={!roundState.selectedTrait} onClick={onCheckProtein} type="button">
        <Check aria-hidden="true" size={22} />
        Check trait
      </button>

      <HintBlock hint={round.hint} isOpen={roundState.showHint} onToggle={onToggleHint} />
    </div>
  )
}

function GlossaryStrip({ activeType }: { activeType: GameRound['type'] }) {
  const entries =
    activeType === 'dna'
      ? [
          ['DNA', conceptGlossary.dna],
        ]
      : activeType === 'transcription'
        ? [
            ['DNA', conceptGlossary.dna],
            ['mRNA', conceptGlossary.transcription],
          ]
        : activeType === 'translation'
          ? [
              ['Codon', conceptGlossary.codon],
              ['Amino acid', conceptGlossary.aminoAcid],
            ]
          : [
              ['Protein', conceptGlossary.protein],
              ['Trait', conceptGlossary.trait],
            ]

  return (
    <details className="glossary-strip">
      <summary>Key terms</summary>
      <dl>
        {entries.map(([term, definition]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{definition}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

function SequenceTiles({ expected, repairIndex, value }: { expected?: string; repairIndex: number; value: string }) {
  return (
    <strong className="sequence-tiles">
      {value.split('').map((base, index) => (
        <span
          className={[
            index === repairIndex ? 'repair-target' : '',
            expected && expected[index] && base !== '-' && base !== expected[index] ? 'mismatch' : '',
          ].join(' ')}
          key={`${base}-${index}`}
        >
          {base}
        </span>
      ))}
    </strong>
  )
}

function CodonTiles({ activeIndex, codons, repairIndex }: { activeIndex: number; codons: string[]; repairIndex: number }) {
  return (
    <strong className="codon-tiles">
      {codons.map((codon, index) => (
        <span
          className={[
            index === activeIndex ? 'active' : '',
            index === repairIndex ? 'repair-target' : '',
          ].join(' ')}
          key={codon}
        >
          {codon}
        </span>
      ))}
    </strong>
  )
}

function HintBlock({ hint, isOpen, onToggle }: { hint: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="hint-zone">
      <button className="secondary-action compact" onClick={onToggle} type="button">
        <Lightbulb aria-hidden="true" size={20} />
        {isOpen ? 'Hide hint' : 'Show hint'}
      </button>
      {isOpen && <p className="hint-copy">{hint}</p>}
    </div>
  )
}

function isBaseRound(round: GameRound): round is BaseRound {
  return round.type === 'dna' || round.type === 'transcription'
}

function isTranslationRound(round: GameRound): round is TranslationRound {
  return round.type === 'translation'
}
