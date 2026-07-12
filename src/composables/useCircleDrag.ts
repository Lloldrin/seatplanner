import { computed, ref } from 'vue'
import type { Ref } from 'vue'

const TAU = Math.PI * 2

/** Angle for slot `index` of `count`, starting at 12 o'clock, clockwise. */
export function slotAngle(index: number, count: number): number {
  return (index / count) * TAU - Math.PI / 2
}

/**
 * Drag a guest between fixed seat slots around a circle rendered in an SVG.
 *
 * Slots never move: the dragged name follows the pointer and `dropIndex` is
 * the slot it would land on if released now (for a drop-target indicator).
 */
export function useCircleDrag(
  svgEl: Ref<SVGSVGElement | null>,
  slotCount: Ref<number>,
  onDrop: (fromSlot: number, toSlot: number) => void,
) {
  const dragIndex = ref<number | null>(null)
  const dragAngle = ref(0)

  const dropIndex = computed(() => {
    if (dragIndex.value === null || slotCount.value === 0) return null
    const turns = (dragAngle.value + Math.PI / 2) / TAU
    const slot = Math.round(turns * slotCount.value)
    return ((slot % slotCount.value) + slotCount.value) % slotCount.value
  })

  function pointerAngle(event: PointerEvent): number {
    const svg = svgEl.value
    if (!svg) return 0
    const rect = svg.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    return Math.atan2(event.clientY - cy, event.clientX - cx)
  }

  function startDrag(index: number, event: PointerEvent) {
    dragIndex.value = index
    dragAngle.value = pointerAngle(event)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  function onMove(event: PointerEvent) {
    dragAngle.value = pointerAngle(event)
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove)
    if (dragIndex.value !== null && dropIndex.value !== null && dropIndex.value !== dragIndex.value) {
      onDrop(dragIndex.value, dropIndex.value)
    }
    dragIndex.value = null
  }

  /** Display angle: the dragged item follows the pointer, all others stay put. */
  function displayAngle(index: number): number {
    if (dragIndex.value === index) return dragAngle.value
    return slotAngle(index, slotCount.value)
  }

  return { dragIndex, dropIndex, startDrag, displayAngle }
}
