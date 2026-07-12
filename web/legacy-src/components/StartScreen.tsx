import { Anchor, Play } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { periodOptions } from '../data/rounds'

interface StartScreenProps {
  onStart: (firstName: string, period: string) => void
}

export function StartScreen({ onStart }: StartScreenProps) {
  const [firstName, setFirstName] = useState('')
  const [period, setPeriod] = useState<string>(periodOptions[0])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onStart(firstName.trim() || 'Demo Student', period)
  }

  return (
    <main className="start-screen" data-testid="start-screen">
      <section className="start-hero" aria-labelledby="game-title">
        <div className="brand-lockup">
          <img src="/pirate-lab.svg" alt="" className="brand-mark" />
          <div>
            <p className="eyebrow">9th grade biology review</p>
            <h1 id="game-title">Pirate Protein Factory</h1>
          </div>
        </div>
        <p className="start-copy">
          Build strands, translate codons, and match proteins to traits before
          the factory bell rings.
        </p>
        <div className="start-badges" aria-label="Game overview">
          <span>8 rounds</span>
          <span>DNA to traits</span>
          <span>iPad ready</span>
        </div>
      </section>

      <form className="captain-form" onSubmit={handleSubmit}>
        <div className="form-title">
          <Anchor aria-hidden="true" size={22} />
          <h2>Board the Factory</h2>
        </div>

        <label className="field-label" htmlFor="first-name">
          First name
        </label>
        <input
          id="first-name"
          autoComplete="given-name"
          maxLength={30}
          onChange={(event) => setFirstName(event.target.value)}
          placeholder="Type your first name"
          type="text"
          value={firstName}
        />

        <label className="field-label" htmlFor="period">
          Class period
        </label>
        <select
          id="period"
          onChange={(event) => setPeriod(event.target.value)}
          value={period}
        >
          {periodOptions.map((option) => (
            <option key={option} value={option}>
              Period {option}
            </option>
          ))}
        </select>

        <button className="primary-action" type="submit">
          <Play aria-hidden="true" size={22} />
          Start game
        </button>
        <p className="form-note">Scores stay local in this first Vercel build.</p>
      </form>
    </main>
  )
}
