import { ArrowRight, FlaskConical } from 'lucide-react'
import type { GameRound } from '../types'

interface RoundIntroProps {
  round: GameRound
  roundNumber: number
  totalRounds: number
  onBegin: () => void
}

export function RoundIntro({ round, roundNumber, totalRounds, onBegin }: RoundIntroProps) {
  return (
    <main className="focus-screen" data-testid="round-intro">
      <section className="round-intro">
        <div className="round-token">
          Round {roundNumber} of {totalRounds}
        </div>
        <div className="screen-kicker">
          <FlaskConical aria-hidden="true" size={22} />
          {round.shortTitle}
        </div>
        <h1>{round.title}</h1>
        <p>{round.prompt}</p>
        <button className="primary-action" onClick={onBegin} type="button">
          <ArrowRight aria-hidden="true" size={22} />
          Begin challenge
        </button>
      </section>
    </main>
  )
}

