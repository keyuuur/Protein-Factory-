import { ArrowRight, Check, CircleDot, Dna } from 'lucide-react'

interface TutorialScreenProps { onContinue: () => void }

const steps = [
  { title: 'Transcribe', copy: 'Pair each nucleotide in the DNA strand with its complementary RNA nucleotide.', icon: Dna },
  { title: 'Translate', copy: 'Translate four mRNA codons into amino acids. A stop codon ends translation.', icon: CircleDot },
  { title: 'Test function', copy: 'Match the chain to one row in the fictional fur-color practice model.', icon: Check },
]

export function TutorialScreen({ onContinue }: TutorialScreenProps) {
  return (
    <main className="focus-screen tutorial-screen" data-testid="tutorial-screen">
      <section className="flow-panel" aria-labelledby="tutorial-title">
        <p className="eyebrow">Your workbench</p>
        <h1 id="tutorial-title">Build one protein at a time.</h1>
        <div className="tutorial-flow">
          {steps.map(({ title, copy, icon: Icon }, index) => (
            <article key={title}>
              <span className="tutorial-number">{index + 1}</span>
              <Icon aria-hidden="true" size={28} />
              <h2>{title}</h2>
              <p>{copy}</p>
            </article>
          ))}
        </div>
        <div className="tutorial-note">
          <strong>Three proteins, three actions each</strong>
          <span>Corrections highlight the exact slot to repair. The codon wheel is always available during translation.</span>
        </div>
        <button className="primary-action" onClick={onContinue} type="button">
          Start Protein 1 <ArrowRight aria-hidden="true" size={22} />
        </button>
      </section>
    </main>
  )
}
