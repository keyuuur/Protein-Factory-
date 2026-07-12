import { Anchor, Play, Presentation } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { periodOptions } from '../game/content/rounds'

interface StartScreenProps {
  initialPeriod: string
  onStart: (firstName: string, period: string, demoMode: boolean) => void
}

export function StartScreen({ initialPeriod, onStart }: StartScreenProps) {
  const [firstName, setFirstName] = useState('')
  const [period, setPeriod] = useState<string>(
    periodOptions.includes(initialPeriod as (typeof periodOptions)[number]) ? initialPeriod : '',
  )
  const [demoMode, setDemoMode] = useState(false)
  const [demoConfirm, setDemoConfirm] = useState('')
  const demoConfirmed = demoMode && demoConfirm.trim().toUpperCase() === 'DEMO'
  const canStart = Boolean(period) && (demoConfirmed || firstName.trim().length > 0)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canStart) {
      return
    }
    onStart(firstName.trim(), period, demoConfirmed)
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
          Run the DNA dock, mRNA press, ribosome galley, and trait vault to ship a protein.
        </p>
        <div className="start-badges" aria-label="Game overview">
          <span>8 rounds</span>
          <span>3D factory</span>
          <span>Tap friendly</span>
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
          autoComplete="off"
          disabled={demoMode}
          maxLength={30}
          onChange={(event) => setFirstName(event.target.value)}
          placeholder={demoMode ? 'Demo mode selected' : 'Type your first name or initials'}
          type="text"
          value={firstName}
        />

        <details className="demo-disclosure">
          <summary>
            <Presentation aria-hidden="true" size={20} />
            Teacher demo / projector mode
          </summary>
          <label className="demo-toggle" htmlFor="demo-mode">
            <input
              checked={demoMode}
              id="demo-mode"
              onChange={(event) => setDemoMode(event.target.checked)}
              type="checkbox"
            />
            <span>Enable demo mode</span>
          </label>
          <label className="field-label" htmlFor="demo-confirm">
            Type DEMO to confirm
          </label>
          <input
            id="demo-confirm"
            autoComplete="off"
            disabled={!demoMode}
            maxLength={8}
            onChange={(event) => setDemoConfirm(event.target.value)}
            placeholder="DEMO"
            type="text"
            value={demoConfirm}
          />
        </details>

        <label className="field-label" htmlFor="period">
          Class period
        </label>
        <select id="period" onChange={(event) => setPeriod(event.target.value)} value={period}>
          <option value="">Select period</option>
          {periodOptions.map((option) => (
            <option key={option} value={option}>
              Period {option}
            </option>
          ))}
        </select>

        <button className="primary-action" disabled={!canStart} type="submit">
          <Play aria-hidden="true" size={22} />
          Start game
        </button>
        <p className="form-note">Practice results stay on this device only. They are not submitted to your teacher yet.</p>
      </form>
    </main>
  )
}
