import * as THREE from 'three'
import type { FactorySceneState, StationId } from '../types'

interface FactoryRuntimeOptions {
  container: HTMLElement
  onStationSelect: (stationId: StationId) => void
}

interface StationRecord {
  stationId: StationId
  mesh: THREE.Mesh
  hitbox: THREE.Mesh
  halo: THREE.Mesh
  marker: THREE.Mesh
  baseColor: THREE.Color
}

const stationPositions: Record<StationId, THREE.Vector3> = {
  'dna-dock': new THREE.Vector3(-4.6, 0, -2.7),
  'transcription-press': new THREE.Vector3(4.6, 0, -2.7),
  'ribosome-galley': new THREE.Vector3(-4.5, 0, 2.8),
  'trait-vault': new THREE.Vector3(4.5, 0, 2.8),
}

const movementKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'])

export class FactoryRuntime {
  private readonly container: HTMLElement
  private readonly onStationSelect: (stationId: StationId) => void
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100)
  private readonly clock = new THREE.Clock()
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly keys = new Set<string>()
  private readonly stationRecords: StationRecord[] = []
  private readonly player: THREE.Mesh
  private readonly resizeObserver: ResizeObserver
  private cargoCrate: THREE.Mesh | null = null
  private animationFrame = 0
  private sceneState: FactorySceneState | null = null
  private disposed = false

  constructor({ container, onStationSelect }: FactoryRuntimeOptions) {
    this.container = container
    this.onStationSelect = onStationSelect
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x9bd8e8, 1)
    this.renderer.domElement.className = 'factory-canvas'
    this.container.appendChild(this.renderer.domElement)

    this.camera.position.set(0, 9.2, 9.8)
    this.camera.lookAt(0, 0, 0)

    this.player = this.createPlayer()
    this.scene.add(this.player)
    this.createScene()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.container)

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost)
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    document.addEventListener('visibilitychange', this.handleVisibility)
    this.resize()
    this.loop()
  }

  setState(sceneState: FactorySceneState): void {
    this.sceneState = sceneState
    const completed = new Set(sceneState.completedStationIds)

    this.stationRecords.forEach((record) => {
      const material = record.mesh.material
      if (!(material instanceof THREE.MeshStandardMaterial)) {
        return
      }

      const isSelected = record.stationId === sceneState.selectedStationId
      const isActive = record.stationId === sceneState.activeStationId
      const isComplete = completed.has(record.stationId)
      record.halo.visible = isSelected || isActive
      record.marker.visible = isComplete

      if (isSelected) {
        material.color.set(0xf4b23f)
        record.mesh.scale.setScalar(1.08)
      } else if (isActive) {
        material.color.set(sceneState.repairActive ? 0xe45d4d : 0x19a58c)
        record.mesh.scale.setScalar(sceneState.repairActive ? 1.1 : 1.04)
      } else if (isComplete) {
        material.color.set(0x1f6fb2)
        record.mesh.scale.setScalar(1)
      } else {
        material.color.copy(record.baseColor)
        record.mesh.scale.setScalar(1)
      }
    })
    this.updateCargoCue(sceneState)
  }

  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost)
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    document.removeEventListener('visibilitychange', this.handleVisibility)
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        disposeMaterial(object.material)
      }
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private createScene(): void {
    this.scene.background = new THREE.Color(0x9bd8e8)
    this.scene.fog = new THREE.Fog(0x9bd8e8, 22, 40)

    const ambient = new THREE.HemisphereLight(0xeaf7ff, 0x4c755e, 2.2)
    this.scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xffffff, 2.8)
    sun.position.set(-5, 8, 6)
    this.scene.add(sun)

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(12.5, 0.4, 8.2),
      new THREE.MeshStandardMaterial({ color: 0x8d633d, roughness: 0.78 }),
    )
    deck.position.y = -0.25
    this.scene.add(deck)

    const centerBelt = new THREE.Mesh(
      new THREE.BoxGeometry(9.5, 0.12, 0.68),
      new THREE.MeshStandardMaterial({ color: 0x24485b, metalness: 0.15, roughness: 0.45 }),
    )
    centerBelt.position.y = 0.08
    this.scene.add(centerBelt)

    const crossBelt = centerBelt.clone()
    crossBelt.rotation.y = Math.PI / 2
    this.scene.add(crossBelt)

    this.cargoCrate = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.34, 0.52),
      new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x000000, roughness: 0.46 }),
    )
    this.cargoCrate.position.set(0, 0.36, 0)
    this.scene.add(this.cargoCrate)

    this.addStation('dna-dock', 0x3da9fc, 'helix')
    this.addStation('transcription-press', 0xf4b23f, 'press')
    this.addStation('ribosome-galley', 0x19a58c, 'ribosome')
    this.addStation('trait-vault', 0xe45d4d, 'vault')

    const ocean = new THREE.Mesh(
      new THREE.CircleGeometry(26, 48),
      new THREE.MeshBasicMaterial({ color: 0x2b8aa1, transparent: true, opacity: 0.42 }),
    )
    ocean.rotation.x = -Math.PI / 2
    ocean.position.y = -0.55
    this.scene.add(ocean)
  }

  private addStation(stationId: StationId, color: number, shape: 'helix' | 'press' | 'ribosome' | 'vault'): void {
    const position = stationPositions[stationId]
    const baseColor = new THREE.Color(color)
    const group = new THREE.Group()
    group.position.copy(position)

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.2, 0.34, 8),
      new THREE.MeshStandardMaterial({ color: 0xefe5c8, roughness: 0.62 }),
    )
    platform.position.y = 0.08
    group.add(platform)

    const bodyMaterial = new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.45 })
    const body = this.createStationBody(shape, bodyMaterial)
    body.position.y = 0.72
    group.add(body)

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 0.45 }),
    )
    beacon.position.y = 1.72
    group.add(beacon)

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.26, 0.035, 10, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd98f, transparent: true, opacity: 0.85 }),
    )
    halo.rotation.x = Math.PI / 2
    halo.position.y = 0.3
    halo.visible = false
    group.add(halo)

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 10),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x19a58c, emissiveIntensity: 1.4 }),
    )
    marker.position.set(0.82, 1.44, 0.82)
    marker.visible = false
    group.add(marker)

    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 2.2, 2.6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
    )
    hitbox.position.copy(position)
    hitbox.position.y = 0.95
    hitbox.userData.stationId = stationId
    this.scene.add(hitbox)

    this.scene.add(group)
    this.stationRecords.push({
      stationId,
      mesh: body,
      hitbox,
      halo,
      marker,
      baseColor,
    })
  }

  private createStationBody(shape: 'helix' | 'press' | 'ribosome' | 'vault', material: THREE.MeshStandardMaterial): THREE.Mesh {
    switch (shape) {
      case 'helix':
        return new THREE.Mesh(new THREE.TorusKnotGeometry(0.44, 0.12, 72, 8), material)
      case 'press':
        return new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), material)
      case 'ribosome':
        return new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.18, 16, 28), material)
      case 'vault':
        return new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.9, 6), material)
    }
  }

  private createPlayer(): THREE.Mesh {
    const player = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 0.54, 5, 10),
      new THREE.MeshStandardMaterial({ color: 0x142236, roughness: 0.4 }),
    )
    player.position.set(0, 0.46, 0)
    return player
  }

  private loop = (): void => {
    if (this.disposed) {
      return
    }

    const delta = Math.min(this.clock.getDelta(), 0.05)
    this.updatePlayer(delta)
    this.animateStations()
    this.renderer.render(this.scene, this.camera)
    this.animationFrame = requestAnimationFrame(this.loop)
  }

  private updatePlayer(delta: number): void {
    if (this.sceneState?.inputLocked) {
      return
    }

    const direction = new THREE.Vector3()
    if (this.keys.has('w') || this.keys.has('arrowup')) direction.z -= 1
    if (this.keys.has('s') || this.keys.has('arrowdown')) direction.z += 1
    if (this.keys.has('a') || this.keys.has('arrowleft')) direction.x -= 1
    if (this.keys.has('d') || this.keys.has('arrowright')) direction.x += 1

    if (direction.lengthSq() === 0) {
      return
    }

    direction.normalize().multiplyScalar(delta * 3.25)
    this.player.position.add(direction)
    this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, -5.6, 5.6)
    this.player.position.z = THREE.MathUtils.clamp(this.player.position.z, -3.5, 3.5)
    this.player.rotation.y = Math.atan2(direction.x, direction.z)
  }

  private animateStations(): void {
    const elapsed = this.clock.elapsedTime
    this.stationRecords.forEach((record, index) => {
      if (record.stationId === this.sceneState?.activeStationId) {
        const speed = this.sceneState.repairActive ? 5 : 3
        record.mesh.position.y = 0.72 + Math.sin(elapsed * speed + index) * 0.07
      } else {
        record.mesh.position.y = 0.72
      }
    })

    if (this.cargoCrate) {
      const repairLift = this.sceneState?.repairActive ? Math.sin(elapsed * 6) * 0.08 : Math.sin(elapsed * 2.6) * 0.03
      this.cargoCrate.position.y = 0.36 + repairLift
      this.cargoCrate.rotation.y += this.sceneState?.repairActive ? 0.018 : 0.006
    }
  }

  private updateCargoCue(sceneState: FactorySceneState): void {
    if (!this.cargoCrate) {
      return
    }

    const material = this.cargoCrate.material
    if (!(material instanceof THREE.MeshStandardMaterial)) {
      return
    }

    if (sceneState.repairActive || sceneState.statusKind === 'error') {
      material.color.set(0xe45d4d)
      material.emissive.set(0x5a120e)
      material.emissiveIntensity = 0.65
      this.cargoCrate.scale.setScalar(1.15)
      return
    }

    if (sceneState.statusKind === 'success') {
      material.color.set(0x19a58c)
      material.emissive.set(0x0b4d41)
      material.emissiveIntensity = 0.5
      this.cargoCrate.scale.setScalar(1.12)
      return
    }

    material.color.set(0xffd166)
    material.emissive.set(0x000000)
    material.emissiveIntensity = 0
    this.cargoCrate.scale.setScalar(1 + sceneState.progress * 0.18)
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect()
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (this.sceneState?.inputLocked) {
      return
    }

    this.renderer.domElement.focus()
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.stationRecords.map((record) => record.hitbox), false)
    const stationId = hits[0]?.object.userData.stationId as StationId | undefined

    if (stationId) {
      event.preventDefault()
      this.onStationSelect(stationId)
    }
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase()

    if (shouldIgnoreKeyboard(event.target) || this.sceneState?.inputLocked) {
      return
    }

    if (movementKeys.has(key)) {
      event.preventDefault()
      this.keys.add(key)
    }

    if (key === 'e') {
      event.preventDefault()
      const nearestStation = this.findNearestStation()
      if (nearestStation) {
        this.onStationSelect(nearestStation)
      }
    }
  }

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase())
  }

  private handleVisibility = (): void => {
    if (document.hidden) {
      this.keys.clear()
    }
  }

  private handleContextLost = (event: Event): void => {
    event.preventDefault()
    cancelAnimationFrame(this.animationFrame)
    this.keys.clear()
  }

  private handleContextRestored = (): void => {
    if (!this.disposed) {
      this.resize()
      this.loop()
    }
  }

  private findNearestStation(): StationId | null {
    let nearest: StationId | null = null
    let nearestDistance = Number.POSITIVE_INFINITY

    Object.entries(stationPositions).forEach(([stationId, position]) => {
      const distance = this.player.position.distanceTo(position)
      if (distance < nearestDistance) {
        nearest = stationId as StationId
        nearestDistance = distance
      }
    })

    return nearestDistance <= 2.2 ? nearest : null
  }
}

function shouldIgnoreKeyboard(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(target.closest('input, select, textarea, button, [role="dialog"]'))
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose())
    return
  }

  material.dispose()
}
