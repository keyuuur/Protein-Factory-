import { CircleAlert, CircleCheck, Clipboard, Home, RotateCcw, Trophy } from 'lucide-react'
import { useState } from 'react'
import { buildTeacherSummary, formatMissedSkill } from '../results/gameResults'
import type { LocalSaveResult } from '../results/localResultSaver'
import type { SubmissionStatus } from '../results/submissionQueue'
import type { FinalGamePayload } from '../types'

interface EndScreenProps {
  navigationBlocked: boolean
  payload: FinalGamePayload
  saveResult: LocalSaveResult | null
  onReplay: () => void
  onRestart: () => void
  submissionStatus: SubmissionStatus
}

export function EndScreen({ navigationBlocked, payload, saveResult, onReplay, onRestart, submissionStatus }: EndScreenProps) {
  const [copyStatus, setCopyStatus] = useState('')

  async function handleCopySummary() {
    try {
      await navigator.clipboard.writeText(buildTeacherSummary(payload))
      setCopyStatus('Summary copied.')
    } catch {
      setCopyStatus('Copy failed. Open details to view the summary.')
    }
  }

  if (payload.attemptKind === 'targeted-practice') {
    const result = payload.transferResults[0]
    const recovered = result?.outcome === 'recovered'
    return (
      <main className="end-screen targeted-practice-end" data-testid="targeted-practice-end-screen">
        <section className="end-summary" aria-labelledby="targeted-end-title">
          <span className="trophy-mark">
            {recovered ? <CircleCheck aria-hidden="true" size={44} /> : <CircleAlert aria-hidden="true" size={44} />}
          </span>
          <p className="eyebrow">Targeted practice complete</p>
          <h1 id="targeted-end-title">{recovered ? 'Recovered' : 'Not yet recovered'}</h1>
          <p><strong>New skill:</strong> {result?.skillLabel ?? 'Targeted skill unavailable'}</p>
          <dl className="score-grid">
            <div><dt>New evidence</dt><dd>{result?.evidence ?? 'No evidence recorded'}</dd></div>
            <div><dt>Practice result</dt><dd>{recovered ? 'Recovered' : 'Not yet recovered'}</dd></div>
            <div><dt>Attempts</dt><dd>{result?.attempts ?? 0} of 2</dd></div>
            <div><dt>Time</dt><dd>{formatTime(payload.timeSpent)}</dd></div>
          </dl>
          {!recovered && <p className="challenge-result" role="status">Teacher follow-up is recommended for this skill.</p>}
        </section>

        <section className="end-products" aria-labelledby="baseline-title">
          <div className="end-section-title">
            <div>
              <p className="eyebrow">Baseline evidence only</p>
              <h2 id="baseline-title">Original 9-stage factory run was not repeated</h2>
            </div>
            <span className={submissionClass(submissionStatus, saveResult)}>{submissionLabel(submissionStatus, saveResult)}</span>
          </div>
          <p><strong>Original attempt:</strong> {payload.parentAttemptId ?? 'Unavailable'}</p>
          <dl className="score-grid">
            <div><dt>Baseline completed</dt><dd>{payload.score} of 9</dd></div>
            <div><dt>Baseline independent</dt><dd>{payload.independentStages} of 9</dd></div>
            <div><dt>Baseline repairs</dt><dd>{payload.repairs}</dd></div>
            <div><dt>Baseline products</dt><dd>{payload.completedProducts.length} of 3</dd></div>
          </dl>
          <p className="model-disclaimer">The manifest, stage responses, and protein products above are preserved from the original run as baseline evidence. They are not new targeted-practice results.</p>
        </section>

        <section className="end-actions-panel">
          <div>
            <p className="eyebrow">Next step</p>
            <h2>{recovered ? 'Continue with a new challenge when ready.' : 'Review this skill with the teacher before another check.'}</h2>
          </div>
          <div className="end-actions">
            <button className="primary-action" disabled={navigationBlocked} onClick={onReplay} type="button"><RotateCcw aria-hidden="true" size={21} /> Replay</button>
            <button className="secondary-action" disabled={navigationBlocked} onClick={onRestart} type="button"><Home aria-hidden="true" size={21} /> New student</button>
          </div>
          {navigationBlocked && <p role="alert">Export this result or choose Leave without saving before starting another run.</p>}
        </section>

        <details className="teacher-results">
          <summary>Teacher targeted-practice summary</summary>
          <div className="teacher-result-tools">
            <p><strong>Student:</strong> {payload.studentName} &nbsp; <strong>Period:</strong> {payload.classPeriod}</p>
            <button className="secondary-action compact" onClick={handleCopySummary} type="button"><Clipboard aria-hidden="true" size={18} /> Copy summary</button>
          </div>
          {copyStatus && <p role="status">{copyStatus}</p>}
          <p><strong>New skill:</strong> {result?.skillLabel ?? 'Unavailable'}</p>
          <p><strong>New evidence:</strong> {result?.evidence ?? 'Unavailable'}</p>
          <p><strong>Explicit result:</strong> {recovered ? 'Recovered' : 'Not yet recovered; teacher follow-up needed'}</p>
          <p><strong>Baseline:</strong> Original 9-stage metrics and products were preserved, not repeated.</p>
        </details>
      </main>
    )
  }

  return (
    <main className="end-screen" data-testid="end-screen">
      <section className="end-summary" aria-labelledby="end-title">
        <span className="trophy-mark"><Trophy aria-hidden="true" size={44} /></span>
        <p className="eyebrow">Factory run complete</p>
        <h1 id="end-title">{payload.factoryRating} Production</h1>
        <p className="end-completion"><strong>{payload.score}</strong> of 9 actions completed ({payload.completionPercent}%)</p>
        <p className="end-score"><strong>{payload.independentStages}</strong> of 9 completed actions were independent</p>
        <div
          aria-label={`${payload.independencePercent}% independent`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={payload.independencePercent}
          className="score-meter"
          role="progressbar"
        >
          <span style={{ width: `${payload.independencePercent}%` }} />
        </div>
        <dl className="score-grid">
          <div><dt>Clean actions</dt><dd>{payload.cleanRounds}</dd></div>
          <div><dt>With support</dt><dd>{payload.supportedRounds}</dd></div>
          <div><dt>Repairs</dt><dd>{payload.repairs}</dd></div>
          <div><dt>Time</dt><dd>{formatTime(payload.timeSpent)}</dd></div>
        </dl>
      </section>

      <section className="end-products" aria-labelledby="products-title">
        <div className="end-section-title">
          <div><p className="eyebrow">Comparison tray</p><h2 id="products-title">Your three protein products</h2></div>
          <span className={submissionClass(submissionStatus, saveResult)}>{submissionLabel(submissionStatus, saveResult)}</span>
        </div>
        <div className="product-results">
          {payload.completedProducts.map((product, index) => (
            <article key={product.sequenceId}>
              <header><span>Protein {index + 1}</span><strong>{product.label}</strong></header>
              <dl>
                <div><dt>DNA</dt><dd>{groupCodons(product.dnaStrand)}</dd></div>
                <div><dt>mRNA</dt><dd>{groupCodons(product.mrna)}</dd></div>
                <div><dt>Chain</dt><dd>{product.aminoAcidChain.join(' - ')}</dd></div>
                <div><dt>Function</dt><dd>{product.proteinFunction}</dd></div>
              </dl>
              <p className="product-trait"><i className={`trait-swatch ${product.traitColor}`} aria-hidden="true" />{product.expressedTrait}</p>
            </article>
          ))}
        </div>
        <p className="model-disclaimer">These outcomes belong to the fictional fur-color practice model. Real amino-acid changes may or may not alter protein function, and real fur color involves multiple genes and regulatory pathways.</p>
      </section>

      <section className="end-actions-panel">
        <div>
          <p className="eyebrow">Replay goal</p>
          <h2>{payload.replayGoal}</h2>
          {payload.activeReplayChallenge && <p className={payload.replayChallengeMet ? 'challenge-result met' : 'challenge-result'}>{payload.replayChallengeMet ? 'Replay challenge met' : 'Replay challenge still open'}</p>}
        </div>
        <div className="end-actions">
          <button className="primary-action" disabled={navigationBlocked} onClick={onReplay} type="button"><RotateCcw aria-hidden="true" size={21} /> Replay</button>
          <button className="secondary-action" disabled={navigationBlocked} onClick={onRestart} type="button"><Home aria-hidden="true" size={21} /> New student</button>
        </div>
        {navigationBlocked && <p role="alert">Export this result or choose Leave without saving before starting another run.</p>}
      </section>

      <details className="teacher-results">
        <summary>Teacher details</summary>
        <div className="teacher-result-tools">
          <p><strong>Student:</strong> {payload.studentName} &nbsp; <strong>Period:</strong> {payload.classPeriod}</p>
          <button className="secondary-action compact" onClick={handleCopySummary} type="button"><Clipboard aria-hidden="true" size={18} /> Copy summary</button>
        </div>
        {copyStatus && <p role="status">{copyStatus}</p>}
        {payload.missedSkills.length > 0 ? <ul className="missed-list">{payload.missedSkills.map((item) => <li key={`${item.skillId}-${item.round}`}>{formatMissedSkill(item)}</li>)}</ul> : <p>All review targets cleared without corrections or hints.</p>}
      </details>
    </main>
  )
}

function groupCodons(sequence: string): string {
  return sequence.match(/.{1,3}/g)?.join(' ') ?? sequence
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function submissionClass(status: SubmissionStatus, saveResult: LocalSaveResult | null): string {
  return status === 'failed-terminal' || (saveResult?.ok === false && status !== 'submitted') ? 'save-status failed' : 'save-status'
}

function submissionLabel(status: SubmissionStatus, saveResult: LocalSaveResult | null): string {
  if (status === 'submitted') return 'Submitted'
  if (status === 'failed-terminal') return 'Not submitted; teacher action needed'
  if (saveResult?.ok === false) return 'Device copy unavailable'
  if (status === 'saving') return 'Submitting...'
  if (status === 'waiting-for-connection') return 'Saved on device; waiting for connection'
  if (status === 'retry-scheduled' || status === 'failed') return 'Saved on device; retry pending'
  return 'Saved on this device'
}
