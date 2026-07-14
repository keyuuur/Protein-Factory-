import * as THREE from 'three'
import type { FeedbackKind, ProductSnapshot, ProductionAction } from '../types'
import type { FactorySceneSnapshot } from './adapters/sceneState'

interface FactoryRuntimeOptions {
  container: HTMLElement
  onContextLost?: () => void
  onContextRestored?: () => void
}

interface MachineRecord {
  action: ProductionAction
  group: THREE.Group
  lamp: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  mover: THREE.Object3D
}

interface TrayRecord {
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>
  protein: THREE.Mesh<THREE.TorusKnotGeometry, THREE.MeshStandardMaterial>
}

type TokenEmphasis = 'none' | 'active' | 'changed' | 'repair'
type MotionRole =
  | 'base-seat'
  | 'codon'
  | 'pending-amino'
  | 'chain-link'
  | 'stop-gate'
  | 'function-preview'
  | 'repair-target'
  | 'variant'
type ReactionKind =
  | 'idle'
  | 'machine-change'
  | 'base-seat'
  | 'codon-advance'
  | 'pending-amino'
  | 'chain-link'
  | 'stop-gate'
  | 'function-preview'
  | 'incorrect'
  | 'repair'
  | 'confirmed'
  | 'variant-change'

interface SceneReaction {
  kind: ReactionKind
  duration: number
  index: number | null
}

export const MAX_RENDER_PIXELS = 1_500_000

export function rendererPixelRatio(
  width: number,
  height: number,
  devicePixelRatio: number,
  coarsePointer: boolean,
): number {
  const cssPixels = Math.max(1, width) * Math.max(1, height)
  const pixelBudgetRatio = Math.sqrt(MAX_RENDER_PIXELS / cssPixels)
  const preferredLimit = coarsePointer ? 1.25 : 1.75
  const requestedRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  return Math.min(requestedRatio, preferredLimit, pixelBudgetRatio)
}

const baseColors: Record<string, number> = {
  A: 0xe4a62d,
  T: 0x2b7db2,
  U: 0x8260a8,
  C: 0x209276,
  G: 0xc95656,
}

const actionColors: Record<ProductionAction, number> = {
  transcription: 0x2b7db2,
  translation: 0x209276,
  'function-test': 0xb64f5d,
}

const sequenceColors = [0x2b7db2, 0xd09a32, 0xb64f5d] as const

const traitColors: Record<ProductSnapshot['traitColor'], number> = {
  black: 0x273039,
  brown: 0x765444,
  tan: 0xc5a36f,
  white: 0xe8eeee,
}

export class FactoryRuntime {
  private readonly container: HTMLElement
  private readonly onContextLost?: () => void
  private readonly onContextRestored?: () => void
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(39, 1, 0.1, 80)
  private readonly labGroup = new THREE.Group()
  private readonly cargoGroup = new THREE.Group()
  private readonly trayProducts = new THREE.Group()
  private readonly trayRecords: TrayRecord[] = []
  private readonly machineRecords: MachineRecord[] = []
  private readonly geometryPool = new Map<string, THREE.BufferGeometry>()
  private readonly materialPool = new Map<string, THREE.MeshStandardMaterial>()
  private readonly resizeObserver: ResizeObserver
  private readonly motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly coarsePointer: boolean
  private readonly statusRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>
  private readonly progressFill: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  private animationFrame = 0
  private settleTimer: ReturnType<typeof setTimeout> | null = null
  private motionStartedAt = 0
  private motionEndsAt = 0
  private renderRevision = 0
  private sceneState: FactorySceneSnapshot | null = null
  private reaction: SceneReaction = { kind: 'idle', duration: 0, index: null }
  private disposed = false
  private contextAvailable = true
  private reduceMotion = this.motionPreference.matches

  constructor({ container, onContextLost, onContextRestored }: FactoryRuntimeOptions) {
    if (container.querySelector('canvas.factory-canvas')) {
      throw new Error('Factory canvas already has an active WebGL renderer.')
    }
    this.container = container
    this.onContextLost = onContextLost
    this.onContextRestored = onContextRestored
    this.coarsePointer = hasCoarsePointer()
    this.publishRenderState(false, 'initializing')
    this.renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: !this.coarsePointer,
      depth: true,
      powerPreference: 'low-power',
      preserveDrawingBuffer: true,
      stencil: false,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setClearColor(0xdcebed, 1)
    this.renderer.domElement.className = 'factory-canvas'
    this.renderer.domElement.style.pointerEvents = 'none'
    this.renderer.domElement.setAttribute('aria-label', 'Three-dimensional protein factory laboratory bench')
    this.renderer.domElement.setAttribute('role', 'img')
    this.container.appendChild(this.renderer.domElement)
    const contextAttributes = this.renderer.getContext().getContextAttributes()
    this.container.dataset.renderAlpha = String(contextAttributes?.alpha ?? false)
    this.container.dataset.renderAntialias = String(contextAttributes?.antialias ?? !this.coarsePointer)
    this.container.dataset.renderPreserved = String(contextAttributes?.preserveDrawingBuffer ?? true)

    this.camera.position.set(0, 7.4, 10.8)
    this.camera.lookAt(0, 0.35, -0.35)
    this.scene.add(this.labGroup)
    this.createLighting()
    const sceneParts = this.createBench()
    this.statusRing = sceneParts.statusRing
    this.progressFill = sceneParts.progressFill

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.container)
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost)
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored)
    document.addEventListener('visibilitychange', this.handleVisibility)
    this.motionPreference.addEventListener('change', this.handleMotionPreference)
    this.resize()
  }

  setState(sceneState: FactorySceneSnapshot): void {
    const previousState = this.sceneState
    this.reaction = deriveSceneReaction(previousState, sceneState)
    this.renderRevision += 1
    this.publishRenderState(false, 'rendering')
    this.sceneState = sceneState
    this.updateMachines(sceneState.activeAction)
    this.updateStatus(sceneState.statusKind, sceneState.repairActive)
    this.updateProgress(sceneState.progress)
    this.buildCargo(sceneState)
    this.updateComparisonTray(sceneState.completedProducts)
    this.renderer.domElement.setAttribute('aria-label', sceneDescription(sceneState))

    this.beginMotion(this.reaction.duration)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.animationFrame)
    if (this.settleTimer !== null) clearTimeout(this.settleTimer)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost)
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored)
    document.removeEventListener('visibilitychange', this.handleVisibility)
    this.motionPreference.removeEventListener('change', this.handleMotionPreference)
    disposeSceneResources(this.scene, this.geometryPool, this.materialPool)
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.publishRenderState(false, 'disposed')
  }

  private createLighting(): void {
    const ambient = new THREE.HemisphereLight(0xf8ffff, 0x657b77, 2.65)
    this.scene.add(ambient)

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.4)
    keyLight.position.set(-4.5, 8, 7)
    this.scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xccebf0, 1.5)
    fillLight.position.set(8, 4, -4)
    this.scene.add(fillLight)
  }

  private createBench(): {
    statusRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>
    progressFill: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  } {
    const benchTop = mesh(
      new THREE.BoxGeometry(13.8, 0.38, 5.8),
      new THREE.MeshStandardMaterial({ color: 0x536b70, metalness: 0.14, roughness: 0.48 }),
      [0, 0, 0],
    )
    this.labGroup.add(benchTop)

    const front = mesh(
      new THREE.BoxGeometry(13.8, 1.02, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x29434b, metalness: 0.18, roughness: 0.56 }),
      [0, -0.58, 2.73],
    )
    this.labGroup.add(front)

    const backRail = mesh(
      new THREE.BoxGeometry(13.5, 1.15, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xadc4c3, roughness: 0.74 }),
      [0, 0.68, -2.62],
    )
    this.labGroup.add(backRail)

    const underBench = mesh(
      new THREE.BoxGeometry(12.5, 0.82, 3.8),
      new THREE.MeshStandardMaterial({ color: 0x385159, roughness: 0.62 }),
      [0, -0.73, -0.05],
    )
    this.labGroup.add(underBench)

    this.addMachine('transcription')
    this.addMachine('translation')
    this.addMachine('function-test')

    const cargoDeck = mesh(
      new THREE.BoxGeometry(7.9, 0.18, 2.05),
      new THREE.MeshStandardMaterial({ color: 0xdce8e6, metalness: 0.1, roughness: 0.52 }),
      [0, 0.31, 0.15],
    )
    this.labGroup.add(cargoDeck)

    const statusRing = new THREE.Mesh(
      new THREE.TorusGeometry(4.02, 0.055, 8, 64),
      new THREE.MeshStandardMaterial({ color: 0x7f979a, emissive: 0x000000, roughness: 0.4 }),
    )
    statusRing.rotation.x = Math.PI / 2
    statusRing.scale.y = 0.25
    statusRing.position.set(0, 0.43, 0.15)
    this.labGroup.add(statusRing)

    const tray = mesh(
      new THREE.BoxGeometry(9.2, 0.2, 1.0),
      new THREE.MeshStandardMaterial({ color: 0xb7c8c6, metalness: 0.12, roughness: 0.55 }),
      [0, 0.34, 1.92],
    )
    this.labGroup.add(tray)
    this.trayProducts.position.set(0, 0, 1.92)
    this.labGroup.add(this.trayProducts)
    this.createComparisonTray()

    const progressTrack = mesh(
      new THREE.BoxGeometry(8.2, 0.1, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x819497, roughness: 0.5 }),
      [0, -0.33, 2.92],
    )
    this.labGroup.add(progressTrack)

    const progressFill = mesh(
      new THREE.BoxGeometry(8.2, 0.13, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x35a889, emissive: 0x155948, emissiveIntensity: 0.16, roughness: 0.42 }),
      [-4.1, -0.33, 3.0],
    )
    progressFill.geometry.translate(4.1, 0, 0)
    progressFill.scale.x = 0.001
    this.labGroup.add(progressFill)

    this.cargoGroup.position.set(0, 0, 0.08)
    this.labGroup.add(this.cargoGroup)

    return { statusRing, progressFill }
  }

  private addMachine(action: ProductionAction): void {
    const group = new THREE.Group()
    group.position.set(0, 0.34, -1.58)
    group.visible = false
    const mutedMaterial = new THREE.MeshStandardMaterial({ color: 0x789093, metalness: 0.25, roughness: 0.5 })
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x3c555c, metalness: 0.32, roughness: 0.42 })

    const base = mesh(new THREE.BoxGeometry(7.8, 0.28, 1.72), darkMaterial, [0, 0, 0])
    group.add(base)
    const mover = new THREE.Group()
    group.add(mover)

    if (action === 'transcription') {
      const leftPost = mesh(new THREE.BoxGeometry(0.38, 1.34, 0.54), mutedMaterial, [-3.15, 0.75, 0])
      const rightPost = mesh(new THREE.BoxGeometry(0.38, 1.34, 0.54), mutedMaterial, [3.15, 0.75, 0])
      const roller = mesh(new THREE.CylinderGeometry(0.31, 0.31, 5.95, 24), darkMaterial, [0, 0.84, 0])
      roller.rotation.z = Math.PI / 2
      mover.add(leftPost, rightPost, roller)
    } else if (action === 'translation') {
      const lower = mesh(new THREE.SphereGeometry(1.2, 28, 18), mutedMaterial, [0, 0.5, 0])
      lower.scale.set(2.35, 0.48, 0.78)
      const upper = mesh(new THREE.SphereGeometry(1.05, 28, 18), darkMaterial, [0, 1.03, -0.08])
      upper.scale.set(2.05, 0.43, 0.68)
      mover.add(lower, upper)
    } else {
      const chamber = mesh(new THREE.CylinderGeometry(1.05, 1.18, 1.42, 28), mutedMaterial, [0, 0.8, 0])
      const core = mesh(
        new THREE.TorusKnotGeometry(0.48, 0.12, 64, 10),
        new THREE.MeshStandardMaterial({ color: 0xaab8b7, roughness: 0.38 }),
        [0, 0.82, 0],
      )
      mover.add(chamber, core)
    }

    const lampMaterial = new THREE.MeshStandardMaterial({ color: 0x718689, emissive: 0x000000, roughness: 0.35 })
    const lamp = mesh(new THREE.SphereGeometry(0.16, 16, 12), lampMaterial, [3.45, 0.28, 0.64])
    group.add(lamp)
    this.labGroup.add(group)
    this.machineRecords.push({ action, group, lamp, mover })
  }

  private updateMachines(activeAction: ProductionAction): void {
    this.machineRecords.forEach((record) => {
      const active = record.action === activeAction
      const color = actionColors[record.action]
      record.group.visible = active
      record.group.scale.setScalar(1)
      record.lamp.material.color.set(active ? color : 0x718689)
      record.lamp.material.emissive.set(active ? color : 0x000000)
      record.lamp.material.emissiveIntensity = active ? 0.55 : 0
    })
  }

  private updateStatus(kind: FeedbackKind, repairActive: boolean): void {
    const color = repairActive || kind === 'error'
      ? 0xc95656
      : kind === 'success'
        ? 0x35a889
        : 0xd5a33a
    this.statusRing.material.color.set(color)
    this.statusRing.material.emissive.set(color)
    this.statusRing.material.emissiveIntensity = kind === 'info' && !repairActive ? 0.08 : 0.34
  }

  private updateProgress(progress: number): void {
    this.progressFill.scale.x = Math.max(0.001, Math.min(1, progress))
  }

  private buildCargo(state: FactorySceneSnapshot): void {
    clearGroup(this.cargoGroup)
    this.cargoGroup.position.set(0, 0, 0.08)
    this.cargoGroup.scale.setScalar(1)

    if (state.activeAction === 'transcription') {
      this.buildDna(
        state.dnaStrand,
        state.repairTarget?.kind === 'base' ? state.repairTarget.index : null,
        state.changedDnaIndex,
      )
      this.buildMrna(
        state.mrna,
        state.dnaStrand.length,
        state.repairTarget?.kind === 'base' ? state.repairTarget.index : null,
        null,
        null,
        state.changedDnaIndex,
      )
    } else if (state.activeAction === 'translation') {
      const repairCodon = state.repairTarget?.kind === 'codon' ? state.repairTarget.index : null
      const activeCodonIndex = state.activeCodon ? state.currentCodonIndex : null
      this.buildMrna(
        state.mrna,
        state.mrna.length,
        repairCodon === null ? null : repairCodon * 3,
        repairCodon,
        activeCodonIndex,
      )
      const displayedAminoAcids = [...state.aminoAcidChain]
      const pendingIndex = state.pendingAminoAcid && state.pendingAminoAcid !== 'Stop' && state.currentCodonIndex < 4
        ? state.currentCodonIndex
        : null
      if (pendingIndex !== null && state.pendingAminoAcid) displayedAminoAcids[pendingIndex] = state.pendingAminoAcid
      this.buildAminoChain(displayedAminoAcids, repairCodon, state.currentCodonIndex, pendingIndex)
      this.buildStopGate(state)
    } else {
      this.buildAminoChain(state.aminoAcidChain, null, -1, null)
      this.buildFunctionAssay(state)
    }
  }

  private buildDna(sequence: string, repairIndex: number | null, changedIndex: number | null): void {
    const spacing = sequenceSpacing(sequence.length, 7.1, 0.48)
    const startX = -((Math.max(sequence.length, 1) - 1) * spacing) / 2

    sequence.split('').forEach((base, index) => {
      const phase = index * 0.72
      const yOffset = Math.sin(phase) * 0.1
      const firstZ = -0.48 + Math.cos(phase) * 0.1
      const secondZ = -0.02 - Math.cos(phase) * 0.1
      const emphasis: TokenEmphasis = repairIndex === index
        ? 'repair'
        : changedIndex === index
          ? 'changed'
          : 'none'
      const first = this.molecularToken(base, emphasis, 'sphere')
      const second = this.molecularToken(complementaryDnaBase(base), emphasis, 'sphere')
      first.position.set(startX + index * spacing, 0.96 + yOffset, firstZ)
      second.position.set(startX + index * spacing, 0.96 - yOffset, secondZ)
      if (repairIndex === index) {
        markMotionTarget(first, 'repair-target')
        markMotionTarget(second, 'repair-target')
      }
      if (changedIndex === index) {
        markMotionTarget(first, 'variant')
        markMotionTarget(second, 'variant')
      }
      this.cargoGroup.add(first, second)
      const connectorColor = emphasis === 'repair' ? 0xc95656 : emphasis === 'changed' ? 0xd09a32 : 0xaebfbd
      this.cargoGroup.add(this.connectorBetween(first.position, second.position, connectorColor, 0.025))
    })
  }

  private buildMrna(
    sequence: string,
    expectedLength: number,
    repairIndex: number | null,
    repairCodon: number | null = null,
    activeCodon: number | null = null,
    changedIndex: number | null = null,
  ): void {
    const length = Math.max(sequence.length, expectedLength, 1)
    const spacing = sequenceSpacing(length, 7.2, 0.48)
    const startX = -((length - 1) * spacing) / 2

    for (let index = 0; index < length; index += 1) {
      const base = sequence[index] ?? ''
      const codonIndex = Math.floor(index / 3)
      const repairHighlighted = repairIndex === index || (repairCodon !== null && codonIndex === repairCodon)
      const emphasis: TokenEmphasis = repairHighlighted
        ? 'repair'
        : changedIndex === index
          ? 'changed'
        : activeCodon !== null && codonIndex === activeCodon
          ? 'active'
          : 'none'
      const token = this.molecularToken(base, emphasis, 'box')
      token.position.set(startX + index * spacing, 0.72, 0.56)
      if (repairHighlighted) markMotionTarget(token, 'repair-target')
      if (this.reaction.kind === 'base-seat' && this.reaction.index === index) markMotionTarget(token, 'base-seat')
      if (activeCodon !== null && codonIndex === activeCodon) markMotionTarget(token, 'codon')
      if (changedIndex === index) markMotionTarget(token, 'variant')
      this.cargoGroup.add(token)
    }
  }

  private buildAminoChain(
    aminoAcids: string[],
    repairIndex: number | null,
    currentIndex: number,
    pendingIndex: number | null,
  ): void {
    const length = Math.max(4, aminoAcids.length)
    const spacing = 0.92
    const startX = -((length - 1) * spacing) / 2
    let previousPosition: THREE.Vector3 | null = null
    for (let index = 0; index < length; index += 1) {
      const loaded = Boolean(aminoAcids[index]) && aminoAcids[index] !== 'Stop'
      const active = repairIndex === index || (repairIndex === null && currentIndex === index)
      const color = loaded ? aminoColor(aminoAcids[index]) : 0x829497
      const emphasis = repairIndex === index ? 'repair' : pendingIndex === index || active ? 'active' : 'none'
      const emissive = emphasis === 'repair' ? 0xc95656 : emphasis === 'active' ? color : 0x000000
      const material = this.pooledMaterial(
        `amino:${color}:${emphasis}`,
        () => new THREE.MeshStandardMaterial({
          color,
          emissive,
          emissiveIntensity: emphasis === 'none' ? 0 : 0.42,
          roughness: 0.38,
        }),
      )
      const geometry = this.pooledGeometry('amino-token', () => new THREE.IcosahedronGeometry(0.28, 1))
      const token = new THREE.Mesh(geometry, material)
      token.scale.setScalar(loaded ? 1 : 0.79)
      token.position.set(startX + index * spacing, 1.23 + Math.sin(index * 1.4) * 0.1, 0.12)
      if (repairIndex === index) markMotionTarget(token, 'repair-target')
      else if (pendingIndex === index) markMotionTarget(token, 'pending-amino')
      else if (this.reaction.kind === 'chain-link' && this.reaction.index === index) markMotionTarget(token, 'chain-link')
      this.cargoGroup.add(token)
      if (previousPosition) this.cargoGroup.add(this.connectorBetween(previousPosition, token.position, 0x627c80, 0.045))
      previousPosition = token.position.clone()
    }
  }

  private buildStopGate(state: FactorySceneSnapshot): void {
    const stopActive = state.currentCodonIndex >= 4 || state.activeCodon === state.codons[4]
    const stopPending = state.pendingAminoAcid === 'Stop'
    const stopConfirmed = state.stageComplete && state.statusKind === 'success'
    const stopRepair = state.repairTarget?.kind === 'codon' && state.repairTarget.index === 4
    const color = stopRepair
      ? 0xc95656
      : stopConfirmed
        ? 0x35a889
        : stopActive || stopPending
          ? 0xd09a32
          : 0x829497
    const material = this.pooledMaterial(
      `stop-gate:${color}`,
      () => new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: stopActive || stopPending || stopRepair || stopConfirmed ? 0.34 : 0.04,
        metalness: 0.12,
        roughness: 0.42,
      }),
    )
    const gate = new THREE.Group()
    gate.add(
      mesh(this.pooledGeometry('stop-post', () => new THREE.BoxGeometry(0.11, 0.78, 0.11)), material, [-0.34, 0.39, 0]),
      mesh(this.pooledGeometry('stop-post', () => new THREE.BoxGeometry(0.11, 0.78, 0.11)), material, [0.34, 0.39, 0]),
      mesh(this.pooledGeometry('stop-bar', () => new THREE.BoxGeometry(0.78, 0.12, 0.15)), material, [0, 0.72, 0]),
    )
    gate.position.set(2.45, 0.76, 0.12)
    markMotionTarget(gate, 'stop-gate')
    this.cargoGroup.add(gate)
  }

  private buildFunctionAssay(state: FactorySceneSnapshot): void {
    const selectedColor = state.selectedFunction
      ? traitColors[state.selectedFunction.traitColor]
      : 0x809496
    const preview = new THREE.Group()
    preview.position.set(2.55, 0, 0.1)
    markMotionTarget(preview, 'function-preview')
    const dock = mesh(
      this.pooledGeometry('assay-dock', () => new THREE.BoxGeometry(2.1, 0.12, 0.94)),
      this.pooledMaterial('assay-dock', () => new THREE.MeshStandardMaterial({ color: 0x6d8588, metalness: 0.18, roughness: 0.5 })),
      [0, 0.48, 0],
    )
    const vessel = mesh(
      this.pooledGeometry('assay-vessel', () => new THREE.CylinderGeometry(0.63, 0.72, 0.92, 22)),
      this.pooledMaterial(
        'assay-vessel',
        () => new THREE.MeshStandardMaterial({ color: 0xd8e5e3, metalness: 0.12, roughness: 0.34 }),
      ),
      [-0.34, 0.93, 0],
    )
    const protein = mesh(
      this.pooledGeometry('assay-protein', () => new THREE.TorusKnotGeometry(0.29, 0.08, 58, 9)),
      this.pooledMaterial(
        `assay-protein:${state.selectedFunction ? 1 : 0}`,
        () => new THREE.MeshStandardMaterial({
          color: 0x2f8d8a,
          emissive: 0x2f8d8a,
          emissiveIntensity: state.selectedFunction ? 0.25 : 0.05,
          roughness: 0.36,
        }),
      ),
      [-0.34, 0.96, 0],
    )
    protein.rotation.x = Math.PI / 2
    const traitSwatch = mesh(
      this.pooledGeometry('assay-swatch', () => new THREE.CylinderGeometry(0.29, 0.29, 0.14, 22)),
      this.pooledMaterial(
        `assay-swatch:${selectedColor}:${state.selectedFunction ? 1 : 0}`,
        () => new THREE.MeshStandardMaterial({
          color: selectedColor,
          emissive: selectedColor,
          emissiveIntensity: state.selectedFunction ? 0.32 : 0.02,
          roughness: 0.4,
        }),
      ),
      [0.69, 0.72, 0],
    )
    preview.add(dock, vessel, protein, traitSwatch)
    this.cargoGroup.add(preview)

    const halo = new THREE.Mesh(
      this.pooledGeometry('tray-ring', () => new THREE.TorusGeometry(0.58, 0.05, 8, 32)),
      this.pooledMaterial(
        'assay-repair-halo',
        () => new THREE.MeshStandardMaterial({ color: 0xc95656, emissive: 0xc95656, emissiveIntensity: 0.5 }),
      ),
    )
    halo.rotation.x = Math.PI / 2
    halo.position.set(2.21, 0.49, 0.1)
    halo.scale.setScalar(state.repairTarget?.kind === 'function-row' ? 1.35 : 0.001)
    this.cargoGroup.add(halo)
  }

  private molecularToken(base: string, emphasis: TokenEmphasis, shape: 'sphere' | 'box'): THREE.Mesh {
    const color = base ? baseColors[base] ?? 0x6f8588 : 0x829497
    const emissive = emphasis === 'repair'
      ? 0xc95656
      : emphasis === 'changed'
        ? 0xd09a32
        : emphasis === 'active'
          ? 0x2b7db2
          : 0x000000
    const material = this.pooledMaterial(
      `molecular:${color}:${emphasis}`,
      () => new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: emphasis === 'none' ? 0 : 0.48,
        roughness: 0.38,
      }),
    )
    const geometry = shape === 'sphere'
      ? this.pooledGeometry('molecular-sphere', () => new THREE.SphereGeometry(0.13, 14, 10))
      : this.pooledGeometry('molecular-box', () => new THREE.BoxGeometry(0.3, 0.16, 0.3))
    return new THREE.Mesh(geometry, material)
  }

  private connectorBetween(start: THREE.Vector3, end: THREE.Vector3, color: number, radius: number): THREE.Mesh {
    const midpoint = start.clone().add(end).multiplyScalar(0.5)
    const direction = end.clone().sub(start)
    const connector = new THREE.Mesh(
      this.pooledGeometry('connector-unit', () => new THREE.CylinderGeometry(1, 1, 1, 8)),
      this.pooledMaterial(
        `connector:${color}`,
        () => new THREE.MeshStandardMaterial({ color, roughness: 0.5 }),
      ),
    )
    connector.position.copy(midpoint)
    connector.scale.set(radius, direction.length(), radius)
    connector.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
    return connector
  }

  private createComparisonTray(): void {
    const positions = [-3.0, 0, 3.0]
    const slotGeometry = this.pooledGeometry('tray-slot', () => new THREE.CylinderGeometry(0.72, 0.78, 0.12, 24))
    const slotMaterial = this.pooledMaterial(
      'tray-slot',
      () => new THREE.MeshStandardMaterial({ color: 0x91a5a6, metalness: 0.2, roughness: 0.48 }),
    )
    const ringGeometry = this.pooledGeometry('tray-ring', () => new THREE.TorusGeometry(0.58, 0.05, 8, 32))
    const proteinGeometry = this.pooledGeometry(
      'tray-protein',
      () => new THREE.TorusKnotGeometry(0.3, 0.075, 48, 8),
    )

    positions.forEach((x, index) => {
      const sequenceColor = sequenceColors[index]
      const slot = mesh(slotGeometry, slotMaterial, [x, 0.49, 0])
      this.trayProducts.add(slot)

      const ring = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshStandardMaterial({ color: sequenceColor, emissive: 0x000000, emissiveIntensity: 0 }),
      )
      ring.rotation.x = Math.PI / 2
      ring.position.set(x, 0.58, 0)
      this.trayProducts.add(ring)

      const protein = new THREE.Mesh(
        proteinGeometry,
        new THREE.MeshStandardMaterial({
          color: 0x7e9193,
          emissive: 0x000000,
          emissiveIntensity: 0,
          roughness: 0.4,
        }),
      )
      protein.rotation.x = Math.PI / 2
      protein.position.set(x, 0.81, 0)
      protein.scale.setScalar(0.001)
      this.trayProducts.add(protein)
      this.trayRecords.push({ ring, protein })
    })
  }

  private updateComparisonTray(products: ProductSnapshot[]): void {
    this.trayRecords.forEach(({ ring, protein }, index) => {
      const product = products[index]
      const sequenceColor = sequenceColors[index]
      ring.material.color.set(sequenceColor)
      ring.material.emissive.set(product ? sequenceColor : 0x000000)
      ring.material.emissiveIntensity = product ? 0.18 : 0

      const productColor = product ? 0x2f8d8a : 0x7e9193
      protein.material.color.set(productColor)
      protein.material.emissive.set(product ? productColor : 0x000000)
      protein.material.emissiveIntensity = product ? 0.16 : 0
      protein.scale.setScalar(product ? 1 : 0.001)
    })
  }

  private pooledGeometry<G extends THREE.BufferGeometry>(key: string, create: () => G): G {
    const existing = this.geometryPool.get(key)
    if (existing) return existing as G
    const geometry = create()
    this.geometryPool.set(key, geometry)
    return geometry
  }

  private pooledMaterial(key: string, create: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    const existing = this.materialPool.get(key)
    if (existing) return existing
    const material = create()
    this.materialPool.set(key, material)
    return material
  }

  private beginMotion(duration: number): void {
    cancelAnimationFrame(this.animationFrame)
    if (this.settleTimer !== null) clearTimeout(this.settleTimer)
    this.animationFrame = 0
    this.settleTimer = null
    const now = performance.now()
    this.motionStartedAt = now
    this.motionEndsAt = now + (this.reduceMotion ? 0 : duration)
    const willAnimate = duration > 0 && !this.reduceMotion && !document.hidden && this.contextAvailable
    this.applyMotion(duration > 0 && !willAnimate ? 1 : 0)
    this.renderNow(!willAnimate)
    if (willAnimate) {
      this.settleTimer = setTimeout(() => this.finishMotion(), Math.min(duration + 50, 1_400))
      this.startLoop()
    }
  }

  private startLoop(): void {
    if (this.disposed || document.hidden || !this.contextAvailable || this.animationFrame) return
    if (performance.now() >= this.motionEndsAt) return
    this.animationFrame = requestAnimationFrame(this.loop)
  }

  private loop = (timestamp: number): void => {
    this.animationFrame = 0
    if (this.disposed || document.hidden || !this.contextAvailable) return
    const duration = Math.max(1, this.motionEndsAt - this.motionStartedAt)
    const progress = Math.min(1, (timestamp - this.motionStartedAt) / duration)
    this.applyMotion(progress)
    this.renderer.render(this.scene, this.camera)
    this.publishRenderState(progress >= 1, progress >= 1 ? 'settled' : 'animating')
    if (progress < 1) this.startLoop()
    else if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
  }

  private applyMotion(progress: number): void {
    const eased = 1 - Math.pow(1 - progress, 3)
    const state = this.sceneState
    if (!state) return

    if (state.transitionActive) {
      this.cargoGroup.position.z = 0.08 + eased * 0.72
      this.cargoGroup.position.y = Math.sin(progress * Math.PI) * 0.24
      this.cargoGroup.scale.setScalar(1 - eased * 0.14)
    } else {
      this.cargoGroup.position.set(0, 0, 0.08)
      this.cargoGroup.scale.setScalar(1)
    }

    const pulse = Math.sin(progress * Math.PI)
    const quickPulse = Math.sin(progress * Math.PI * 2) * (1 - progress)
    this.statusRing.scale.set(1 + pulse * 0.018, 0.25 + pulse * 0.01, 1 + pulse * 0.018)
    if (this.reaction.kind === 'incorrect') this.cargoGroup.position.x = quickPulse * 0.11
    else this.cargoGroup.position.x = 0

    this.cargoGroup.traverse((object) => {
      const roles = object.userData.motionRoles as MotionRole[] | undefined
      const homePosition = object.userData.homePosition as THREE.Vector3 | undefined
      const homeScale = object.userData.homeScale as THREE.Vector3 | undefined
      if (!roles?.length || !homePosition || !homeScale) return
      object.position.copy(homePosition)
      object.scale.copy(homeScale)
      object.rotation.z = 0

      if (roles.includes('base-seat') && this.reaction.kind === 'base-seat') {
        object.position.y += (1 - eased) * 0.62 + pulse * 0.08
        object.scale.multiplyScalar(0.72 + eased * 0.28)
      } else if (roles.includes('codon') && this.reaction.kind === 'codon-advance') {
        object.position.y += pulse * 0.13
        object.scale.multiplyScalar(1 + pulse * 0.14)
      } else if (roles.includes('pending-amino') && this.reaction.kind === 'pending-amino') {
        object.position.y += (1 - eased) * 0.72 + pulse * 0.11
        object.scale.multiplyScalar(0.62 + eased * 0.38)
      } else if (roles.includes('chain-link') && this.reaction.kind === 'chain-link') {
        object.position.x += (1 - eased) * 0.46
        object.scale.multiplyScalar(0.58 + eased * 0.42)
      } else if (roles.includes('stop-gate') && this.reaction.kind === 'stop-gate') {
        object.scale.set(homeScale.x * (0.72 + eased * 0.28), homeScale.y * (1 + pulse * 0.2), homeScale.z)
      } else if (roles.includes('function-preview') && this.reaction.kind === 'function-preview') {
        object.position.y += (1 - eased) * 0.25 + pulse * 0.08
        object.scale.multiplyScalar(0.78 + eased * 0.22)
      } else if (roles.includes('repair-target') && this.reaction.kind === 'repair') {
        object.scale.multiplyScalar(1 + pulse * 0.22)
        object.rotation.z = quickPulse * 0.12
      } else if (roles.includes('variant') && (this.reaction.kind === 'variant-change' || this.reaction.kind === 'machine-change')) {
        object.scale.multiplyScalar(1 + pulse * 0.2)
      }
    })

    if (this.reaction.kind === 'confirmed') {
      this.cargoGroup.position.y += pulse * 0.16
      this.statusRing.scale.multiplyScalar(1 + pulse * 0.035)
    } else if (this.reaction.kind === 'repair') {
      this.statusRing.scale.multiplyScalar(1 + pulse * 0.025)
    }

    const activeMachine = this.machineRecords.find((record) => record.action === state.activeAction)
    if (activeMachine) {
      activeMachine.mover.rotation.y = quickPulse * (this.reaction.kind === 'incorrect' ? 0.08 : 0.035)
      activeMachine.mover.position.y = pulse * (this.reaction.kind === 'confirmed' ? 0.1 : 0.045)
    }
  }

  private renderNow(settled = true): void {
    if (!this.contextAvailable || this.disposed) return
    this.renderer.render(this.scene, this.camera)
    this.publishRenderState(settled, settled ? 'settled' : 'animating')
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))
    this.renderer.setPixelRatio(rendererPixelRatio(width, height, window.devicePixelRatio || 1, this.coarsePointer))
    const aspect = width / height
    const target = new THREE.Vector3(0, 0.35, -0.35)
    const viewDirection = new THREE.Vector3(0, 7.05, 11.15).normalize()
    this.camera.aspect = aspect
    this.camera.fov = aspect < 1 ? 54 : 39
    const requiredDistance = 15.4 / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * aspect)
    this.camera.position.copy(target).addScaledVector(viewDirection, Math.max(13.2, requiredDistance))
    this.camera.lookAt(target)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.renderNow(performance.now() >= this.motionEndsAt)
  }

  private handleVisibility = (): void => {
    if (document.hidden) {
      this.finishMotion()
      return
    }
    this.renderNow()
    this.startLoop()
  }

  private handleMotionPreference = (event: MediaQueryListEvent): void => {
    this.reduceMotion = event.matches
    if (this.reduceMotion) this.finishMotion()
  }

  private handleContextLost = (event: Event): void => {
    event.preventDefault()
    this.contextAvailable = false
    cancelAnimationFrame(this.animationFrame)
    this.animationFrame = 0
    if (this.settleTimer !== null) clearTimeout(this.settleTimer)
    this.settleTimer = null
    this.publishRenderState(false, 'context-lost')
    this.onContextLost?.()
  }

  private handleContextRestored = (): void => {
    if (this.disposed) return
    this.contextAvailable = true
    this.resize()
    this.onContextRestored?.()
    this.startLoop()
  }

  private publishRenderState(settled: boolean, phase: string): void {
    this.container.dataset.renderPhase = phase
    this.container.dataset.renderRevision = String(this.renderRevision)
    this.container.dataset.renderSettled = String(settled)
    if (phase === 'animating' || phase === 'settled') {
      this.container.dataset.renderFrameRevision = String(this.renderRevision)
    }
  }

  private finishMotion(): void {
    if (this.disposed || !this.contextAvailable) return
    cancelAnimationFrame(this.animationFrame)
    this.animationFrame = 0
    if (this.settleTimer !== null) clearTimeout(this.settleTimer)
    this.settleTimer = null
    this.applyMotion(1)
    this.renderNow(true)
  }
}

function deriveSceneReaction(
  previous: FactorySceneSnapshot | null,
  next: FactorySceneSnapshot,
): SceneReaction {
  if (!previous) return { kind: 'idle', duration: 0, index: null }

  const feedbackChanged = previous.feedbackTitle !== next.feedbackTitle || previous.statusKind !== next.statusKind
  if (next.statusKind === 'error' && feedbackChanged) {
    return { kind: 'incorrect', duration: 300, index: next.repairTarget?.index ?? null }
  }
  if (next.repairTarget && (!previous.repairTarget || !sameRepair(previous.repairTarget, next.repairTarget))) {
    return { kind: 'repair', duration: 320, index: next.repairTarget.index }
  }
  if (next.stageComplete && !previous.stageComplete) {
    return { kind: 'confirmed', duration: next.transitionActive ? 820 : 620, index: null }
  }

  if (previous.activeAction !== next.activeAction || previous.sequenceIndex !== next.sequenceIndex) {
    return { kind: 'machine-change', duration: next.transitionActive ? 780 : 340, index: next.changedDnaIndex }
  }

  if (next.activeAction === 'transcription' && previous.mrna !== next.mrna) {
    const changedIndex = firstChangedIndex(previous.mrna, next.mrna)
    return {
      kind: previous.repairTarget && !next.repairTarget ? 'confirmed' : 'base-seat',
      duration: previous.repairTarget && !next.repairTarget ? 480 : 260,
      index: changedIndex,
    }
  }

  if (next.activeAction === 'translation') {
    if (previous.pendingAminoAcid !== next.pendingAminoAcid && next.pendingAminoAcid) {
      return next.pendingAminoAcid === 'Stop'
        ? { kind: 'stop-gate', duration: 320, index: 4 }
        : { kind: 'pending-amino', duration: 280, index: next.currentCodonIndex }
    }
    if (previous.aminoAcidChain.join('|') !== next.aminoAcidChain.join('|')) {
      const changedIndex = next.aminoAcidChain.findIndex((value, index) => value !== previous.aminoAcidChain[index])
      return { kind: 'chain-link', duration: 340, index: Math.max(0, changedIndex) }
    }
    if (previous.currentCodonIndex !== next.currentCodonIndex || previous.activeCodon !== next.activeCodon) {
      return next.currentCodonIndex >= 4
        ? { kind: 'stop-gate', duration: 320, index: 4 }
        : { kind: 'codon-advance', duration: 260, index: next.currentCodonIndex }
    }
  }

  if (next.activeAction === 'function-test' && previous.selectedFunctionRowId !== next.selectedFunctionRowId) {
    return { kind: 'function-preview', duration: 300, index: null }
  }

  if (next.changedDnaIndex !== null && previous.changedDnaIndex !== next.changedDnaIndex) {
    return { kind: 'variant-change', duration: 350, index: next.changedDnaIndex }
  }
  if (previous.repairTarget && !next.repairTarget) {
    return { kind: 'confirmed', duration: 480, index: previous.repairTarget.index }
  }
  if (next.statusKind === 'success' && feedbackChanged) {
    return { kind: 'confirmed', duration: next.transitionActive ? 820 : 520, index: null }
  }
  return { kind: 'idle', duration: 0, index: null }
}

function sameRepair(
  first: FactorySceneSnapshot['repairTarget'],
  second: FactorySceneSnapshot['repairTarget'],
): boolean {
  return Boolean(first && second
    && first.kind === second.kind
    && first.index === second.index
    && first.submitted === second.submitted)
}

function firstChangedIndex(previous: string, next: string): number {
  const length = Math.max(previous.length, next.length)
  for (let index = 0; index < length; index += 1) {
    if (previous[index] !== next[index]) return index
  }
  return Math.max(0, next.length - 1)
}

function markMotionTarget(object: THREE.Object3D, role: MotionRole): void {
  const roles = (object.userData.motionRoles as MotionRole[] | undefined) ?? []
  if (!roles.includes(role)) roles.push(role)
  object.userData.motionRoles = roles
  object.userData.homePosition = object.position.clone()
  object.userData.homeScale = object.scale.clone()
}

function mesh<G extends THREE.BufferGeometry, M extends THREE.Material>(
  geometry: G,
  material: M,
  [x, y, z]: [number, number, number],
): THREE.Mesh<G, M> {
  const result = new THREE.Mesh(geometry, material)
  result.position.set(x, y, z)
  return result
}

function sequenceSpacing(length: number, maxWidth: number, maxSpacing: number): number {
  return length > 1 ? Math.min(maxSpacing, maxWidth / (length - 1)) : maxSpacing
}

function complementaryDnaBase(base: string): string {
  if (base === 'A') return 'T'
  if (base === 'T') return 'A'
  if (base === 'C') return 'G'
  if (base === 'G') return 'C'
  return ''
}

function aminoColor(aminoAcid: string): number {
  let hash = 0
  for (let index = 0; index < aminoAcid.length; index += 1) hash = (hash * 31 + aminoAcid.charCodeAt(index)) >>> 0
  const palette = [0x2b7db2, 0x209276, 0xd09a32, 0xb64f5d, 0x8260a8, 0x4b8792]
  return palette[hash % palette.length]
}

function sceneDescription(state: FactorySceneSnapshot): string {
  const repair = state.repairTarget ? ` Repair needed at ${state.repairTarget.label}.` : ''
  const feedback = state.feedbackTitle ? ` ${state.feedbackTitle}. ${state.feedbackMessage}` : ''
  const actionState = state.activeAction === 'transcription'
    ? ` The mRNA product contains ${state.mrna.length} of ${state.dnaStrand.length} bases.`
    : state.activeAction === 'translation'
      ? state.activeCodon
        ? ` Active codon ${state.activeCodon}.${state.pendingAminoAcid ? ` Pending amino acid ${state.pendingAminoAcid}.` : ''}${state.currentCodonIndex === 4 ? ' Stop is a signal and is not added to the amino acid chain.' : ''}`
        : ''
      : state.selectedFunction
        ? ` Provisional assay outcome: ${state.selectedFunction.proteinFunction}, ${state.selectedFunction.expressedTrait}.`
        : ' No assay outcome selected.'
  return `${state.cargoLabel}. ${state.activeStationLabel} action.${actionState}${repair}${feedback}`.trim()
}

function clearGroup(group: THREE.Group): void {
  group.clear()
}

function hasCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

function disposeSceneResources(
  scene: THREE.Scene,
  geometryPool: Map<string, THREE.BufferGeometry>,
  materialPool: Map<string, THREE.MeshStandardMaterial>,
): void {
  const geometries = new Set<THREE.BufferGeometry>(geometryPool.values())
  const materials = new Set<THREE.Material>(materialPool.values())
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    geometries.add(object.geometry)
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]
    meshMaterials.forEach((material) => materials.add(material))
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
  geometryPool.clear()
  materialPool.clear()
}
