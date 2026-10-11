<template>
  <div ref="host" class="layer-field" :data-effect="effect" @pointermove="move" @pointerleave="reset">
    <div class="layer-backdrop" aria-hidden="true">
      <div class="layer-static" />
      <canvas ref="canvas" class="layer-canvas" aria-hidden="true" />
    </div>
    <slot />
  </div>
</template>

<script setup>
  import { onBeforeUnmount, onMounted, ref } from 'vue'

  const host = ref(null)
  const canvas = ref(null)
  const effect = ref('static')
  let shader
  let gpu
  let generation = 0
  let loading = false
  let disposed = false
  let visible = false
  let motion
  let finePointer
  let intersection
  let resizeObserver
  let pointerFrame = 0
  let pointer = { x: 0, y: 0 }

  const allowed = () => !disposed && !motion.matches && !navigator.connection?.saveData

  function release() {
    shader?.destroy()
    shader = undefined
    gpu?.device.destroy()
    gpu = undefined
    effect.value = 'static'
  }

  function size() {
    if (!shader || !host.value) return
    const { width, height } = canvas.value.getBoundingClientRect()
    // Decorative lines do not need a full-resolution Retina drawing buffer.
    const scale = Math.min(1, 720 / Math.max(width, height)) / Math.max(1, window.devicePixelRatio)
    shader.resize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
  }

  function reset() {
    cancelAnimationFrame(pointerFrame)
    pointerFrame = 0
    host.value?.style.removeProperty('--object-x')
    host.value?.style.removeProperty('--object-y')
    host.value?.style.removeProperty('--object-turn')
    shader?.update('layer-bend', { strength: 0.045, angle: 18 })
  }

  function move(event) {
    if (!allowed() || !finePointer.matches || event.pointerType !== 'mouse') return
    const rect = host.value.getBoundingClientRect()
    pointer = {
      x: Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2)),
      y: Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2)),
    }
    if (pointerFrame) return
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0
      host.value?.style.setProperty('--object-x', `${pointer.x * 9}px`)
      host.value?.style.setProperty('--object-y', `${pointer.y * 6}px`)
      host.value?.style.setProperty('--object-turn', `${pointer.x * 1.4}deg`)
      shader?.update('layer-bend', { strength: 0.045 + pointer.y * 0.012, angle: 18 + pointer.x * 8 })
    })
  }

  async function start() {
    if (!allowed() || !visible || document.hidden || loading || shader || !navigator.gpu) return
    loading = true
    const token = ++generation
    let instance
    let device
    try {
      const [{ createShader, createSharedDevice }, { default: stripes }, { default: wave }] = await Promise.all([
        import(/* webpackChunkName: "fdm-layer-engine" */ 'shaders/js'),
        import(/* webpackChunkName: "fdm-layer-stripes" */ 'shaders/core/Stripes'),
        import(/* webpackChunkName: "fdm-layer-wave" */ 'shaders/core/WaveDistortion'),
      ])
      if (token !== generation || !allowed()) return
      device = await createSharedDevice({ powerPreference: 'low-power' })
      if (!device || token !== generation || !allowed()) {
        device?.device.destroy()
        return
      }
      instance = await createShader(
        canvas.value,
        {
          components: [
            {
              id: 'layer-bend',
              type: 'WaveDistortion',
              props: { strength: 0.045, frequency: 1.6, speed: 0.12, angle: 18, waveType: 'sine', edges: 'mirror' },
              children: [
                {
                  id: 'layer-lines',
                  type: 'Stripes',
                  props: { colorA: '#b7a98e', colorB: '#f7f3e9', angle: 92, density: 34, balance: 0.085, softness: 0.01, speed: 0.008 },
                },
              ],
            },
          ],
        },
        {
          components: [stripes, wave],
          disableTelemetry: true,
          observeElement: false,
          gpu: device,
          colorSpace: 'srgb',
          onReady: () => {
            if (token === generation && allowed()) effect.value = 'animated'
          },
          onError: () => {
            if (token !== generation) return
            effect.value = 'static'
            // Recoverable device loss is rebuilt by the library. Terminal failures release our device.
            queueMicrotask(() => {
              if (token === generation && shader?.getFailureReason()) release()
            })
          },
        }
      )
      if (token !== generation || !allowed()) {
        instance.destroy()
        device.device.destroy()
        return
      }
      shader = instance
      gpu = device
      size()
      if (!visible || document.hidden) shader.pause()
      if (shader.getFailureReason()) release()
    } catch {
      instance?.destroy()
      device?.device.destroy()
      if (token === generation) effect.value = 'static'
    } finally {
      if (token === generation) loading = false
    }
  }

  function sync() {
    if (!allowed()) {
      ++generation
      loading = false
      release()
      reset()
    } else if (visible && !document.hidden) {
      if (shader) shader.resume()
      else start()
    } else {
      shader?.pause()
      reset()
    }
  }

  onMounted(() => {
    motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    motion.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      sync()
    })
    intersection.observe(host.value)
    resizeObserver = new ResizeObserver(size)
    resizeObserver.observe(host.value)
  })

  onBeforeUnmount(() => {
    disposed = true
    ++generation
    cancelAnimationFrame(pointerFrame)
    motion?.removeEventListener('change', sync)
    document.removeEventListener('visibilitychange', sync)
    intersection?.disconnect()
    resizeObserver?.disconnect()
    release()
  })
</script>

<style scoped>
  .layer-field {
    isolation: isolate;
  }
  .layer-backdrop {
    position: absolute;
    z-index: -1;
    inset: -2% -3% 0 -9%;
    pointer-events: none;
    overflow: hidden;
    border-radius: 50%;
    mask-image: radial-gradient(ellipse at center, #000 42%, transparent 73%);
  }
  .layer-static,
  .layer-canvas {
    position: absolute;
    inset: 0;
    width: 100% !important;
    height: 100% !important;
    opacity: 0.65;
  }
  .layer-static {
    background: repeating-linear-gradient(2deg, transparent 0 9px, #b7a98e 9px 10px);
  }
  .layer-canvas {
    opacity: 0;
    mix-blend-mode: multiply;
    transition: opacity 0.6s;
  }
  [data-effect='animated'] .layer-canvas {
    opacity: 0.8;
  }
  [data-effect='animated'] .layer-static {
    opacity: 0.22;
  }
  @media (prefers-reduced-motion: reduce) {
    .layer-canvas {
      display: none;
    }
  }
</style>
