import { computed, ref } from 'vue'
import type { Ref } from 'vue'

const TAU = Math.PI * 2

/** Angle for slot `index` of `count`, starting at 12 o'clock, clockwise. */
export function slotAngle(index: number, count: number): number {
  return (index / count) * TAU - Math.PI / 2
}

/**
 * Drag-to-reorder around a circle rendered in an SVG.
 *
 * While dragging, the guest's position is derived from the pointer's angle
 * relative to the circle center; on release the store order is updated once.
 */
export function useCircleDrag(
  svgEl: Ref<SVGSVGElement | null>,
  count: Ref<number>,
  onDrop: (fromIndex: number, toIndex: number) => void,
) {
  const dragIndex = ref<number | null>(null)
  const dragAngle = ref(0)

  // Index the dragged item would land on if released now.
  const dropIndex = computed(() => {
    if (dragIndex.value === null || count.value === 0) return null
    const turns = (dragAngle.value + Math.PI / 2) / TAU
    const slot = Math.round(turns * count.value)
    return ((slot % count.value) + count.value) % count.value
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

  /**
   * Display angle for the item currently at `index`: the dragged item follows
   * the pointer; others shift one slot to visualize the gap at the drop target.
   */
  function displayAngle(index: number): number {
    const n = count.value
    if (dragIndex.value === null || dropIndex.value === null) return slotAngle(index, n)
    if (index === dragIndex.value) return dragAngle.value

    // Where this item sits once the dragged item is removed…
    let slot = index > dragIndex.value ? index - 1 : index
    // …and shifted if the drop gap opens at or before it.
    const gap = dropIndex.value
    if (slot >= gap) slot += 1
    return slotAngle(slot, n)
  }

  return { dragIndex, dropIndex, startDrag, displayAngle }
}
