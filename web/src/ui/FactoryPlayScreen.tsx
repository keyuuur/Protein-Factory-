import { Check, CircleDot, Dna, FlaskConical, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameAction } from '../game/simulation/gameReducer'
import { buildFactorySceneState } from '../render/adapters/sceneState'
import type { GameSessionState, MolecularState, ProductSnapshot, ProductionAction } from '../types'
import { CodonWheel } from './CodonWheel'
import { FactoryCanvas } from './FactoryCanvas'
import { TaskDock } from './TaskDock'

interface FactoryPlayScreenProps {
  dispatch: (action: GameAction) => void
  state: GameSessionState
}

const molecularSteps: Array<{ kind: 'state' | 'action'; id: MolecularState | ProductionAction; label: string }> = [
  { kind: 'state', id: 'dna', label: 'DNA' },
  { kind: 'action', id: 'transcription', label: 'Transcription' },
  { kind: 'state', id: 'mrna', label: 'mRNA' },
  { kind: 'action', id: 'translation', label: 'Translation' },
  { kind: 'state', id: 'amino-acid-chain', label: 'Amino acid chain' },
  { kind: 'action', id: 'function-test', label: 'Function Test' },
  { kind: 'state', id: 'protein-function', label: 'Protein function' },
]

export function FactoryPlayScreen({ dispatch, state }: FactoryPlayScreenProps) {
  const rounds = state.runManifest.rounds
  const currentRound = rounds[state.currentRoundIndex]
  const [soundEnabled, setSoundEnabled] = useState(state.settings.soundEnabled)
  const proteinNumber = currentRound.context.sequenceIndex + 1
  const actionNumber = currentRound.context.action === 'transcription' ? 1 : currentRound.context.action === 'translation' ? 2 : 3
  const activeRailIndex = actionNumber === 1 ? 1 : actionNumber === 2 ? 3 : 5
  const completedActions = state.roundResults.length
  const sceneState = buildFactorySceneState(state)
  const handleStationSelect = useCallback(() => undefined, [])
  const nextSequence = rounds[state.currentRoundIndex + 1]?.context.sequence
  const originalSequence = rounds[0].context.sequence
  const changedIndex = nextSequence?.changedDnaIndex ?? null
  const feedback = state.feedback
  const wheelLaunchRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!soundEnabled || !feedback || feedback.kind === 'info') return undefined
    try {
      const audioContext = new AudioContext()
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      oscillator.frequency.value = feedback.kind === 'success' ? 660 : 220
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18)
      oscillator.connect(gain).connect(audioContext.destination)
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.2)
      oscillator.addEventListener('ended', () => void audioContext.close(), { once: true })
    } catch {
      // Sound is optional; gameplay remains fully usable when audio is blocked.
    }
    return undefined
  }, [feedback, soundEnabled])

  return (
    <main className={`factory-play ${currentRound.type} ${state.isCodonWheelOpen ? 'wheel-open' : ''}`} data-testid="factory-play">
      <FactoryCanvas onStationSelect={handleStationSelect} sceneState={sceneState} />
      <header className="workbench-header">
        <div className="protein-counter">
          <span className="brand-mini"><Dna aria-hidden="true" size={20} /></span>
          <div><strong>Protein {proteinNumber} of 3</strong><span>Action {actionNumber} of 3</span></div>
        </div>
        <ProcessRail activeIndex={activeRailIndex} />
        <div className="run-tools">
          <span className="stage-score"><b>{completedActions}</b>/9 complete</span>
          <button
            aria-label={soundEnabled ? 'Mute sound' : 'Turn on sound'}
            aria-pressed={soundEnabled}
            className="icon-button sound-toggle"
            onClick={() => setSoundEnabled((value) => !value)}
            title={soundEnabled ? 'Mute sound' : 'Turn on sound'}
            type="button"
          >
            {soundEnabled ? <Volume2 aria-hidden="true" size={20} /> : <VolumeX aria-hidden="true" size={20} />}
          </button>
        </div>
      </header>

      {state.saveStatus === 'failed-local' && (
        <p className="storage-alert" data-testid="storage-warning" role="alert">
          Device storage unavailable. Keep this tab open until your run is finished.
        </p>
      )}

      <section className={`workbench-grid ${currentRound.type === 'translation' && state.isCodonWheelOpen ? 'wheel-expanded' : ''}`}>
        <TaskDock
          feedback={state.feedback}
          onAppendBase={(base) => dispatch({ type: 'APPEND_BASE', base })}
          onBackspace={() => dispatch({ type: 'BACKSPACE' })}
          onCheckBaseRound={() => dispatch({ type: 'CHECK_BASE_ROUND' })}
          onCheckFunctionTest={() => dispatch({ type: 'CHECK_FUNCTION_ROW' })}
          onCheckTranslationCodon={() => dispatch({ type: 'CHECK_TRANSLATION_CODON' })}
          onClear={() => dispatch({ type: 'CLEAR_INPUT' })}
          onGoToTranslationCodon={(index) => dispatch({ type: 'GO_TO_TRANSLATION_CODON', index })}
          onSelectFunctionRow={(rowId) => dispatch({ type: 'SELECT_FUNCTION_ROW', rowId })}
          onSelectTranslation={(index, value) => dispatch({ type: 'SELECT_TRANSLATION', index, value })}
          onToggleHint={() => dispatch({ type: 'TOGGLE_HINT' })}
          round={currentRound}
          roundNumber={state.currentRoundIndex + 1}
          roundState={state.roundState}
          totalRounds={rounds.length}
        />

        {currentRound.type === 'translation' && (
          <>
            <button
              aria-haspopup="dialog"
              className="secondary-action wheel-launch"
              hidden={state.isCodonWheelOpen}
              onClick={() => dispatch({ type: 'OPEN_CODON_WHEEL' })}
              ref={wheelLaunchRef}
              type="button"
            >
              <CircleDot aria-hidden="true" size={20} /> Open Codon Wheel
            </button>
            <CodonWheel
              activeCodonIndex={state.roundState.currentCodonIndex}
              codons={currentRound.codons}
              isOpen={state.isCodonWheelOpen}
              onClose={() => dispatch({ type: state.isCodonWheelOpen ? 'CLOSE_CODON_WHEEL' : 'OPEN_CODON_WHEEL' })}
              returnFocusRef={wheelLaunchRef}
            />
          </>
        )}
      </section>

      <ComparisonTray products={state.completedProducts} />

      {state.feedback?.kind === 'success' && (
        <section className={`sequence-complete ${state.screen === 'sequence-transition' ? 'protein-complete' : ''}`} role="status" data-testid="shipment-overlay">
          <span className="success-mark"><Check aria-hidden="true" size={23} /></span>
          <div>
            <small>{state.screen === 'sequence-transition' ? `Protein ${proteinNumber} complete` : `Action ${actionNumber} complete`}</small>
            <strong>{state.feedback.title}</strong>
            <span>{state.feedback.message}</span>
            {state.screen === 'sequence-transition' && nextSequence && changedIndex !== null && (
              <span className="change-brief">
                Next DNA change: position {changedIndex + 1} changes from {originalSequence.dnaStrand[changedIndex]} to {nextSequence.dnaStrand[changedIndex]}.
              </span>
            )}
          </div>
          <button className="primary-action compact" onClick={() => dispatch({ type: 'CONTINUE_AFTER_SUCCESS', now: Date.now() })} type="button">
            {state.currentRoundIndex === rounds.length - 1 ? 'Finish run' : state.screen === 'sequence-transition' ? `Start Protein ${proteinNumber + 1}` : 'Next action'}
          </button>
        </section>
      )}
    </main>
  )
}

function ProcessRail({ activeIndex }: { activeIndex: number }) {
  return (
    <ol className="process-rail" aria-label="DNA to protein function process">
      {molecularSteps.map((step, index) => (
        <li
          aria-current={index === activeIndex ? 'step' : undefined}
          className={`${step.kind} ${index < activeIndex ? 'complete' : ''} ${index === activeIndex ? 'active' : ''}`}
          key={step.id}
        >
          {step.kind === 'state' ? <span>{step.label}</span> : <><i aria-hidden="true" /><b>{step.label}</b></>}
        </li>
      ))}
    </ol>
  )
}

function ComparisonTray({ products }: { products: ProductSnapshot[] }) {
  return (
    <section className="comparison-tray" aria-label="Completed protein comparison tray">
      <div className="comparison-title"><FlaskConical aria-hidden="true" size={19} /><span>Completed products</span></div>
      {Array.from({ length: 3 }, (_, index) => {
        const product = products[index]
        return product ? (
          <article className="product-chip" key={product.sequenceId}>
            <span>Protein {index + 1}</span>
            <strong>{product.aminoAcidChain.join('-')}</strong>
            <i className={`trait-swatch ${product.traitColor}`} aria-hidden="true" />
            <small>{productSummary(product)} - {product.expressedTrait}</small>
          </article>
        ) : (
          <div className="product-chip empty" key={`empty-${index}`}><span>Protein {index + 1}</span><strong>Waiting</strong></div>
        )
      })}
    </section>
  )
}

function productSummary(product: ProductSnapshot): string {
  if (product.sequenceRole === 'original') return 'Baseline'
  if (product.sequenceRole === 'same-chain-variant') return 'Same chain and function'
  return 'One amino acid changed'
}
