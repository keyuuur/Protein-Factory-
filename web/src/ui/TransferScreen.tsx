import { Check, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { TransferTask } from '../types'

interface TransferScreenProps {
  current: number
  onSubmit: (answer: string) => void
  task: TransferTask
  total: number
}

export function TransferScreen({ current, onSubmit, task, total }: TransferScreenProps) {
  const [answer, setAnswer] = useState('')

  function handleSubmit() {
    if (!answer) return
    onSubmit(answer)
    setAnswer('')
  }

  return (
    <main className="focus-screen transfer-screen" data-testid="transfer-screen">
      <section className="transfer-panel" aria-labelledby="transfer-title">
        <div className="screen-kicker"><RefreshCw aria-hidden="true" size={20} /> Practice check {current} of {total}</div>
        <h1 id="transfer-title">Targeted practice: {task.skillLabel}</h1>
        <p>{task.prompt}</p>
        <section className="transfer-stimulus" aria-labelledby="transfer-evidence-title">
          <p className="eyebrow" id="transfer-evidence-title">{task.evidencePrompt}</p>
          <TransferEvidence task={task} />
        </section>
        {task.attempts === 1 && (
          <div className="feedback-panel error" role="alert">
            <strong>Repair this answer.</strong>
            <p>{task.correctiveFeedback}</p>
            <p>This is your second and final check for this practice task.</p>
          </div>
        )}
        <div className="transfer-options" role="group" aria-label="Answer choices">
          {task.options.map((option) => (
            <button
              aria-pressed={answer === option}
              className={`answer-button ${answer === option ? 'selected' : ''}`}
              key={option}
              onClick={() => setAnswer(option)}
              type="button"
            >
              {formatOption(task, option)}
            </button>
          ))}
        </div>
        <div className="screen-actions">
          <button className="primary-action" disabled={!answer} onClick={handleSubmit} type="button">
            <Check aria-hidden="true" size={22} /> Check answer
          </button>
        </div>
      </section>
    </main>
  )
}

function TransferEvidence({ task }: { task: TransferTask }) {
  if (task.stimulus.kind === 'transcription') {
    return <p className="sequence-readout"><strong>DNA strand:</strong> {groupCodons(task.stimulus.dnaTemplate)}</p>
  }
  if (task.stimulus.kind === 'translation') {
    return <p className="sequence-readout"><strong>mRNA:</strong> {task.stimulus.mrnaCodons.join(' ')}</p>
  }
  return (
    <>
      <p className="sequence-readout"><strong>Amino-acid chain:</strong> {task.stimulus.aminoAcidChain.join(' - ')}</p>
      <div className="transfer-reference" aria-label="Protein function reference">
        {task.stimulus.referenceRows.map((row) => (
          <p key={row.id}><strong>{row.aminoAcidSequence.join(' - ')}</strong>: {row.proteinFunction}; {row.expressedTrait}</p>
        ))}
      </div>
    </>
  )
}

function formatOption(task: TransferTask, option: string): string {
  if (task.stimulus.kind === 'function-test') {
    const row = task.stimulus.referenceRows.find((candidate) => candidate.id === option)
    if (row) return `${row.proteinFunction} - ${row.expressedTrait}`
  }
  if (option.endsWith('-fur')) return option.replace('-fur', ' fur').replace(/^./, (letter) => letter.toUpperCase())
  return option.replaceAll('-', ' - ')
}

function groupCodons(sequence: string): string {
  return sequence.match(/.{1,3}/g)?.join(' ') ?? sequence
}
