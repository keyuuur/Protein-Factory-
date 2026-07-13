import { Check, Eraser, Lightbulb, RotateCcw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Feedback, GameRound, ProteinRound, RoundState, TranscriptionRound, TranslationRound } from '../types'

interface TaskDockProps {
  feedback: Feedback | null
  onAppendBase: (base: string) => void
  onBackspace: () => void
  onCheckBaseRound: () => void
  onCheckTranslationCodon: () => void
  onClear: () => void
  onGoToTranslationCodon: (index: number) => void
  onSelectFunctionRow: (rowId: string) => void
  onSelectTranslation: (index: number, value: string) => void
  onCheckFunctionTest: () => void
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
  onCheckTranslationCodon,
  onClear,
  onGoToTranslationCodon,
  onSelectFunctionRow,
  onSelectTranslation,
  onCheckFunctionTest,
  onToggleHint,
  round,
  roundState,
}: TaskDockProps) {
  const visibleFeedback = feedback?.kind === 'info' ? null : feedback
  const feedbackRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (visibleFeedback) feedbackRef.current?.focus({ preventScroll: true })
  }, [visibleFeedback])

  return (
    <section
      className={`task-dock ${round.type} ${roundState.repairTarget ? 'repair-mode' : ''}`}
      aria-labelledby="task-dock-title"
      data-testid="task-dock"
    >
      <header className="task-dock-header">
        <div>
          <p className="eyebrow">Action {round.context.action === 'transcription' ? 1 : round.context.action === 'translation' ? 2 : 3} of 3</p>
          <h2 id="task-dock-title">{actionTitle(round)}</h2>
        </div>
        <p>{round.prompt}</p>
      </header>

      {visibleFeedback && (
        <div className={`inline-feedback ${visibleFeedback.kind}`} ref={feedbackRef} role="status" tabIndex={-1}>
          <strong>{visibleFeedback.title}</strong>
          <span>{visibleFeedback.message}</span>
          {visibleFeedback.detail && <small>{visibleFeedback.detail}</small>}
        </div>
      )}

      {round.type === 'transcription' ? (
        <TranscriptionTask
          onAppendBase={onAppendBase}
          onBackspace={onBackspace}
          onCheck={onCheckBaseRound}
          onClear={onClear}
          onToggleHint={onToggleHint}
          round={round}
          roundState={roundState}
        />
      ) : round.type === 'translation' ? (
        <TranslationTask
          onCheck={onCheckTranslationCodon}
          onGoToCodon={onGoToTranslationCodon}
          onSelect={onSelectTranslation}
          onToggleHint={onToggleHint}
          round={round}
          roundState={roundState}
        />
      ) : (
        <FunctionTask
          onCheck={onCheckFunctionTest}
          onSelect={onSelectFunctionRow}
          onToggleHint={onToggleHint}
          round={round}
          roundState={roundState}
        />
      )}
    </section>
  )
}

function TranscriptionTask({
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
  round: TranscriptionRound
  roundState: RoundState
}) {
  const input = roundState.input.padEnd(round.answer.length, ' ')
  const repairIndex = roundState.repairTarget?.kind === 'base' ? roundState.repairTarget.index : -1
  const changedDnaIndex = round.context.sequence.changedDnaIndex
  const choices = roundState.narrowedChoices.length > 0 ? roundState.narrowedChoices : round.options

  return (
    <div className="task-surface transcription-workbench">
      {changedDnaIndex !== null && (
        <p className="variant-notice">One nucleotide in this DNA strand differs from the original sequence. The changed position is highlighted.</p>
      )}
      <div className="sequence-rack" aria-label="DNA and mRNA grouped into five codons">
        {Array.from({ length: 5 }, (_, codonIndex) => (
          <div className="transcription-codon" key={`codon-${codonIndex}`}>
            <span className="codon-index">Codon {codonIndex + 1}</span>
            <div className="base-slot-row dna-row">
              {round.template.slice(codonIndex * 3, codonIndex * 3 + 3).split('').map((base, offset) => {
                const index = codonIndex * 3 + offset
                return <span className={`${index === repairIndex ? 'repair-target' : ''} ${index === changedDnaIndex ? 'changed-base' : ''}`} key={`dna-${index}`}><b>{base}</b></span>
              })}
            </div>
            <div className="pair-marks" aria-hidden="true"><i /><i /><i /></div>
            <div className="base-slot-row mrna-row">
              {input.slice(codonIndex * 3, codonIndex * 3 + 3).split('').map((base, offset) => {
                const index = codonIndex * 3 + offset
                const filled = base.trim().length > 0
                const mismatch = filled && base !== round.answer[index]
                return (
                  <span
                    aria-label={`mRNA slot ${index + 1}${filled ? `, ${base}` : ', empty'}`}
                    className={`${index === repairIndex ? 'repair-target' : ''} ${mismatch ? 'mismatch' : ''} ${filled ? 'filled' : ''}`}
                    key={`rna-${index}`}
                  >
                    <b aria-hidden="true">{filled ? base : ''}</b>
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="sequence-labels" aria-hidden="true"><span>DNA</span><span>mRNA</span></div>

      {repairIndex >= 0 && <p className="repair-callout">Repair highlighted slot {repairIndex + 1}.</p>}

      <div className="action-shelf">
        <div className="base-grid" role="group" aria-label="RNA bases">
          {choices.map((base) => <button className={`base-button base-${base.toLowerCase()}`} key={base} onClick={() => onAppendBase(base)} type="button">{base}</button>)}
        </div>
        <div className="control-row">
          <button aria-label="Remove last base" className="icon-button quiet" disabled={!roundState.input} onClick={onBackspace} title="Remove last base" type="button"><RotateCcw aria-hidden="true" size={21} /></button>
          <button aria-label="Clear mRNA" className="icon-button quiet" disabled={!roundState.input} onClick={onClear} title="Clear mRNA" type="button"><Eraser aria-hidden="true" size={21} /></button>
          <button className="primary-action" disabled={roundState.input.length !== round.answer.length} onClick={onCheck} type="button"><Check aria-hidden="true" size={22} /> Check mRNA</button>
        </div>
      </div>
      <HintBlock hint={round.hint} isOpen={roundState.showHint} onToggle={onToggleHint} />
    </div>
  )
}

function TranslationTask({
  onCheck,
  onGoToCodon,
  onSelect,
  onToggleHint,
  round,
  roundState,
}: {
  onCheck: () => void
  onGoToCodon: (index: number) => void
  onSelect: (index: number, value: string) => void
  onToggleHint: () => void
  round: TranslationRound
  roundState: RoundState
}) {
  const activeIndex = roundState.currentCodonIndex
  const repairIndex = roundState.repairTarget?.kind === 'codon' ? roundState.repairTarget.index : -1
  const currentChoice = roundState.pendingTranslationChoice || roundState.answers[activeIndex] || ''
  const choices = roundState.narrowedChoices.length > 0 ? roundState.narrowedChoices : round.codonChoices[activeIndex]
  const firstOpen = roundState.answers.findIndex((answer) => !answer)

  return (
    <div className="task-surface translation-workbench">
      <div className="codon-selector" role="group" aria-label="Five mRNA codons">
        {round.codons.map((codon, index) => {
          const locked = firstOpen >= 0 && index > firstOpen && !roundState.answers[index]
          return (
            <button
              aria-current={index === activeIndex ? 'step' : undefined}
              className={`${index === activeIndex ? 'active' : ''} ${roundState.answers[index] ? 'complete' : ''} ${index === repairIndex ? 'repair-target' : ''}`}
              disabled={locked}
              key={`${codon}-${index}`}
              onClick={() => onGoToCodon(index)}
              type="button"
            >
              <span>{index + 1}</span><strong>{codon}</strong><small>{roundState.answers[index] || 'Open'}</small>
            </button>
          )
        })}
      </div>

      <div className="translation-focus">
        <div className="active-codon-card">
          <span>Codon {activeIndex + 1} of 5</span>
          <strong>{round.codons[activeIndex]}</strong>
        </div>
        <div className="translation-choices" role="group" aria-label={`Signals for ${round.codons[activeIndex]}`}>
          {choices.map((choice) => (
            <button
              aria-pressed={currentChoice === choice}
              className={`answer-button ${currentChoice === choice ? 'selected' : ''}`}
              key={choice}
              onClick={() => onSelect(activeIndex, choice)}
              type="button"
            >{choice}</button>
          ))}
        </div>
      </div>

      {repairIndex >= 0 && (
        <p className="repair-callout">
          Recheck codon {repairIndex + 1} with the codon wheel, then choose its matching signal.
        </p>
      )}

      <div className="chain-builder" aria-label="Amino acid chain with four slots followed by a stop signal">
        <span className="chain-label">Chain</span>
        {Array.from({ length: 4 }, (_, index) => (
          <span className={`chain-slot ${roundState.answers[index] ? 'filled' : ''}`} key={`chain-${index}`}>
            <small>{index + 1}</small><strong>{roundState.answers[index] || '---'}</strong>
          </span>
        ))}
        <i aria-hidden="true" />
        <span className={`stop-slot ${roundState.answers[4] ? 'filled' : ''}`}><small>Stop codon</small><strong>{roundState.answers[4] || 'Stop'}</strong></span>
      </div>

      <div className="action-shelf translation-action">
        <HintBlock hint={round.hint} isOpen={roundState.showHint} onToggle={onToggleHint} />
        <button className="primary-action" disabled={!currentChoice} onClick={onCheck} type="button"><Check aria-hidden="true" size={22} /> Check codon</button>
      </div>
    </div>
  )
}

function FunctionTask({
  onCheck,
  onSelect,
  onToggleHint,
  round,
  roundState,
}: {
  onCheck: () => void
  onSelect: (rowId: string) => void
  onToggleHint: () => void
  round: ProteinRound
  roundState: RoundState
}) {
  const visibleRows = round.referenceRows.filter((row) => roundState.narrowedChoices.length === 0 || roundState.narrowedChoices.includes(row.id))

  return (
    <div className="task-surface function-workbench">
      <div className="chain-under-test"><span>Completed chain</span><strong>{round.chain}</strong></div>
      <p className="model-disclaimer">Fictional fur-color practice model. In real organisms, an amino-acid change may or may not change protein function, and fur color involves multiple genes and regulatory pathways.</p>
      <div className="function-table" role="radiogroup" aria-label="Fictional fur-color model matching rows">
        <div className="function-table-head" aria-hidden="true">
          <span>Amino acid sequence</span><span>Protein function</span><span>Expressed trait</span>
        </div>
        {visibleRows.map((row) => {
          const selected = roundState.selectedFunctionRowId === row.id
          return (
            <button
              aria-checked={selected}
              className={`function-row ${selected ? 'selected' : ''} ${roundState.repairTarget?.kind === 'function-row' && selected ? 'repair-target' : ''}`}
              key={row.id}
              onClick={() => onSelect(row.id)}
              role="radio"
              type="button"
            >
              <span><b>{row.aminoAcidSequence.join(' - ')}</b></span>
              <span>{row.proteinFunction}</span>
              <span><i className={`trait-swatch ${row.traitColor}`} aria-hidden="true" /><b>{row.expressedTrait}</b></span>
            </button>
          )
        })}
      </div>
      {roundState.repairTarget?.kind === 'function-row' && <p className="repair-callout">Compare all four amino acids and select the matching row.</p>}
      <div className="action-shelf function-action">
        <HintBlock hint={round.hint} isOpen={roundState.showHint} onToggle={onToggleHint} />
        <button className="primary-action" disabled={!roundState.selectedFunctionRowId} onClick={onCheck} type="button"><Check aria-hidden="true" size={22} /> Check Match</button>
      </div>
    </div>
  )
}

function HintBlock({ hint, isOpen, onToggle }: { hint: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="hint-zone">
      <button aria-expanded={isOpen} className="secondary-action compact" onClick={onToggle} type="button"><Lightbulb aria-hidden="true" size={19} /> Hint</button>
      {isOpen && <p className="hint-copy">{hint}</p>}
    </div>
  )
}

function actionTitle(round: GameRound): string {
  if (round.type === 'transcription') return 'Build the mRNA'
  if (round.type === 'translation') return 'Build the amino acid chain'
  return 'Function Test'
}
