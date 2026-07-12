import { useEffect, useRef, useState } from 'react'
import { stationDefinitions } from '../game/content/rounds'
import { FactoryRuntime } from '../render/FactoryRuntime'
import type { FactorySceneState, StationId } from '../types'

interface FactoryCanvasProps {
  sceneState: FactorySceneState
  onStationSelect: (stationId: StationId) => void
}

export function FactoryCanvas({ sceneState, onStationSelect }: FactoryCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<FactoryRuntime | null>(null)
  const [hasRuntimeError, setHasRuntimeError] = useState(false)

  useEffect(() => {
    if (!containerRef.current) {
      return undefined
    }

    try {
      const runtime = new FactoryRuntime({
        container: containerRef.current,
        onStationSelect,
      })
      runtimeRef.current = runtime
      setHasRuntimeError(false)
    } catch (error) {
      console.warn(error)
      setHasRuntimeError(true)
    }

    return () => {
      runtimeRef.current?.dispose()
      runtimeRef.current = null
    }
  }, [onStationSelect])

  useEffect(() => {
    runtimeRef.current?.setState(sceneState)
  }, [sceneState])

  return (
    <div ref={containerRef} className="factory-canvas-host" data-testid="factory-canvas">
      {hasRuntimeError && (
        <div className="factory-fallback" role="status">
          <strong>Factory view fallback</strong>
          <span>Use the station buttons to continue this round.</span>
          <div>
            {stationDefinitions.map((station) => (
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
