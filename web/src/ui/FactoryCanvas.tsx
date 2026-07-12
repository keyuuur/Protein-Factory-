import { useEffect, useRef, useState } from 'react'
import { stationDefinitions } from '../game/content/rounds'
import type { FactoryRuntime } from '../render/FactoryRuntime'
import type { StationId } from '../types'
import type { FactorySceneSnapshot } from '../render/adapters/sceneState'

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
    void import('../render/FactoryRuntime').then(({ FactoryRuntime: Runtime }) => {
      if (cancelled) return
      try {
        const runtime = new Runtime({
          container,
          onContextLost: () => setHasRuntimeError(true),
          onContextRestored: () => setHasRuntimeError(false),
          onStationSelect,
        })
        runtime.setState(sceneStateRef.current)
        runtimeRef.current = runtime
        setHasRuntimeError(false)
      } catch (error) {
        console.warn(error)
        setHasRuntimeError(true)
      }
    }).catch((error) => {
      console.warn(error)
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
    <div ref={containerRef} className="factory-canvas-host" data-testid="factory-canvas">
      {hasRuntimeError && (
        <div className="factory-fallback" role="status">
          <strong>Cell lab view paused</strong>
          <span>Your work is safe. Use the active lab button to continue.</span>
          <div>
            {stationDefinitions.filter((station) => station.id === sceneState.activeStationId).map((station) => (
              <button key={station.id} onClick={() => onStationSelect(station.id)} type="button">
                {station.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
