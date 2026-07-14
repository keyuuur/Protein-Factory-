import { Dna, Play, Presentation, Upload, Volume2, VolumeX } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { periodOptions } from '../game/content/rounds'
import type { ReplayMode, SupportMode, TeacherSettings } from '../types'

interface StartScreenProps {
  initialPeriod: string
  onRestoreRecovery: (file: File) => Promise<void>
  onStart: (firstName: string, period: string, demoMode: boolean, settings: TeacherSettings) => void
}

export function StartScreen({ initialPeriod, onRestoreRecovery, onStart }: StartScreenProps) {
  const [firstName, setFirstName] = useState('')
  const [period, setPeriod] = useState<string>(
    periodOptions.includes(initialPeriod as (typeof periodOptions)[number]) ? initialPeriod : '',
  )
  const [demoMode, setDemoMode] = useState(false)
  const [demoConfirm, setDemoConfirm] = useState('')
  const [supportMode, setSupportMode] = useState<SupportMode>('standard')
  const [replayMode, setReplayMode] = useState<ReplayMode>('full')
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [restoreStatus, setRestoreStatus] = useState('')
  const demoConfirmed = demoMode && demoConfirm.trim().toUpperCase() === 'DEMO'
  const canStart = Boolean(period) && (demoConfirmed || firstName.trim().length > 0)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canStart) onStart(firstName.trim(), period, demoConfirmed, { replayMode, soundEnabled, supportMode })
  }

  return (
    <main className="start-screen" data-testid="start-screen">
      <section className="start-shell">
        <header className="start-hero" aria-labelledby="game-title">
          <div className="brand-lockup">
            <span className="brand-mark"><Dna aria-hidden="true" size={38} /></span>
            <div>
              <p className="eyebrow">Student cell lab</p>
              <h1 id="game-title">Protein Factory</h1>
            </div>
          </div>
          <p className="start-copy">Build and compare three proteins.</p>
          <div className="start-process" aria-label="Game process">
            <span>DNA</span><i aria-hidden="true" /><span>mRNA</span><i aria-hidden="true" />
            <span>Amino acids</span><i aria-hidden="true" /><span>Function</span>
          </div>
        </header>

        <form className="captain-form" onSubmit={handleSubmit}>
          <div className="form-title">
            <Dna aria-hidden="true" size={22} />
            <h2>Start your run</h2>
          </div>

          <div className="student-fields">
            <label className="field-label" htmlFor="first-name">First name or initials
              <input
                id="first-name"
                autoComplete="off"
                disabled={demoMode}
                maxLength={30}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder={demoMode ? 'Demo mode selected' : 'Enter name'}
                type="text"
                value={firstName}
              />
            </label>

            <label className="field-label" htmlFor="period">Class period
              <select id="period" onChange={(event) => setPeriod(event.target.value)} value={period}>
                <option value="">Select period</option>
                {periodOptions.map((option) => <option key={option} value={option}>Period {option}</option>)}
              </select>
            </label>
          </div>

          <div className="start-actions">
            <button className="primary-action begin-action" disabled={!canStart} type="submit">
              <Play aria-hidden="true" size={22} /> Begin
            </button>
            <p className="form-note">Your run is saved on this device.</p>
          </div>

          <details className="teacher-settings">
            <summary><Presentation aria-hidden="true" size={19} /> Teacher controls</summary>
            <label className="toggle-row" htmlFor="demo-mode">
              <input checked={demoMode} id="demo-mode" onChange={(event) => setDemoMode(event.target.checked)} type="checkbox" />
              <span>Projector demo</span>
            </label>
            {demoMode && (
              <>
                <label className="field-label" htmlFor="demo-confirm">Type DEMO to confirm</label>
                <input id="demo-confirm" autoComplete="off" maxLength={8} onChange={(event) => setDemoConfirm(event.target.value)} value={demoConfirm} />
              </>
            )}
            <div className="teacher-setting-grid">
              <label>Support
                <select onChange={(event) => setSupportMode(event.target.value as SupportMode)} value={supportMode}>
                  <option value="standard">Standard</option><option value="guided">Guided</option>
                </select>
              </label>
              <label>Replay
                <select onChange={(event) => setReplayMode(event.target.value as ReplayMode)} value={replayMode}>
                  <option value="full">Full new run</option><option value="targeted">Targeted practice</option>
                </select>
              </label>
            </div>
            <button aria-pressed={soundEnabled} className="sound-setting" onClick={() => setSoundEnabled((value) => !value)} type="button">
              {soundEnabled ? <Volume2 aria-hidden="true" size={20} /> : <VolumeX aria-hidden="true" size={20} />}
              Sound {soundEnabled ? 'on' : 'off'}
            </button>
            <div className="recovery-tools">
              <p>Use only when restoring an exported result.</p>
              <label className="secondary-action recovery-import">
                <Upload aria-hidden="true" size={20} /> Restore result
                <input
                  accept="application/json,.json"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0]
                    if (!file) return
                    setRestoreStatus('Checking recovery file...')
                    void onRestoreRecovery(file)
                      .then(() => setRestoreStatus('Recovery file restored.'))
                      .catch((error) => setRestoreStatus(error instanceof Error ? error.message : 'Recovery file could not be restored.'))
                  }}
                  type="file"
                />
              </label>
              {restoreStatus && <p className="recovery-status" role="status">{restoreStatus}</p>}
            </div>
          </details>
        </form>
      </section>
    </main>
  )
}
