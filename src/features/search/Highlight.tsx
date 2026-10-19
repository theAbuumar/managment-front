import { MARK_END, MARK_START } from '@/api/search'

const PARTS = new RegExp(`(${MARK_START}[^${MARK_END}]*${MARK_END})`)
const STRAY = new RegExp(`[${MARK_START}${MARK_END}]`, 'g')

/**
 * Text with the search matches (MARK_START … MARK_END from the backend) shown as
 * <mark>. Everything is rendered as text — user content is never HTML.
 */
export function Highlight({ text }: { text: string }) {
  return (
    <>
      {text.split(PARTS).map((part, i) =>
        part.startsWith(MARK_START) && part.endsWith(MARK_END) ? (
          <mark
            key={i}
            className="rounded-sm bg-amber-200/70 px-px text-inherit dark:bg-amber-400/25"
          >
            {part.slice(1, -1)}
          </mark>
        ) : (
          part.replace(STRAY, '')
        ),
      )}
    </>
  )
}
