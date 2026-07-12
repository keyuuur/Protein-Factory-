import { ArrowRight, Dna } from 'lucide-react'
import { tutorialSteps } from '../game/content/rounds'

interface TutorialScreenProps {
  onContinue: () => void
}

export function TutorialScreen({ onContinue }: TutorialScreenProps) {
  return (
    <main className="focus-screen" data-testid="tutorial-screen">
      <section className="flow-panel">
        <div className="screen-kicker">
          <Dna aria-hidden="true" size={22} />
          Factory briefing
        </div>
        <h1>Follow the recipe from DNA to trait.</h1>
        <ol className="tutorial-list">
          {tutorialSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <button className="primary-action" onClick={onContinue} type="button">
          <ArrowRight aria-hidden="true" size={22} />
          Start Round 1
        </button>
      </section>
    </main>
  )
}
