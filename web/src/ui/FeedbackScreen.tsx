import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type { Feedback, GameRound } from '../types'

interface FeedbackScreenProps {
  feedback: Feedback
  isLastRound: boolean
  onContinue: () => void
  round: GameRound
}

export function FeedbackScreen({ feedback, isLastRound, onContinue, round }: FeedbackScreenProps) {
  return (
    <main className="focus-screen" data-testid="feedback-screen">
      <section className="result-panel shipment-panel">
        <CheckCircle2 aria-hidden="true" className="result-icon" size={64} />
        <p className="eyebrow">{round.shortTitle} cleared</p>
        <h1>{feedback.title}</h1>
        <p>{feedback.message}</p>
        {feedback.detail && <div className="answer-reveal">{feedback.detail}</div>}
        <button className="primary-action" onClick={onContinue} type="button">
          <ArrowRight aria-hidden="true" size={22} />
          {isLastRound ? 'See final score' : 'Next round'}
        </button>
      </section>
    </main>
  )
}
