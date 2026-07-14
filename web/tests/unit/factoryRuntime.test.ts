import { describe, expect, it } from 'vitest'
import { MAX_RENDER_PIXELS, rendererPixelRatio } from '../../src/render/FactoryRuntime'

describe('factory renderer sizing', () => {
  it('keeps coarse-pointer backing buffers within the classroom pixel budget', () => {
    const width = 1024
    const height = 768
    const ratio = rendererPixelRatio(width, height, 2, true)

    expect(ratio).toBeLessThanOrEqual(1.25)
    expect(width * height * ratio * ratio).toBeLessThanOrEqual(MAX_RENDER_PIXELS + 1)
  })

  it('allows a sharper desktop frame without exceeding the same budget', () => {
    const width = 1180
    const height = 820
    const ratio = rendererPixelRatio(width, height, 2, false)

    expect(ratio).toBeLessThanOrEqual(1.75)
    expect(width * height * ratio * ratio).toBeLessThanOrEqual(MAX_RENDER_PIXELS + 1)
  })
})
