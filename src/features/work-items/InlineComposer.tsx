import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Plane-style quick-add: a borderless textarea that commits on Enter and
// cancels on Escape / empty blur. Stays open after a submit so several cards can
// be added in a row.
export function InlineComposer({
  onCreate,
  onClose,
  placeholder = 'Название…',
  className,
}: {
  onCreate: (title: string) => void
  onClose: () => void
  placeholder?: string
  className?: string
}) {
  const [title, setTitle] = useState('')
  // Escape unmounts the textarea, which fires onBlur — this flag stops that
  // blur from submitting the text the user just chose to discard.
  const cancelling = useRef(false)

  function submit() {
    const value = title.trim()
    if (!value) return
    onCreate(value)
    setTitle('')
  }

  return (
    <textarea
      autoFocus
      rows={2}
      value={title}
      placeholder={placeholder}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          submit()
        }
        if (e.key === 'Escape') {
          cancelling.current = true
          onClose()
        }
      }}
      onBlur={() => {
        if (cancelling.current) {
          cancelling.current = false
          return
        }
        if (title.trim()) submit()
        onClose()
      }}
      className={cn(
        'w-full resize-none rounded-md border border-border bg-card p-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary',
        className,
      )}
    />
  )
}
