import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { codonMap } from '../game/content/rounds'

interface CodonWheelProps {
  activeCodonIndex: number
  codons: string[]
  isOpen: boolean
  onClose: () => void
}

export function CodonWheel({ activeCodonIndex, codons, isOpen, onClose }: CodonWheelProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    closeButtonRef.current?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  const currentEntries = codons
    .filter((codon, index, list) => list.indexOf(codon) === index)
    .map((codon) => [codon, codonMap[codon as keyof typeof codonMap] ?? 'Unknown'] as const)
  const allEntries = Object.entries(codonMap).filter(([codon]) => !codons.includes(codon))

  return (
    <div className="modal-backdrop" data-testid="codon-wheel-modal" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="codon-wheel-title"
        className="codon-wheel"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Translation helper</p>
            <h2 id="codon-wheel-title">Codon Key</h2>
            <p>Read mRNA three bases at a time.</p>
          </div>
          <button ref={closeButtonRef} aria-label="Close codon wheel" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={24} />
          </button>
        </header>
        <div className="codon-header" aria-hidden="true">
          <span>mRNA codon</span>
          <strong>Amino acid</strong>
        </div>
        <div className="codon-list">
          {currentEntries.length > 0 && <p className="codon-section-label">Current round codons</p>}
          {currentEntries.map(([codon, aminoAcid], index) => (
            <div
              aria-current={index === activeCodonIndex ? 'true' : undefined}
              className={`codon-row ${index === activeCodonIndex ? 'active' : ''}`}
              key={codon}
            >
              <span>
                {codon}
                {index === activeCodonIndex && <small>Current codon</small>}
              </span>
              <strong>{aminoAcid}</strong>
            </div>
          ))}
          {allEntries.length > 0 && (
            <details className="codon-extra">
              <summary>Other codons in this game</summary>
              {allEntries.map(([codon, aminoAcid]) => (
                <div className="codon-row muted" key={codon}>
                  <span>{codon}</span>
                  <strong>{aminoAcid}</strong>
                </div>
              ))}
            </details>
          )}
        </div>
      </section>
    </div>
  )
}
