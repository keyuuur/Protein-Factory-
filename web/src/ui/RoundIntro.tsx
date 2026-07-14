import { ArrowRight, Dna } from 'lucide-react'
import type { GameRound } from '../types'

interface RoundIntroProps {
  round: GameRound
  roundNumber: number
  totalRounds: number
  onBegin: () => void
}

const sequenceNames = ['Original protein', 'Change A', 'Change B'] as const

export function RoundIntro({ round, roundNumber, totalRounds, onBegin }: RoundIntroProps) {
  const sequenceNumber = round.context.sequenceIndex + 1
  const effect = round.context.sequenceEffect === 'original'
    ? 'Build the reference product.'
    : round.context.sequenceEffect === 'same-chain'
      ? 'One DNA base changed. Find out whether the protein changes.'
      : 'One DNA base changed. Trace its effect through the protein.'

  return (
    <main className="focus-screen sequence-transition" data-testid="round-intro">
      <section className="transition-strip" aria-labelledby="transition-title">
        <span className="transition-icon"><Dna aria-hidden="true" size={34} /></span>
        <div>
          <p className="eyebrow">Protein {sequenceNumber} of 3 | Stage {roundNumber} of {totalRounds}</p>
          <h1 id="transition-title">{sequenceNames[round.context.sequenceIndex]}</h1>
          <p>{effect}</p>
        </div>
        <button className="primary-action" onClick={onBegin} type="button">
          Continue <ArrowRight aria-hidden="true" size={21} />
        </button>
      </section>
    </main>
  )
}
