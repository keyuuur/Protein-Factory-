import { Home, RotateCcw, Trophy } from 'lucide-react'
import { rounds } from '../data/rounds'
import { formatMissedRound, getCompletionPercent } from '../game/gameLogic'
import type { RoundResult } from '../types'

interface EndScreenProps {
  elapsedSeconds: number
  firstName: string
  onReplay: () => void
  onRestart: () => void
  period: string
  results: RoundResult[]
  score: number
}

export function EndScreen({
  elapsedSeconds,
  firstName,
  onReplay,
  onRestart,
  period,
  results,
  score,
}: EndScreenProps) {
  const missed = rounds
    .map((round, index) => {
      const result = results.find((item) => item.round === index + 1)
      return !result || !result.correct ? formatMissedRound(round, result) : ''
    })
    .filter(Boolean)
  const percent = getCompletionPercent(score, rounds.length)

  return (
    <main className="end-screen" data-testid="end-screen">
      <section className="score-panel">
        <Trophy aria-hidden="true" className="trophy-mark" size={72} />
        <p className="eyebrow">Factory run complete</p>
        <h1>
          {score}/{rounds.length} cleared
        </h1>
        <div className="score-meter" aria-label={`Final score ${percent}%`}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <dl className="score-grid">
          <div>
            <dt>Student</dt>
            <dd>{firstName}</dd>
          </div>
          <div>
            <dt>Period</dt>
            <dd>{period}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>{percent}%</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{elapsedSeconds}s</dd>
          </div>
        </dl>
      </section>

      <section className="review-panel">
        <h2>Review log</h2>
        {missed.length > 0 ? (
          <ul className="missed-list">
            {missed.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>All review targets cleared on this run.</p>
        )}
        <div className="end-actions">
          <button className="primary-action" onClick={onReplay} type="button">
            <RotateCcw aria-hidden="true" size={22} />
            Replay
          </button>
          <button className="secondary-action" onClick={onRestart} type="button">
            <Home aria-hidden="true" size={22} />
            New student
          </button>
        </div>
      </section>
    </main>
  )
}

