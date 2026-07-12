import { rounds } from '../data/rounds'

interface ProgressRailProps {
  currentRoundIndex: number
  score: number
}

export function ProgressRail({ currentRoundIndex, score }: ProgressRailProps) {
  return (
    <aside className="progress-rail" aria-label="Game progress">
      <div className="score-chip">
        <span>Score</span>
        <strong>
          {score}/{rounds.length}
        </strong>
      </div>
      <ol className="round-dots">
        {rounds.map((round, index) => {
          const state =
            index < currentRoundIndex ? 'complete' : index === currentRoundIndex ? 'current' : 'locked'

          return (
            <li className={state} key={round.id}>
              <span>{index + 1}</span>
              <small>{round.shortTitle}</small>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}

