import { CheckCircle2, FlaskConical } from 'lucide-react'
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

  return (
    <main className="transfer-screen" data-testid="transfer-screen">
      <section className="transfer-panel" aria-labelledby="transfer-title">
        <FlaskConical aria-hidden="true" size={48} />
        <p className="eyebrow">Transfer check {current} of {total}</p>
        <h1 id="transfer-title">Apply the idea to a new order</h1>
        <p>{task.prompt}</p>
        <div className="transfer-options">
          {task.options.map((option) => (
            <button
              aria-pressed={answer === option}
              className={`answer-button ${answer === option ? 'selected' : ''}`}
              key={option}
              onClick={() => setAnswer(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
        <button className="primary-action" disabled={!answer} onClick={() => onSubmit(answer)} type="button">
          <CheckCircle2 aria-hidden="true" size={22} />
          Submit transfer check
        </button>
      </section>
    </main>
  )
}
