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
  private readonly machineRecords: MachineRecord[] = []
  private readonly resizeObserver: ResizeObserver
  private readonly motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly statusRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>
  private readonly progressFill: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  private animationFrame = 0
  private motionStartedAt = 0
  private motionEndsAt = 0
  private sceneState: FactorySceneSnapshot | null = null
  private disposed = false
  private contextAvailable = true
  private reduceMotion = this.motionPreference.matches

  constructor({ container, onContextLost, onContextRestored }: FactoryRuntimeOptions) {
    this.container = container
    this.onContextLost = onContextLost
    this.onContextRestored = onContextRestored
    this.renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: true,
      powerPreference: 'low-power',
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setClearColor(0xdcebed, 1)
    this.renderer.domElement.className = 'factory-canvas'
    this.renderer.domElement.style.pointerEvents = 'none'
    this.renderer.domElement.setAttribute('aria-label', 'Three-dimensional protein factory laboratory bench')
    this.renderer.domElement.setAttribute('role', 'img')
    this.container.appendChild(this.renderer.domElement)

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
    this.sceneState = sceneState
    this.updateMachines(sceneState.activeAction)
    this.updateStatus(sceneState.statusKind, sceneState.repairActive)
    this.updateProgress(sceneState.progress)
    this.buildCargo(sceneState)
    this.buildComparisonTray(sceneState.completedProducts)
    this.renderer.domElement.setAttribute('aria-label', sceneDescription(sceneState))

    const transitionStarted = sceneState.transitionActive && !previousState?.transitionActive
    const feedbackChanged = sceneState.statusKind !== 'info'
      && (previousState?.feedbackTitle !== sceneState.feedbackTitle || previousState?.statusKind !== sceneState.statusKind)
    const duration = transitionStarted ? 1100 : feedbackChanged ? 650 : 0
    this.beginMotion(duration)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost)
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored)
    document.removeEventListener('visibilitychange', this.handleVisibility)
    this.motionPreference.removeEventListener('change', this.handleMotionPreference)
    this.scene.traverse(disposeObject)
    this.renderer.dispose()
    this.renderer.domElement.remove()
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

    this.addMachine('transcription', -4.25)
    this.addMachine('translation', 0)
    this.addMachine('function-test', 4.25)

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

  private addMachine(action: ProductionAction, x: number): void {
    const group = new THREE.Group()
    group.position.set(x, 0.4, -1.65)
    const mutedMaterial = new THREE.MeshStandardMaterial({ color: 0x789093, metalness: 0.25, roughness: 0.5 })
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x3c555c, metalness: 0.32, roughness: 0.42 })

    const base = mesh(new THREE.BoxGeometry(2.25, 0.25, 1.22), darkMaterial, [0, 0, 0])
    group.add(base)
    const mover = new THREE.Group()
    group.add(mover)

    if (action === 'transcription') {
      const leftPost = mesh(new THREE.BoxGeometry(0.28, 1.1, 0.38), mutedMaterial, [-0.78, 0.63, 0])
      const rightPost = mesh(new THREE.BoxGeometry(0.28, 1.1, 0.38), mutedMaterial, [0.78, 0.63, 0])
      const roller = mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.35, 18), darkMaterial, [0, 0.67, 0])
      roller.rotation.z = Math.PI / 2
      mover.add(leftPost, rightPost, roller)
    } else if (action === 'translation') {
      const lower = mesh(new THREE.SphereGeometry(0.68, 22, 14), mutedMaterial, [0, 0.42, 0])
      lower.scale.set(1.18, 0.56, 0.82)
      const upper = mesh(new THREE.SphereGeometry(0.61, 22, 14), darkMaterial, [0, 0.9, -0.05])
      upper.scale.set(1.06, 0.48, 0.74)
      mover.add(lower, upper)
    } else {
      const chamber = mesh(new THREE.CylinderGeometry(0.62, 0.72, 1.2, 20), mutedMaterial, [0, 0.65, 0])
      const core = mesh(
        new THREE.TorusKnotGeometry(0.25, 0.07, 50, 8),
        new THREE.MeshStandardMaterial({ color: 0xaab8b7, roughness: 0.38 }),
        [0, 0.65, 0],
      )
      mover.add(chamber, core)
    }

    const lampMaterial = new THREE.MeshStandardMaterial({ color: 0x718689, emissive: 0x000000, roughness: 0.35 })
    const lamp = mesh(new THREE.SphereGeometry(0.12, 14, 10), lampMaterial, [0.88, 0.24, 0.47])
    group.add(lamp)
    this.labGroup.add(group)
    this.machineRecords.push({ action, group, lamp, mover })
  }

  private updateMachines(activeAction: ProductionAction): void {
    this.machineRecords.forEach((record) => {
      const active = record.action === activeAction
      const color = actionColors[record.action]
      record.group.scale.setScalar(active ? 1.04 : 1)
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
      this.buildDna(state.dnaStrand, state.repairTarget?.kind === 'base' ? state.repairTarget.index : null)
      this.buildMrna(state.mrna, state.dnaStrand.length, state.repairTarget?.kind === 'base' ? state.repairTarget.index : null)
    } else if (state.activeAction === 'translation') {
      const repairCodon = state.repairTarget?.kind === 'codon' ? state.repairTarget.index : null
      this.buildMrna(state.mrna, state.mrna.length, repairCodon === null ? null : repairCodon * 3, repairCodon)
      this.buildAminoChain(state.aminoAcidChain, repairCodon, state.currentCodonIndex)
    } else {
      this.buildAminoChain(state.aminoAcidChain, null, -1)
      this.buildFunctionAssay(state)
    }
  }

  private buildDna(sequence: string, repairIndex: number | null): void {
    const spacing = sequenceSpacing(sequence.length, 7.1, 0.48)
    const startX = -((Math.max(sequence.length, 1) - 1) * spacing) / 2

    sequence.split('').forEach((base, index) => {
      const phase = index * 0.72
      const yOffset = Math.sin(phase) * 0.1
      const firstZ = -0.48 + Math.cos(phase) * 0.1
      const secondZ = -0.02 - Math.cos(phase) * 0.1
      const highlight = repairIndex === index
      const first = molecularToken(base, highlight, 'sphere')
      const second = molecularToken(complementaryDnaBase(base), highlight, 'sphere')
      first.position.set(startX + index * spacing, 0.96 + yOffset, firstZ)
      second.position.set(startX + index * spacing, 0.96 - yOffset, secondZ)
      this.cargoGroup.add(first, second)
      this.cargoGroup.add(connectorBetween(first.position, second.position, highlight ? 0xc95656 : 0xaebfbd, 0.025))
    })
  }

  private buildMrna(sequence: string, expectedLength: number, repairIndex: number | null, repairCodon: number | null = null): void {
    const length = Math.max(sequence.length, expectedLength, 1)
    const spacing = sequenceSpacing(length, 7.2, 0.48)
    const startX = -((length - 1) * spacing) / 2

    for (let index = 0; index < length; index += 1) {
      const base = sequence[index] ?? ''
      const codonHighlighted = repairCodon !== null && Math.floor(index / 3) === repairCodon
      const token = molecularToken(base, repairIndex === index || codonHighlighted, 'box')
      token.position.set(startX + index * spacing, 0.72, 0.56)
      this.cargoGroup.add(token)
    }
  }

  private buildAminoChain(aminoAcids: string[], repairIndex: number | null, currentIndex: number): void {
    const length = Math.max(4, aminoAcids.length)
    const spacing = 0.92
    const startX = -((length - 1) * spacing) / 2
    let previousPosition: THREE.Vector3 | null = null
    for (let index = 0; index < length; index += 1) {
      const loaded = Boolean(aminoAcids[index]) && aminoAcids[index] !== 'Stop'
      const active = repairIndex === index || (repairIndex === null && currentIndex === index)
      const color = loaded ? aminoColor(aminoAcids[index]) : 0x829497
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: active ? color : 0x000000,
        emissiveIntensity: active ? 0.42 : 0,
        roughness: 0.38,
      })
      const token = new THREE.Mesh(new THREE.IcosahedronGeometry(loaded ? 0.28 : 0.22, 1), material)
      token.position.set(startX + index * spacing, 1.23 + Math.sin(index * 1.4) * 0.1, 0.12)
      this.cargoGroup.add(token)
      if (previousPosition) this.cargoGroup.add(connectorBetween(previousPosition, token.position, 0x627c80, 0.045))
      previousPosition = token.position.clone()
    }
  }

  private buildFunctionAssay(state: FactorySceneSnapshot): void {
    const selectedColor = state.selectedFunction
      ? traitColors[state.selectedFunction.traitColor]
      : 0x809496
    const vessel = mesh(
      new THREE.CylinderGeometry(0.63, 0.72, 0.92, 22),
      new THREE.MeshStandardMaterial({ color: 0xd8e5e3, metalness: 0.12, roughness: 0.34 }),
      [2.65, 0.93, 0.1],
    )
    const protein = mesh(
      new THREE.TorusKnotGeometry(0.29, 0.08, 58, 9),
      new THREE.MeshStandardMaterial({
        color: selectedColor,
        emissive: selectedColor,
        emissiveIntensity: state.selectedFunction ? 0.25 : 0.05,
        roughness: 0.36,
      }),
      [2.65, 0.96, 0.1],
    )
    protein.rotation.x = Math.PI / 2
    this.cargoGroup.add(vessel, protein)

    if (state.repairTarget?.kind === 'function-row') {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.78, 0.05, 8, 36),
        new THREE.MeshStandardMaterial({ color: 0xc95656, emissive: 0xc95656, emissiveIntensity: 0.5 }),
      )
      halo.rotation.x = Math.PI / 2
      halo.position.set(2.65, 0.49, 0.1)
      this.cargoGroup.add(halo)
    }
  }

  private buildComparisonTray(products: ProductSnapshot[]): void {
    clearGroup(this.trayProducts)
    const positions = [-3.0, 0, 3.0]
    positions.forEach((x, index) => {
      const product = products[index]
      const sequenceColor = sequenceColors[index]
      const slot = mesh(
        new THREE.CylinderGeometry(0.72, 0.78, 0.12, 24),
        new THREE.MeshStandardMaterial({ color: 0x91a5a6, metalness: 0.2, roughness: 0.48 }),
        [x, 0.49, 0],
      )
      this.trayProducts.add(slot)

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.58, 0.05, 8, 32),
        new THREE.MeshStandardMaterial({ color: sequenceColor, emissive: product ? sequenceColor : 0x000000, emissiveIntensity: product ? 0.18 : 0 }),
      )
      ring.rotation.x = Math.PI / 2
      ring.position.set(x, 0.58, 0)
      this.trayProducts.add(ring)

      const productColor = product ? traitColors[product.traitColor] : 0x7e9193
      const protein = new THREE.Mesh(
        product
          ? new THREE.TorusKnotGeometry(0.3, 0.075, 48, 8)
          : new THREE.TorusGeometry(0.29, 0.055, 8, 28),
        new THREE.MeshStandardMaterial({
          color: productColor,
          emissive: product ? productColor : 0x000000,
          emissiveIntensity: product ? 0.16 : 0,
          roughness: 0.4,
        }),
      )
      protein.rotation.x = Math.PI / 2
      protein.position.set(x, 0.81, 0)
      this.trayProducts.add(protein)
    })
  }

  private beginMotion(duration: number): void {
    cancelAnimationFrame(this.animationFrame)
    this.animationFrame = 0
    const now = performance.now()
    this.motionStartedAt = now
    this.motionEndsAt = now + (this.reduceMotion ? 0 : duration)
    this.applyMotion(duration > 0 && this.reduceMotion ? 1 : 0)
    this.renderNow()
    if (duration > 0 && !this.reduceMotion) this.startLoop()
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
    if (progress < 1) this.startLoop()
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
    this.statusRing.scale.set(1 + pulse * 0.018, 0.25 + pulse * 0.01, 1 + pulse * 0.018)
    const activeMachine = this.machineRecords.find((record) => record.action === state.activeAction)
    if (activeMachine) {
      activeMachine.mover.rotation.y = Math.sin(progress * Math.PI * 2) * 0.035
      activeMachine.mover.position.y = pulse * 0.035
    }
  }

  private renderNow(): void {
    if (!this.contextAvailable || this.disposed) return
    this.renderer.render(this.scene, this.camera)
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))
    const touchDevice = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touchDevice ? 1.25 : 1.75))
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
    this.renderNow()
  }

  private handleVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = 0
      return
    }
    this.renderNow()
    this.startLoop()
  }

  private handleMotionPreference = (event: MediaQueryListEvent): void => {
    this.reduceMotion = event.matches
    if (this.reduceMotion) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = 0
      this.applyMotion(1)
      this.renderNow()
    }
  }

  private handleContextLost = (event: Event): void => {
    event.preventDefault()
    this.contextAvailable = false
    cancelAnimationFrame(this.animationFrame)
    this.animationFrame = 0
    this.onContextLost?.()
  }

  private handleContextRestored = (): void => {
    if (this.disposed) return
    this.contextAvailable = true
    this.resize()
    this.onContextRestored?.()
    this.startLoop()
  }
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

function molecularToken(base: string, highlighted: boolean, shape: 'sphere' | 'box'): THREE.Mesh {
  const color = base ? baseColors[base] ?? 0x6f8588 : 0x829497
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: highlighted ? 0xc95656 : 0x000000,
    emissiveIntensity: highlighted ? 0.48 : 0,
    roughness: 0.38,
  })
  const geometry = shape === 'sphere'
    ? new THREE.SphereGeometry(0.13, 14, 10)
    : new THREE.BoxGeometry(0.3, 0.16, 0.3)
  return new THREE.Mesh(geometry, material)
}

function connectorBetween(start: THREE.Vector3, end: THREE.Vector3, color: number, radius: number): THREE.Mesh {
  const midpoint = start.clone().add(end).multiplyScalar(0.5)
  const direction = end.clone().sub(start)
  const connector = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5 }),
  )
  connector.position.copy(midpoint)
  connector.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  return connector
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
  return `${state.cargoLabel}. ${state.activeStationLabel} action.${repair}${feedback}`.trim()
}

function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children.pop()
    if (child) child.traverse(disposeObject)
  }
}

function disposeObject(object: THREE.Object3D): void {
  if (!(object instanceof THREE.Mesh)) return
  object.geometry.dispose()
  const materials = Array.isArray(object.material) ? object.material : [object.material]
  materials.forEach((material) => material.dispose())
}
