import { Maximize2, Minimize2, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { CODON_ENTRIES, CODON_TABLE, RNA_BASES } from '../game/content/codonTable'

interface CodonWheelProps {
  activeCodonIndex: number
  codons: string[]
  isOpen: boolean
  onClose: () => void
  returnFocusRef: RefObject<HTMLButtonElement | null>
}

const SIZE = 560
const CENTER = SIZE / 2
const AMINO_COLORS = [
  '#d9efe8', '#f7dba7', '#dce7f7', '#f3c8bd', '#e7dcf3', '#cfe9f2', '#f4e8a9',
  '#cde5c8', '#f0d0e1', '#d8dfbf', '#f4c7c3', '#cbd8eb', '#e9d2ba', '#cde0dd',
  '#efd7a3', '#d6ceed', '#d7e9b9', '#f0c8d5', '#c8e4ef', '#ebdfc7', '#d8d8d8',
] as const
const aminoAcids = [...new Set(Object.values(CODON_TABLE))]
const aminoColor = new Map(aminoAcids.map((aminoAcid, index) => [aminoAcid, AMINO_COLORS[index % AMINO_COLORS.length]]))

const MOBILE_QUERY = '(max-width: 900px)'

export function CodonWheel({ activeCodonIndex, codons, isOpen, onClose, returnFocusRef }: CodonWheelProps) {
  const activeCodon = codons[activeCodonIndex] ?? ''
  const activeSignal = CODON_TABLE[activeCodon]
  const isCompact = useMediaQuery(MOBILE_QUERY)
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const fallbackRef = useRef<HTMLDivElement | null>(null)
  const previousCompactRef = useRef(isCompact)
  const onCloseRef = useRef(onClose)
  const [nativeDialogAvailable, setNativeDialogAvailable] = useState(() => supportsNativeDialog())
  onCloseRef.current = onClose

  useEffect(() => {
    const wasCompact = previousCompactRef.current
    previousCompactRef.current = isCompact
    if (!wasCompact || isCompact || !isOpen) return

    onCloseRef.current()
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('.wheel-panel.inline .wheel-size-button')?.focus()
    })
  }, [isCompact, isOpen])

  useEffect(() => {
    if (!isCompact || !isOpen) return undefined

    const scrollY = window.scrollY
    const body = document.body
    const root = document.documentElement
    const nativeDialog = dialogRef.current
    const fallbackDialog = fallbackRef.current
    const returnFocusTarget = returnFocusRef.current
    const previousStyles = {
      minHeight: body.style.minHeight,
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    }
    const previousRootOverflow = root.style.overflow
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    root.style.overflow = 'hidden'

    const restoreBackground = !nativeDialogAvailable && fallbackDialog
      ? isolateBackground(fallbackDialog)
      : () => undefined

    if (nativeDialogAvailable) {
      try {
        if (!nativeDialog?.open) nativeDialog?.showModal()
      } catch {
        setNativeDialogAvailable(false)
      }
    }

    const focusFrame = window.requestAnimationFrame(() => {
      const dialogRoot = nativeDialogAvailable ? nativeDialog : fallbackDialog
      dialogRoot?.querySelector<HTMLButtonElement>('[data-wheel-close]')?.focus()
      const viewport = dialogRoot?.querySelector<HTMLElement>('[data-testid="codon-wheel-viewport"]')
      if (viewport) centerWheelViewport(viewport)
    })

    const dialogRoot = nativeDialogAvailable ? nativeDialog : fallbackDialog
    const viewport = dialogRoot?.querySelector<HTMLElement>('[data-testid="codon-wheel-viewport"]') ?? null
    let viewportSize = viewport ? { height: viewport.clientHeight, width: viewport.clientWidth } : null
    const preserveWheelCenter = () => {
      if (!viewport || !viewportSize) return
      const nextSize = { height: viewport.clientHeight, width: viewport.clientWidth }
      viewport.scrollLeft = clampScroll(
        viewport.scrollLeft + (viewportSize.width - nextSize.width) / 2,
        viewport.scrollWidth - nextSize.width,
      )
      viewport.scrollTop = clampScroll(
        viewport.scrollTop + (viewportSize.height - nextSize.height) / 2,
        viewport.scrollHeight - nextSize.height,
      )
      viewportSize = nextSize
    }
    const keepFallbackFocusInside = (event: FocusEvent) => {
      if (nativeDialogAvailable || !fallbackDialog || fallbackDialog.contains(event.target as Node)) return
      getFocusableElements(fallbackDialog)[0]?.focus()
    }

    window.addEventListener('resize', preserveWheelCenter)
    window.addEventListener('orientationchange', preserveWheelCenter)
    window.visualViewport?.addEventListener('resize', preserveWheelCenter)
    document.addEventListener('focusin', keepFallbackFocusInside)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('resize', preserveWheelCenter)
      window.removeEventListener('orientationchange', preserveWheelCenter)
      window.visualViewport?.removeEventListener('resize', preserveWheelCenter)
      document.removeEventListener('focusin', keepFallbackFocusInside)
      if (nativeDialog?.open) nativeDialog.close()
      body.style.overflow = previousStyles.overflow
      root.style.overflow = previousRootOverflow
      body.style.position = previousStyles.position
      body.style.top = previousStyles.top
      body.style.width = previousStyles.width
      body.style.minHeight = previousStyles.minHeight
      restorePageScroll(scrollY)
      restoreBackground()
      const restoreAfterViewportSettles = () => {
        if (!returnFocusTarget?.isConnected) return
        restorePageScroll(scrollY)
      }
      const visualViewport = window.visualViewport
      visualViewport?.addEventListener('resize', restoreAfterViewportSettles, { once: true })
      window.requestAnimationFrame(() => {
        if (window.matchMedia(MOBILE_QUERY).matches) focusIfAvailable(returnFocusTarget)
        restorePageScroll(scrollY)
        window.requestAnimationFrame(() => {
          restorePageScroll(scrollY)
        })
      })
      window.setTimeout(() => {
        visualViewport?.removeEventListener('resize', restoreAfterViewportSettles)
        restoreAfterViewportSettles()
      }, 150)
    }
  }, [isCompact, isOpen, nativeDialogAvailable, returnFocusRef])

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !nativeDialogAvailable) {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = getFocusableElements(event.currentTarget)
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const wheelContent = (
    <section
      aria-labelledby="codon-wheel-title"
      className={`wheel-panel ${isOpen ? 'expanded' : ''} ${isCompact ? 'dialog' : 'inline'}`}
      data-active-codon={activeCodon || undefined}
      data-open={isOpen}
      data-presentation={isCompact ? 'dialog' : 'inline'}
      data-testid="codon-wheel"
    >
      <header className="wheel-header">
        <div>
          <p className="eyebrow">Reference wheel</p>
          <h2 id="codon-wheel-title">Read from the center outward</h2>
        </div>
        <button
          aria-label={isCompact ? 'Close codon wheel' : isOpen ? 'Return codon wheel to normal size' : 'Enlarge codon wheel'}
          aria-pressed={isCompact ? undefined : isOpen}
          className="icon-button quiet wheel-size-button"
          data-wheel-close={isCompact ? '' : undefined}
          onClick={onClose}
          title={isCompact ? 'Close codon wheel' : isOpen ? 'Return to normal size' : 'Enlarge wheel'}
          type="button"
        >
          {isCompact
            ? <X aria-hidden="true" size={24} />
            : isOpen
              ? <Minimize2 aria-hidden="true" size={21} />
              : <Maximize2 aria-hidden="true" size={21} />}
        </button>
      </header>

      <div className="active-codon-readout" aria-live="polite" data-active-codon={activeCodon || undefined}>
        <span>Active path: codon {activeCodonIndex + 1}</span>
        <strong>{activeCodon ? `${activeCodon} to ${activeSignal ?? 'Unknown'}` : '---'}</strong>
      </div>

      <div className="wheel-viewport" data-testid="codon-wheel-viewport" tabIndex={isCompact ? 0 : undefined}>
        <svg
          aria-describedby="codon-wheel-description"
          className="wheel-svg"
          data-active-codon={activeCodon || undefined}
          role="img"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
        >
          <title>mRNA codon wheel showing all 64 codons and their amino acid or Stop signals</title>
          <desc id="codon-wheel-description">
            Start with the first base in the center, then move through the second and third bases toward the amino acid or Stop signal.
            {activeCodon ? ` The highlighted path begins with the active codon ${activeCodon} and ends at ${activeSignal}.` : ''}
          </desc>
          <circle cx={CENTER} cy={CENTER} fill="#f8fbfa" r="266" stroke="#173443" strokeWidth="2" />

          {RNA_BASES.map((base, index) => {
            const start = -90 + index * 90
            const active = activeCodon[0] === base
            return (
              <g data-active={active || undefined} data-base={base} data-ring="first" key={`first-${base}`}>
                <path className={active ? 'wheel-segment active' : 'wheel-segment'} d={ringSector(18, 92, start, start + 90)} fill={baseColor(base)} />
                <text className="wheel-base first" textAnchor="middle" x={point(61, start + 45).x} y={point(61, start + 45).y + 7}>{base}</text>
              </g>
            )
          })}

          {RNA_BASES.flatMap((firstBase, firstIndex) => RNA_BASES.map((secondBase, secondIndex) => {
            const index = firstIndex * 4 + secondIndex
            const start = -90 + index * 22.5
            const active = activeCodon.startsWith(`${firstBase}${secondBase}`)
            return (
              <g data-active={active || undefined} data-bases={`${firstBase}${secondBase}`} data-ring="second" key={`second-${firstBase}${secondBase}`}>
                <path className={active ? 'wheel-segment active' : 'wheel-segment'} d={ringSector(92, 151, start, start + 22.5)} fill={baseColor(secondBase)} />
                <text className="wheel-base second" textAnchor="middle" x={point(121, start + 11.25).x} y={point(121, start + 11.25).y + 4}>{secondBase}</text>
              </g>
            )
          }))}

          {CODON_ENTRIES.map((entry, index) => {
            const span = 360 / CODON_ENTRIES.length
            const start = -90 + index * span
            const angle = start + span / 2
            const active = activeCodon === entry.codon
            const thirdPoint = point(173, angle)
            const labelPoint = point(220, angle)
            return (
              <g data-active={active || undefined} data-codon={entry.codon} data-ring="third-signal" data-signal={entry.aminoAcid} key={entry.codon}>
                <path
                  className={active ? 'wheel-segment amino active' : 'wheel-segment amino'}
                  d={ringSector(151, 262, start, start + span)}
                  fill={aminoColor.get(entry.aminoAcid)}
                />
                <text
                  className="wheel-third-base"
                  style={{ fontSize: active ? 18 : 15 }}
                  textAnchor="middle"
                  transform={`rotate(${readableRotation(angle)} ${thirdPoint.x} ${thirdPoint.y})`}
                  x={thirdPoint.x}
                  y={thirdPoint.y + 3}
                >{entry.thirdBase}</text>
                <text
                  className="wheel-amino-label"
                  style={{ fontSize: active ? 18 : 15 }}
                  textAnchor="middle"
                  transform={`rotate(${readableRotation(angle)} ${labelPoint.x} ${labelPoint.y})`}
                  x={labelPoint.x}
                  y={labelPoint.y + 3}
                >{entry.aminoAcid}</text>
              </g>
            )
          })}

          <circle cx={CENTER} cy={CENTER} fill="#173443" r="18" />
          <text className="wheel-center-label" textAnchor="middle" x={CENTER} y={CENTER + 4}>1st</text>
        </svg>
      </div>

      <div className="wheel-ring-key" aria-hidden="true">
        <span>1st base</span><i>→</i><span>2nd base</span><i>→</i><span>3rd base</span><i>→</i><span>Amino acid / Stop</span>
      </div>

      <table className="sr-only">
        <caption>Screen-reader codon reference</caption>
        <thead><tr><th>Codon</th><th>Signal</th></tr></thead>
        <tbody>{CODON_ENTRIES.map((entry) => <tr key={`sr-${entry.codon}`}><td>{entry.codon}</td><td>{entry.aminoAcid}</td></tr>)}</tbody>
      </table>
    </section>
  )

  if (!isCompact) return wheelContent
  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(
    nativeDialogAvailable ? (
      <dialog
        aria-describedby="codon-wheel-description"
        aria-labelledby="codon-wheel-title"
        className="codon-wheel-dialog"
        data-dialog-kind="native"
        data-testid="codon-wheel-dialog"
        onCancel={(event) => {
          event.preventDefault()
          onClose()
        }}
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) event.preventDefault()
        }}
        ref={dialogRef}
      >
        {wheelContent}
      </dialog>
    ) : (
      <div
        aria-describedby="codon-wheel-description"
        aria-labelledby="codon-wheel-title"
        aria-modal="true"
        className="codon-wheel-fallback"
        data-dialog-kind="fallback"
        data-testid="codon-wheel-dialog"
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) event.preventDefault()
        }}
        ref={fallbackRef}
        role="dialog"
      >
        {wheelContent}
      </div>
    ),
    document.body,
  )
}

function supportsNativeDialog(): boolean {
  return typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function'
}

function isolateBackground(dialog: HTMLElement): () => void {
  const backgroundElements = [...document.body.children]
    .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== dialog && !element.contains(dialog))
  const previousState = backgroundElements.map((element) => ({
    ariaHidden: element.getAttribute('aria-hidden'),
    element,
    inert: element.inert,
  }))

  for (const { element } of previousState) {
    element.inert = true
    element.setAttribute('aria-hidden', 'true')
  }

  return () => {
    for (const { ariaHidden, element, inert } of previousState) {
      element.inert = inert
      if (ariaHidden === null) element.removeAttribute('aria-hidden')
      else element.setAttribute('aria-hidden', ariaHidden)
    }
  }
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
  )].filter((element) => !element.hasAttribute('hidden') && element.getClientRects().length > 0)
}

function focusIfAvailable(element: HTMLElement | null): void {
  if (element?.isConnected && !element.hasAttribute('hidden')) element.focus({ preventScroll: true })
}

function centerWheelViewport(viewport: HTMLElement): void {
  viewport.scrollLeft = clampScroll((viewport.scrollWidth - viewport.clientWidth) / 2, viewport.scrollWidth - viewport.clientWidth)
  viewport.scrollTop = clampScroll((viewport.scrollHeight - viewport.clientHeight) / 2, viewport.scrollHeight - viewport.clientHeight)
}

function clampScroll(value: number, maximum: number): number {
  return Math.min(Math.max(0, value), Math.max(0, maximum))
}

function restorePageScroll(scrollY: number): void {
  window.scrollTo(0, scrollY)
  if (document.scrollingElement) document.scrollingElement.scrollTop = scrollY
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    const updateMatch = () => setMatches(mediaQuery.matches)
    updateMatch()
    mediaQuery.addEventListener('change', updateMatch)
    return () => mediaQuery.removeEventListener('change', updateMatch)
  }, [query])

  return matches
}

function point(radius: number, angle: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180
  return { x: CENTER + radius * Math.cos(radians), y: CENTER + radius * Math.sin(radians) }
}

function ringSector(innerRadius: number, outerRadius: number, startAngle: number, endAngle: number): string {
  const outerStart = point(outerRadius, startAngle)
  const outerEnd = point(outerRadius, endAngle)
  const innerEnd = point(innerRadius, endAngle)
  const innerStart = point(innerRadius, startAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

function readableRotation(angle: number): number {
  const normalized = ((angle % 360) + 360) % 360
  return normalized > 90 && normalized < 270 ? angle + 180 : angle
}

function baseColor(base: string): string {
  if (base === 'U') return '#d8ebe7'
  if (base === 'C') return '#f3d48f'
  if (base === 'A') return '#cddcf0'
  return '#efc4bb'
}
