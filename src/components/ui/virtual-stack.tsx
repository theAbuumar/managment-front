import { useEffect, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

interface VirtualStackProps<T> {
  items: T[]
  getKey: (item: T) => string
  /**
   * The element that scrolls (overflow-y-auto) around the stack. Pass it from a
   * callback ref kept in state (`ref={setEl}`): a plain ref object is attached
   * after this child's effects run, so the stack would never see it.
   */
  scrollElement: HTMLElement | null
  /** First guess of an item's height in px; real heights are measured. */
  estimateSize: (item: T) => number
  /** Space between items in px (the plain layout uses the same gap). */
  gap?: number
  /**
   * Up to this many items everything is rendered as plain DOM: a demo-sized
   * project looks and behaves exactly as before. Above it only the visible
   * items (plus a margin) are in the DOM.
   */
  threshold?: number
  render: (item: T, index: number) => ReactNode
  /**
   * Keep the item with this key in view (centred) while set — also as items are
   * added before it. A small list relies on the item's own autofocus instead.
   */
  scrollToKey?: string | null
}

// A vertical list that renders only what is on screen once it gets long (12.F4):
// a project with a few thousand tasks keeps the board and the list responsive.
// Heights are measured after render, so items of different heights are fine.
export function VirtualStack<T>({
  items,
  getKey,
  scrollElement,
  estimateSize,
  gap = 0,
  threshold = 100,
  render,
  scrollToKey = null,
}: VirtualStackProps<T>) {
  const virtual = items.length > threshold
  // React Compiler is not used here; the hook is fine for plain React.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: (i) => estimateSize(items[i]!),
    getItemKey: (i) => getKey(items[i]!),
    gap,
    overscan: 8,
    enabled: virtual,
  })

  const targetIndex =
    virtual && scrollToKey
      ? items.findIndex((item) => getKey(item) === scrollToKey)
      : -1
  useEffect(() => {
    if (targetIndex >= 0)
      virtualizer.scrollToIndex(targetIndex, { align: 'center' })
  }, [targetIndex, virtualizer])

  if (!virtual) {
    return (
      <div className="flex flex-col" style={{ gap }}>
        {items.map((item, i) => (
          <div key={getKey(item)}>{render(item, i)}</div>
        ))}
      </div>
    )
  }

  return (
    <div
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className="absolute left-0 top-0 w-full"
          style={{ transform: `translateY(${row.start}px)` }}
        >
          {render(items[row.index]!, row.index)}
        </div>
      ))}
    </div>
  )
}
