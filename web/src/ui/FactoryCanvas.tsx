import { useEffect, useRef, useState } from 'react'
import type { FactoryRuntime } from '../render/FactoryRuntime'
import type { FactorySceneSnapshot } from '../render/adapters/sceneState'
import type { StationId } from '../types'

interface FactoryCanvasProps {
  sceneState: FactorySceneSnapshot
  onStationSelect: (stationId: StationId) => void
}

export function FactoryCanvas({ sceneState, onStationSelect }: FactoryCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<FactoryRuntime | null>(null)
  const sceneStateRef = useRef(sceneState)
  const [hasRuntimeError, setHasRuntimeError] = useState(false)

  useEffect(() => {
    if (!containerRef.current) {
      return undefined
    }

    let cancelled = false
    const container = containerRef.current
    setHasRuntimeError(false)
    void import('../render/FactoryRuntime').then(({ FactoryRuntime: Runtime }) => {
      if (cancelled) return
      try {
        const runtime = new Runtime({
          container,
          onContextLost: () => setHasRuntimeError(true),
          onContextRestored: () => setHasRuntimeError(false),
        })
        runtime.setState(sceneStateRef.current)
        runtimeRef.current = runtime
        setHasRuntimeError(false)
      } catch {
        setHasRuntimeError(true)
      }
    }).catch(() => {
      setHasRuntimeError(true)
    })

    return () => {
      cancelled = true
      runtimeRef.current?.dispose()
      runtimeRef.current = null
    }
  }, [onStationSelect])

  useEffect(() => {
    sceneStateRef.current = sceneState
    runtimeRef.current?.setState(sceneState)
  }, [sceneState])

  return (
    <div
      aria-label={`${sceneState.cargoLabel}. ${sceneState.activeStationLabel}`}
      aria-live="polite"
      className="factory-canvas-host"
      data-action={sceneState.activeAction}
      data-sequence-index={sceneState.sequenceIndex}
      data-testid="factory-canvas"
      ref={containerRef}
    >
      {hasRuntimeError && (
        <div className="factory-fallback" role="status">
          <strong>Cell lab view paused</strong>
          <span>Your work is safe. Use the active lab button to continue.</span>
          <div>
            <button onClick={() => onStationSelect(sceneState.activeStationId)} type="button">
              Continue {sceneState.activeStationLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
