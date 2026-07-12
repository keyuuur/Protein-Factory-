import { Check, Compass, Eraser, Lightbulb, RotateCcw } from 'lucide-react'
import type { BaseRound, Feedback, GameRound, ProteinOption, ProteinRound, RoundState, TranslationRound } from '../types'
import { formatChain } from '../game/gameLogic'
import { ProgressRail } from './ProgressRail'

interface RoundScreenProps {
  feedback: Feedback | null
  onAppendBase: (base: string) => void
  onBackspace: () => void
  onCheckBaseRound: () => void
  onCheckFullTranslation: () => void
  onClear: () => void
  onOpenCodonWheel: () => void
  onSelectProtein: (option: ProteinOption) => void
  onSelectTranslation: (index: number, value: string) => void
  onToggleHint: () => void
  round: GameRound
  roundIndex: number
  roundState: RoundState
  score: number
  totalRounds: number
}

export function RoundScreen({
  feedback,
  onAppendBase,
  onBackspace,
  onCheckBaseRound,
  onCheckFullTranslation,
  onClear,
  onOpenCodonWheel,
  onSelectProtein,
  onSelectTranslation,
  onToggleHint,
  round,
  roundIndex,
  roundState,
  score,
  totalRounds,
}: RoundScreenProps) {
  return (
    <main className="game-layout" data-testid="round-screen">
      <ProgressRail currentRoundIndex={roundIndex} score={score} />

      <section className="challenge-stage" aria-labelledby="round-title">
        <header className="challenge-header">
          <div>
            <p className="round-count">
              Round {roundIndex + 1} of {totalRounds}
            </p>
            <h1 id="round-title">{round.title}</h1>
          </div>
          {round.type === 'translation' && (
            <button className="secondary-action compact" onClick={onOpenCodonWheel} type="button">
              <Compass aria-hidden="true" size={20} />
              Codon Wheel
            </button>
          )}
        </header>

        <p className="challenge-prompt">{round.prompt}</p>

        {isBaseRound(round) ? (
          <BaseRoundControls
            onAppendBase={onAppendBase}
            onBackspace={onBackspace}
            onCheck={onCheckBaseRound}
            onClear={onClear}
            onToggleHint={onToggleHint}
            round={round}
            roundState={roundState}
          />
        ) : isTranslationRound(round) ? (
          <TranslationControls
            onCheckFullTranslation={onCheckFullTranslation}
            onSelectTranslation={onSelectTranslation}
            onToggleHint={onToggleHint}
            round={round}
            roundState={roundState}
          />
        ) : isProteinRound(round) ? (
          <ProteinControls
            onSelectProtein={onSelectProtein}
            onToggleHint={onToggleHint}
            round={round}
            roundState={roundState}
          />
        ) : null}

        {feedback && (
          <div className={`inline-feedback ${feedback.kind}`} role="status">
            <strong>{feedback.title}</strong>
            <span>{feedback.message}</span>
            {feedback.detail && <small>{feedback.detail}</small>}
          </div>
        )}
      </section>
    </main>
  )
}

interface BaseRoundControlsProps {
  onAppendBase: (base: string) => void
  onBackspace: () => void
  onCheck: () => void
  onClear: () => void
  onToggleHint: () => void
  round: BaseRound
  roundState: RoundState
}

function BaseRoundControls({
  onAppendBase,
  onBackspace,
  onCheck,
  onClear,
  onToggleHint,
  round,
  roundState,
}: BaseRoundControlsProps) {
  return (
    <div className="task-surface">
      <div className="sequence-board" aria-label="Sequence build area">
        <div>
          <span>Template</span>
          <strong>{round.template}</strong>
        </div>
        <div>
          <span>Your build</span>
          <strong>{roundState.input || '----'}</strong>
        </div>
      </div>

      <div className="base-grid" aria-label="Base choices">
        {round.options.map((base) => (
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
        <button className="primary-action" onClick={onCheck} type="button">
          <Check aria-hidden="true" size={22} />
          Check answer
        </button>
      </div>

      <HintBlock hint={round.hint} isOpen={roundState.showHint} onToggle={onToggleHint} />
    </div>
  )
}

interface TranslationControlsProps {
  onCheckFullTranslation: () => void
  onSelectTranslation: (index: number, value: string) => void
  onToggleHint: () => void
  round: TranslationRound
  roundState: RoundState
}

function TranslationControls({
  onCheckFullTranslation,
  onSelectTranslation,
  onToggleHint,
  round,
  roundState,
}: TranslationControlsProps) {
  const activeCodonIndex = roundState.currentCodonIndex

  return (
    <div className="task-surface">
      <div className="sequence-board" aria-label="Translation status">
        <div>
          <span>mRNA</span>
          <strong>{round.codons.join(' ')}</strong>
        </div>
        <div>
          <span>Current chain</span>
          <strong>{formatChain(roundState)}</strong>
        </div>
      </div>

      {round.mode === 'perCodon' ? (
        <div className="codon-card">
          <p>
            Codon {activeCodonIndex + 1} of {round.codons.length}
          </p>
          <h2>{round.codons[activeCodonIndex]}</h2>
          <div className="answer-grid">
            {round.codonChoices[activeCodonIndex].map((choice) => (
              <button
                className="answer-button"
                key={choice}
                onClick={() => onSelectTranslation(activeCodonIndex, choice)}
                type="button"
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="full-translation">
          {round.codons.map((codon, index) => (
            <div className="codon-card compact-card" key={codon}>
              <p>Codon {index + 1}</p>
              <h2>{codon}</h2>
              <div className="answer-grid">
                {round.codonChoices[index].map((choice) => (
                  <button
                    className={`answer-button ${roundState.answers[index] === choice ? 'selected' : ''}`}
                    key={choice}
                    onClick={() => onSelectTranslation(index, choice)}
                    type="button"
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button className="primary-action full-width" onClick={onCheckFullTranslation} type="button">
            <Check aria-hidden="true" size={22} />
            Check sequence
          </button>
        </div>
      )}

      <HintBlock hint={round.hint} isOpen={roundState.showHint} onToggle={onToggleHint} />
    </div>
  )
}

interface ProteinControlsProps {
  onSelectProtein: (option: ProteinOption) => void
  onToggleHint: () => void
  round: ProteinRound
  roundState: RoundState
}

function ProteinControls({ onSelectProtein, onToggleHint, round, roundState }: ProteinControlsProps) {
  return (
    <div className="task-surface">
      <div className="sequence-board single">
        <div>
          <span>Amino acid chain</span>
          <strong>{round.chain}</strong>
        </div>
      </div>

      <div className="trait-grid" aria-label="Trait choices">
        {round.options.map((option) => (
          <button
            className={`trait-card ${roundState.selectedTrait === option.trait ? 'selected' : ''}`}
            key={`${option.protein}-${option.trait}`}
            onClick={() => onSelectProtein(option)}
            type="button"
          >
            <span>{option.protein}</span>
            <strong>{option.trait}</strong>
          </button>
        ))}
      </div>

      <HintBlock hint={round.hint} isOpen={roundState.showHint} onToggle={onToggleHint} />
    </div>
  )
}

interface HintBlockProps {
  hint: string
  isOpen: boolean
  onToggle: () => void
}

function HintBlock({ hint, isOpen, onToggle }: HintBlockProps) {
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

function isProteinRound(round: GameRound): round is ProteinRound {
  return round.type === 'protein'
}
