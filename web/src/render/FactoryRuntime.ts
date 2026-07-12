import * as THREE from 'three'
import type { StationId } from '../types'
import type { FactorySceneSnapshot, ProteinComparison } from './adapters/sceneState'

interface FactoryRuntimeOptions {
  container: HTMLElement
  onContextLost?: () => void
  onContextRestored?: () => void
  onStationSelect: (stationId: StationId) => void
}

interface StationRecord {
  stationId: StationId
  body: THREE.Mesh
  hitbox: THREE.Mesh
  indicator: THREE.Mesh
  baseColor: THREE.Color
  baseY: number
}

const stationPositions: Record<StationId, THREE.Vector3> = {
  'dna-dock': new THREE.Vector3(-4.5, 0, -2.7),
  'transcription-press': new THREE.Vector3(4.5, 0, -2.7),
  'ribosome-galley': new THREE.Vector3(-4.5, 0, 2.45),
  'trait-vault': new THREE.Vector3(4.5, 0, 2.45),
}

const stationColors: Record<StationId, number> = {
  'dna-dock': 0x2878b8,
  'transcription-press': 0xd68422,
  'ribosome-galley': 0x16856f,
  'trait-vault': 0xb94d58,
}

const baseColors: Record<string, number> = {
  A: 0xe8a82e,
  T: 0x2878b8,
  U: 0x8b5fbf,
  C: 0x1b9a78,
  G: 0xd85754,
}

export class FactoryRuntime {
  private readonly container: HTMLElement
  private readonly onContextLost?: () => void
  private readonly onContextRestored?: () => void
  private readonly onStationSelect: (stationId: StationId) => void
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100)
  private readonly timer = new THREE.Timer()
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly stationRecords: StationRecord[] = []
  private readonly cargoGroup = new THREE.Group()
  private readonly resizeObserver: ResizeObserver
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  private animationFrame = 0
  private lastFrameAt = 0
  private sceneState: FactorySceneSnapshot | null = null
  private disposed = false
  private contextAvailable = true

  constructor({
    container,
    onContextLost,
    onContextRestored,
    onStationSelect,
  }: FactoryRuntimeOptions) {
    this.container = container
    this.onContextLost = onContextLost
    this.onContextRestored = onContextRestored
    this.onStationSelect = onStationSelect
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
      premultipliedAlpha: false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setClearColor(0xdcebed, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.domElement.className = 'factory-canvas'
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D cell laboratory')
    this.container.appendChild(this.renderer.domElement)

    this.camera.position.set(0, 8.7, 10.8)
    this.camera.lookAt(0, 0.45, 0)
    this.createLab()
    this.scene.add(this.cargoGroup)

    this.timer.connect(document)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.container)
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost)
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored)
    document.addEventListener('visibilitychange', this.handleVisibility)
    this.resize()
    this.startLoop()
  }

  setState(sceneState: FactorySceneSnapshot): void {
    this.sceneState = sceneState
    const completed = new Set(sceneState.completedStationIds)

    this.stationRecords.forEach((record) => {
      const material = record.body.material
      if (!(material instanceof THREE.MeshStandardMaterial)) return

      const isActive = record.stationId === sceneState.activeStationId
      const isSelected = record.stationId === sceneState.selectedStationId
      const isComplete = completed.has(record.stationId)
      record.indicator.visible = isActive || isComplete
      record.indicator.material = new THREE.MeshBasicMaterial({
        color: isActive ? (sceneState.repairActive ? 0xd85754 : 0xf3bd3f) : 0x4bc394,
      })

      material.color.copy(record.baseColor)
      material.emissive.set(isActive ? record.baseColor : new THREE.Color(0x000000))
      material.emissiveIntensity = isActive ? (isSelected ? 0.34 : 0.18) : 0
      record.body.scale.setScalar(isActive ? 1.06 : 1)
    })

    this.buildCargo(sceneState)
    this.renderNow()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.animationFrame)
    this.timer.dispose()
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost)
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored)
    document.removeEventListener('visibilitychange', this.handleVisibility)
    this.scene.traverse(disposeObject)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private createLab(): void {
    this.scene.background = null
    this.scene.fog = new THREE.Fog(0xdcebed, 19, 34)

    const ambient = new THREE.HemisphereLight(0xf8ffff, 0x58736e, 2.45)
    this.scene.add(ambient)
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.1)
    keyLight.position.set(-4, 9, 6)
    this.scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xcdefff, 1.4)
    fillLight.position.set(8, 5, -4)
    this.scene.add(fillLight)

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(13.6, 0.32, 8.5),
      new THREE.MeshStandardMaterial({ color: 0xeff6f5, roughness: 0.82 }),
    )
    floor.position.y = -0.34
    this.scene.add(floor)

    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(13.6, 3.4, 0.24),
      new THREE.MeshStandardMaterial({ color: 0xbfd6d8, roughness: 0.9 }),
    )
    backWall.position.set(0, 1.35, -4.1)
    this.scene.add(backWall)

    const centerBench = new THREE.Mesh(
      new THREE.BoxGeometry(5.3, 0.38, 3.4),
      new THREE.MeshStandardMaterial({ color: 0x425f69, metalness: 0.18, roughness: 0.48 }),
    )
    centerBench.position.set(0, 0.02, 0)
    this.scene.add(centerBench)

    this.addStation('dna-dock', 'DNA ASSEMBLY', 'helix')
    this.addStation('transcription-press', 'RNA PRESS', 'press')
    this.addStation('ribosome-galley', 'RIBOSOME LINE', 'ribosome')
    this.addStation('trait-vault', 'FUNCTION TEST', 'chamber')

    const roomLabel = createTextPanel('PROTEIN FACTORY  //  CELL LAB 07', 5.1, 0.42, {
      background: '#173a46',
      foreground: '#f5fbfa',
      fontSize: 42,
    })
    roomLabel.position.set(0, 2.45, -3.92)
    this.scene.add(roomLabel)
  }

  private addStation(
    stationId: StationId,
    label: string,
    shape: 'helix' | 'press' | 'ribosome' | 'chamber',
  ): void {
    const position = stationPositions[stationId]
    const color = stationColors[stationId]
    const baseColor = new THREE.Color(color)
    const group = new THREE.Group()
    group.position.copy(position)

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.02, 1.13, 0.28, 12),
      new THREE.MeshStandardMaterial({ color: 0xd9e5e2, metalness: 0.12, roughness: 0.55 }),
    )
    platform.position.y = 0.02
    group.add(platform)

    const material = new THREE.MeshStandardMaterial({ color, metalness: 0.22, roughness: 0.38 })
    const body = this.createStationBody(shape, material)
    body.position.y = 0.72
    group.add(body)

    const indicator = new THREE.Mesh(
      new THREE.TorusGeometry(1.16, 0.055, 8, 36),
      new THREE.MeshBasicMaterial({ color: 0xf3bd3f }),
    )
    indicator.rotation.x = Math.PI / 2
    indicator.position.y = 0.21
    indicator.visible = false
    group.add(indicator)

    const labelPanel = createTextPanel(label, 1.86, 0.32, {
      background: '#f8fbfa',
      foreground: '#193d48',
      fontSize: 34,
    })
    labelPanel.position.set(0, 1.62, 0)
    group.add(labelPanel)

    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 2.2, 2.4),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    )
    hitbox.position.copy(position)
    hitbox.position.y = 0.92
    hitbox.userData.stationId = stationId
    this.scene.add(hitbox)

    this.scene.add(group)
    this.stationRecords.push({ stationId, body, hitbox, indicator, baseColor, baseY: body.position.y })
  }

  private createStationBody(
    shape: 'helix' | 'press' | 'ribosome' | 'chamber',
    material: THREE.MeshStandardMaterial,
  ): THREE.Mesh {
    switch (shape) {
      case 'helix':
        return new THREE.Mesh(new THREE.TorusKnotGeometry(0.43, 0.105, 68, 8), material)
      case 'press':
        return new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.92, 0.72), material)
      case 'ribosome':
        return new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.19, 16, 30), material)
      case 'chamber':
        return new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 1.02, 14), material)
    }
  }

  private buildCargo(state: FactorySceneSnapshot): void {
    clearGroup(this.cargoGroup)

    switch (state.cargoKind) {
      case 'dna':
        this.buildDnaCargo(state.templateSequence, state.productSequence)
        break
      case 'mrna':
        this.buildRnaCargo(state.templateSequence, state.productSequence)
        break
      case 'amino-acids':
        this.buildAminoCargo(state.codons, state.aminoAcids)
        break
      case 'protein-test':
        this.buildProteinCargo(state.aminoAcids, state.proteinComparison)
        break
    }

    const stateLabel = createTextPanel(
      state.repairActive ? 'CHECK THE HIGHLIGHTED CARGO' : state.stageComplete ? 'STAGE COMPLETE' : state.activeStationLabel,
      3.6,
      0.4,
      {
        background: state.repairActive ? '#8f313c' : state.stageComplete ? '#176f62' : '#173a46',
        foreground: '#ffffff',
        fontSize: 34,
      },
    )
    stateLabel.position.set(0, 1.72, 0)
    this.cargoGroup.add(stateLabel)
  }

  private buildDnaCargo(template: string, product: string): void {
    const maxLength = Math.max(template.length, product.length, 1)
    const spacing = Math.min(0.68, 3.4 / maxLength)
    const startX = -((maxLength - 1) * spacing) / 2

    for (let index = 0; index < maxLength; index += 1) {
      const templateBase = template[index] ?? '-'
      const productBase = product[index] ?? '-'
      const x = startX + index * spacing
      this.addBaseToken(templateBase, x, 0.82, -0.38)
      this.addBaseToken(productBase, x, 0.82, 0.38, productBase === '-')

      const rung = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, 0.46),
        new THREE.MeshStandardMaterial({ color: productBase === '-' ? 0x7f9699 : 0xe3ecea, roughness: 0.6 }),
      )
      rung.position.set(x, 0.82, 0)
      this.cargoGroup.add(rung)
    }

    const label = createTextPanel(`DNA  ${template}  /  ${product || '----'}`, 3.7, 0.4, {
      background: '#eef6f5',
      foreground: '#173a46',
      fontSize: 38,
    })
    label.position.set(0, 0.24, 0)
    label.rotation.x = -Math.PI / 2
    this.cargoGroup.add(label)
  }

  private buildRnaCargo(template: string, product: string): void {
    const sequence = product.padEnd(template.length, '-')
    const spacing = Math.min(0.76, 3.6 / Math.max(sequence.length, 1))
    const startX = -((sequence.length - 1) * spacing) / 2

    sequence.split('').forEach((base, index) => {
      const token = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.18, 0.66),
        new THREE.MeshStandardMaterial({
          color: base === '-' ? 0x8ba0a2 : baseColors[base] ?? 0x597b83,
          emissive: base === '-' ? 0x000000 : baseColors[base] ?? 0x000000,
          emissiveIntensity: 0.08,
          roughness: 0.5,
        }),
      )
      token.position.set(startX + index * spacing, 0.77, 0)
      this.cargoGroup.add(token)
      const baseLabel = createTextPanel(base, 0.38, 0.3, {
        background: base === '-' ? '#71878b' : '#ffffff',
        foreground: base === '-' ? '#ffffff' : '#173a46',
        fontSize: 52,
      })
      baseLabel.position.set(startX + index * spacing, 0.9, 0.35)
      this.cargoGroup.add(baseLabel)
    })

    const label = createTextPanel(`DNA ${template}  >  mRNA ${product || 'loading'}`, 3.9, 0.4, {
      background: '#eef6f5',
      foreground: '#173a46',
      fontSize: 36,
    })
    label.position.set(0, 0.24, 0)
    label.rotation.x = -Math.PI / 2
    this.cargoGroup.add(label)
  }

  private buildAminoCargo(codons: string[], aminoAcids: string[]): void {
    const count = Math.max(codons.length, 1)
    const spacing = Math.min(1.32, 3.8 / count)
    const startX = -((count - 1) * spacing) / 2

    codons.forEach((codon, index) => {
      const aminoAcid = aminoAcids[index] || 'EMPTY'
      const loaded = Boolean(aminoAcids[index])
      const capsule = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.24, 0.42, 5, 12),
        new THREE.MeshStandardMaterial({
          color: loaded ? 0x31a98c : 0x879b9e,
          emissive: loaded ? 0x0b4c40 : 0x000000,
          emissiveIntensity: 0.16,
          roughness: 0.42,
        }),
      )
      capsule.rotation.z = Math.PI / 2
      capsule.position.set(startX + index * spacing, 0.84, 0)
      this.cargoGroup.add(capsule)

      const label = createTextPanel(`${codon}  ${aminoAcid}`, 1.06, 0.33, {
        background: loaded ? '#e9f7f2' : '#dfe7e6',
        foreground: '#173a46',
        fontSize: 31,
      })
      label.position.set(startX + index * spacing, 0.35, 0.2)
      label.rotation.x = -Math.PI / 2
      this.cargoGroup.add(label)
    })
  }

  private buildProteinCargo(aminoAcids: string[], comparison: ProteinComparison | null): void {
    const normal = this.createProteinAssay(0x2b9c80, false)
    normal.position.set(-1.08, 0.76, 0)
    this.cargoGroup.add(normal)

    const variant = this.createProteinAssay(comparison?.pigmentActive ? 0x6c4b93 : 0xd05c65, true)
    variant.position.set(1.08, 0.76, 0)
    this.cargoGroup.add(variant)

    const normalLabel = createTextPanel(`NORMAL  ${shortLabel(comparison?.normalLabel || 'protein')}`, 1.75, 0.34, {
      background: '#e9f7f2',
      foreground: '#173a46',
      fontSize: 29,
    })
    normalLabel.position.set(-1.08, 0.22, 0.2)
    normalLabel.rotation.x = -Math.PI / 2
    this.cargoGroup.add(normalLabel)

    const variantLabel = createTextPanel(`VARIANT  ${shortLabel(comparison?.variantLabel || 'comparison')}`, 1.75, 0.34, {
      background: '#f8e9eb',
      foreground: '#173a46',
      fontSize: 29,
    })
    variantLabel.position.set(1.08, 0.22, 0.2)
    variantLabel.rotation.x = -Math.PI / 2
    this.cargoGroup.add(variantLabel)

    const result = comparison?.traitLabel || `CHAIN ${aminoAcids.join('-') || 'loading'}`
    const resultLabel = createTextPanel(shortLabel(result, 36), 3.9, 0.4, {
      background: comparison?.selectedLabel ? '#173a46' : '#647b80',
      foreground: '#ffffff',
      fontSize: 31,
    })
    resultLabel.position.set(0, 1.28, 0)
    this.cargoGroup.add(resultLabel)
  }

  private createProteinAssay(color: number, variant: boolean): THREE.Group {
    const group = new THREE.Group()
    const vessel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 0.76, 18),
      new THREE.MeshStandardMaterial({ color: 0xe5efed, metalness: 0.12, roughness: 0.36 }),
    )
    group.add(vessel)
    const protein = new THREE.Mesh(
      variant ? new THREE.TorusKnotGeometry(0.24, 0.08, 42, 7) : new THREE.TorusGeometry(0.27, 0.1, 12, 24),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.14, roughness: 0.4 }),
    )
    protein.rotation.x = Math.PI / 2
    group.add(protein)
    return group
  }

  private addBaseToken(base: string, x: number, y: number, z: number, empty = false): void {
    const token = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 12),
      new THREE.MeshStandardMaterial({
        color: empty ? 0x84999c : baseColors[base] ?? 0x6b8388,
        roughness: 0.4,
      }),
    )
    token.position.set(x, y, z)
    this.cargoGroup.add(token)
  }

  private startLoop(): void {
    if (this.disposed || this.reduceMotion || document.hidden || !this.contextAvailable || this.animationFrame) return
    this.animationFrame = requestAnimationFrame(this.loop)
  }

  private loop = (timestamp: number): void => {
    this.animationFrame = 0
    if (this.disposed || document.hidden || !this.contextAvailable) return

    if (timestamp - this.lastFrameAt >= 1000 / 30) {
      this.timer.update(timestamp)
      this.animateLab(this.timer.getElapsed())
      this.renderer.render(this.scene, this.camera)
      this.lastFrameAt = timestamp
    }
    this.startLoop()
  }

  private animateLab(elapsed: number): void {
    this.stationRecords.forEach((record, index) => {
      if (record.stationId === this.sceneState?.activeStationId) {
        record.body.position.y = record.baseY + Math.sin(elapsed * 2.2 + index) * 0.035
      } else {
        record.body.position.y = record.baseY
      }
    })
    this.cargoGroup.rotation.y = Math.sin(elapsed * 0.42) * 0.018
  }

  private renderNow(): void {
    if (!this.contextAvailable || this.disposed) return
    this.renderer.render(this.scene, this.camera)
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.renderNow()
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (this.sceneState?.inputLocked) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.stationRecords.map((record) => record.hitbox), false)
    const stationId = hits[0]?.object.userData.stationId as StationId | undefined

    if (stationId && stationId === this.sceneState?.activeStationId) {
      event.preventDefault()
      this.onStationSelect(stationId)
    }
  }

  private handleVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = 0
      return
    }
    this.timer.reset()
    this.renderNow()
    this.startLoop()
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
    this.timer.reset()
    this.resize()
    this.onContextRestored?.()
    this.startLoop()
  }
}

interface TextPanelOptions {
  background: string
  foreground: string
  fontSize: number
}

function createTextPanel(
  text: string,
  width: number,
  height: number,
  { background, foreground, fontSize }: TextPanelOptions,
): THREE.Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 128
  const context = canvas.getContext('2d', { alpha: false })
  if (context) {
    context.fillStyle = background
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = foreground
    context.font = `700 ${fontSize}px Arial, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 28)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: 0xffffff, map: texture, side: THREE.DoubleSide }),
  )
  return panel
}

function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children.pop()
    if (!child) continue
    child.traverse(disposeObject)
  }
}

function disposeObject(object: THREE.Object3D): void {
  if (!(object instanceof THREE.Mesh)) return
  object.geometry.dispose()
  const materials = Array.isArray(object.material) ? object.material : [object.material]
  materials.forEach((material) => {
    if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose()
    material.dispose()
  })
}

function shortLabel(value: string, maxLength = 24): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
}
