import { X } from 'lucide-react'
import { codonMap } from '../data/rounds'

interface CodonWheelProps {
  isOpen: boolean
  onClose: () => void
}

export function CodonWheel({ isOpen, onClose }: CodonWheelProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" data-testid="codon-wheel-modal" role="presentation">
      <section aria-labelledby="codon-wheel-title" className="codon-wheel" role="dialog" aria-modal="true">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Translation helper</p>
            <h2 id="codon-wheel-title">Codon Wheel</h2>
          </div>
          <button aria-label="Close codon wheel" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={24} />
          </button>
        </header>
        <div className="codon-list">
          {Object.entries(codonMap).map(([codon, aminoAcid]) => (
            <div className="codon-row" key={codon}>
              <span>{codon}</span>
              <strong>{aminoAcid}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

