import { ArrowRight, FlaskConical } from 'lucide-react'
import { stationForRoundType } from '../game/content/rounds'
import type { GameRound } from '../types'

interface RoundIntroProps {
  round: GameRound
  roundNumber: number
  totalRounds: number
  onBegin: () => void
}

export function RoundIntro({ round, roundNumber, totalRounds, onBegin }: RoundIntroProps) {
  const station = stationForRoundType(round.type)

  return (
    <main className="focus-screen" data-testid="round-intro">
      <section className="round-intro">
        <div className="round-token">
          Round {roundNumber} of {totalRounds}
        </div>
        <div className="screen-kicker">
          <FlaskConical aria-hidden="true" size={22} />
          {station.title}
        </div>
        <h1>{round.title}</h1>
        <p>{round.prompt}</p>
        <button className="primary-action" onClick={onBegin} type="button">
          <ArrowRight aria-hidden="true" size={22} />
          Enter cell lab
        </button>
      </section>
    </main>
  )
}
