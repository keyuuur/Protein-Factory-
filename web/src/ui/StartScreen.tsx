import { Dna, Play, Presentation } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { periodOptions } from '../game/content/rounds'
import type { ReplayMode, SupportMode, TeacherSettings } from '../types'

interface StartScreenProps {
  initialPeriod: string
  onStart: (firstName: string, period: string, demoMode: boolean, settings: TeacherSettings) => void
}

export function StartScreen({ initialPeriod, onStart }: StartScreenProps) {
  const [firstName, setFirstName] = useState('')
  const [period, setPeriod] = useState<string>(
    periodOptions.includes(initialPeriod as (typeof periodOptions)[number]) ? initialPeriod : '',
  )
  const [demoMode, setDemoMode] = useState(false)
  const [demoConfirm, setDemoConfirm] = useState('')
  const [supportMode, setSupportMode] = useState<SupportMode>('standard')
  const [replayMode, setReplayMode] = useState<ReplayMode>('full')
  const [soundEnabled, setSoundEnabled] = useState(false)
  const demoConfirmed = demoMode && demoConfirm.trim().toUpperCase() === 'DEMO'
  const canStart = Boolean(period) && (demoConfirmed || firstName.trim().length > 0)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canStart) {
      return
    }
    onStart(firstName.trim(), period, demoConfirmed, { replayMode, soundEnabled, supportMode })
  }

  return (
    <main className="start-screen" data-testid="start-screen">
      <section className="start-hero" aria-labelledby="game-title">
        <div className="brand-lockup">
          <Dna aria-hidden="true" className="brand-mark" size={64} />
          <div>
            <p className="eyebrow">9th grade biology review</p>
            <h1 id="game-title">Protein Factory</h1>
          </div>
        </div>
        <p className="start-copy">
          Work through a cell lab from DNA instructions to a tested protein function.
        </p>
      </section>

      <form className="captain-form" onSubmit={handleSubmit}>
        <div className="form-title">
          <Dna aria-hidden="true" size={22} />
          <h2>Enter the Cell Lab</h2>
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

        <details className="demo-disclosure teacher-settings">
          <summary>Teacher settings</summary>
          <label className="field-label" htmlFor="support-mode">Support</label>
          <select id="support-mode" onChange={(event) => setSupportMode(event.target.value as SupportMode)} value={supportMode}>
            <option value="standard">Standard</option>
            <option value="guided">Guided</option>
          </select>
          <label className="field-label" htmlFor="replay-mode">Replay</label>
          <select id="replay-mode" onChange={(event) => setReplayMode(event.target.value as ReplayMode)} value={replayMode}>
            <option value="full">Full new production run</option>
            <option value="targeted">Targeted transfer practice</option>
          </select>
          <label className="demo-toggle" htmlFor="sound-enabled">
            <input checked={soundEnabled} id="sound-enabled" onChange={(event) => setSoundEnabled(event.target.checked)} type="checkbox" />
            <span>Enable sound cues</span>
          </label>
        </details>

        <button className="primary-action" disabled={!canStart} type="submit">
          <Play aria-hidden="true" size={22} />
          Start game
        </button>
        <p className="form-note">Progress is saved on this device. Final results submit when a connection is available.</p>
      </form>
    </main>
  )
}
