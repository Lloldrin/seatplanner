import { computed, ref } from 'vue'
import type { Ref } from 'vue'

/**
 * Zoom & pan for a square SVG via its viewBox: wheel zooms toward the cursor,
 * dragging the background pans, buttons zoom around the current center.
 *
 * The canvas extends `margin` units beyond the drawing's own coordinate size
 * on every side, so zoomed views can pan past the circle to labels outside it.
 */
export function useSvgZoom(svgEl: Ref<SVGSVGElement | null>, size = 800, margin = 150) {
  const ORIGIN = -margin
  const EXTENT = size + 2 * margin
  const MIN_W = EXTENT / 8
  const view = ref({ x: ORIGIN, y: ORIGIN, w: EXTENT })

  const viewBox = computed(() => `${view.value.x} ${view.value.y} ${view.value.w} ${view.value.w}`)
  const zoomed = computed(() => view.value.w < EXTENT - 0.5)

  function clamp(): void {
    const v = view.value
    v.w = Math.min(EXTENT, Math.max(MIN_W, v.w))
    v.x = Math.min(ORIGIN + EXTENT - v.w, Math.max(ORIGIN, v.x))
    v.y = Math.min(ORIGIN + EXTENT - v.w, Math.max(ORIGIN, v.y))
  }

  function clientToUser(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgEl.value
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return { x: size / 2, y: size / 2 }
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    return { x: point.x, y: point.y }
  }

  function zoomAt(clientX: number, clientY: number, factor: number): void {
    const pivot = clientToUser(clientX, clientY)
    const v = view.value
    const w = Math.min(EXTENT, Math.max(MIN_W, v.w * factor))
    const scale = w / v.w
    v.x = pivot.x - (pivot.x - v.x) * scale
    v.y = pivot.y - (pivot.y - v.y) * scale
    v.w = w
    clamp()
  }

  function zoomCenter(factor: number): void {
    const v = view.value
    const w = Math.min(EXTENT, Math.max(MIN_W, v.w * factor))
    v.x += (v.w - w) / 2
    v.y += (v.w - w) / 2
    v.w = w
    clamp()
  }

  function reset(): void {
    view.value = { x: ORIGIN, y: ORIGIN, w: EXTENT }
  }

  function onWheel(event: WheelEvent): void {
    zoomAt(event.clientX, event.clientY, event.deltaY > 0 ? 1.2 : 1 / 1.2)
  }

  /** Pan by dragging the background (guest handlers stop propagation). */
  function onPanStart(event: PointerEvent): void {
    if (!zoomed.value) return
    let last = { x: event.clientX, y: event.clientY }
    const svg = svgEl.value
    if (!svg) return
    const move = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect()
      const perPixel = view.value.w / Math.min(rect.width, rect.height)
      view.value.x -= (e.clientX - last.x) * perPixel
      view.value.y -= (e.clientY - last.y) * perPixel
      last = { x: e.clientX, y: e.clientY }
      clamp()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), {
      once: true,
    })
  }

  return { viewBox, zoomed, zoomCenter, reset, onWheel, onPanStart }
}
