import { Home, RotateCcw, Trophy } from 'lucide-react'
import { useState } from 'react'
import { buildTeacherSummary, formatMissedSkill } from '../results/gameResults'
import type { LocalSaveResult } from '../results/localResultSaver'
import type { FinalGamePayload } from '../types'

interface EndScreenProps {
  payload: FinalGamePayload
  saveResult: LocalSaveResult | null
  onReplay: () => void
  onRestart: () => void
}

export function EndScreen({ payload, saveResult, onReplay, onRestart }: EndScreenProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')

  async function handleCopySummary() {
    const summary = buildTeacherSummary(payload)
    try {
      await navigator.clipboard.writeText(summary)
      setCopyStatus('Summary copied.')
    } catch {
      setCopyStatus('Copy failed. Open details and copy the text manually.')
    }
  }

  return (
    <main className="end-screen" data-testid="end-screen">
      <section className="score-panel">
        <Trophy aria-hidden="true" className="trophy-mark" size={72} />
        <p className="eyebrow">Factory run {payload.completionStatus}</p>
        <h1>
          {payload.score}/{payload.maxScore} stations completed
        </h1>
        <p className="run-rating">{payload.factoryRating}</p>
        {payload.activeReplayChallenge && (
          <p className={`challenge-result ${payload.replayChallengeMet ? 'met' : 'missed'}`}>
            {payload.replayChallengeMet ? 'Replay challenge met' : 'Replay challenge still open'}
          </p>
        )}
        <div className="score-meter" aria-label={`Final score ${payload.percent}%`}>
          <span style={{ width: `${payload.percent}%` }} />
        </div>
        <dl className="score-grid">
          <div>
            <dt>Student</dt>
            <dd>{showDetails ? payload.studentName : 'Hidden'}</dd>
          </div>
          <div>
            <dt>Period</dt>
            <dd>{showDetails ? payload.classPeriod : 'Hidden'}</dd>
          </div>
          <div>
            <dt>Completion</dt>
            <dd>{payload.percent}%</dd>
          </div>
          <div>
            <dt>Clean clears</dt>
            <dd>{payload.cleanRounds}</dd>
          </div>
          <div>
            <dt>With support</dt>
            <dd>{payload.supportedRounds}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{payload.timeSpent}s</dd>
          </div>
          <div>
            <dt>Attempts</dt>
            <dd>{payload.attempts}</dd>
          </div>
          <div>
            <dt>Corrections</dt>
            <dd>{payload.mistakes}</dd>
          </div>
        </dl>
      </section>

      <section className="review-panel">
        <h2>Replay goal</h2>
        <p className="replay-goal">{payload.replayGoal}</p>
        {payload.reviewSummary.length > 0 && (
          <div className="teacher-glance">
            <strong>Teacher glance</strong>
            <ul>
              {payload.reviewSummary.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        <p>
          Public-safe view is on. Student details and mistake notes are hidden until details are opened.
        </p>
        <p className={saveResult?.ok === false ? 'save-status failed' : 'save-status'}>
          {saveResult?.ok === false ? `Local save failed: ${saveResult.error}` : 'Saved as local practice on this device.'}
        </p>
        <button className="secondary-action compact details-toggle" onClick={() => setShowDetails((current) => !current)} type="button">
          {showDetails ? 'Hide details' : 'Show details'}
        </button>
        <button className="secondary-action compact details-toggle" onClick={handleCopySummary} type="button">
          Copy teacher summary
        </button>
        {copyStatus && <p className="copy-status">{copyStatus}</p>}
        {showDetails && payload.missedSkills.length > 0 ? (
          <ul className="missed-list">
            {payload.missedSkills.map((item) => (
              <li key={`${item.skillId}-${item.submitted}`}>{formatMissedSkill(item)}</li>
            ))}
          </ul>
        ) : showDetails ? (
          <p>All review targets cleared without corrections or hints.</p>
        ) : null}
        {showDetails && (
          <dl className="details-grid">
            <div>
              <dt>Mode</dt>
              <dd>{payload.isDemo ? 'Demo / projector' : 'Student run'}</dd>
            </div>
            <div>
              <dt>Saved</dt>
              <dd>On this device only</dd>
            </div>
          </dl>
        )}
        <div className="end-actions">
          <button className="primary-action" onClick={onReplay} type="button">
            <RotateCcw aria-hidden="true" size={22} />
            Same student retry
          </button>
          <button className="secondary-action" onClick={onRestart} type="button">
            <Home aria-hidden="true" size={22} />
            Next student
          </button>
        </div>
      </section>
    </main>
  )
}
