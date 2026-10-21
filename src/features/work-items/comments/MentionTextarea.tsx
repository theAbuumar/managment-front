import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Textarea, type TextareaProps } from '@/components/ui/textarea'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { cn } from '@/lib/utils'
import { fullName, shortName } from '@/lib/people'
import type { WorkspaceMember } from '@/api/workspace'
import { mentionHandle } from './mention'

// A comment field with @mentions (4.F8): typing «@» and a few letters of a name
// offers colleagues; picking one inserts «@handle» — the part of their email
// before «@», which is what the backend notifies by. People without an email
// (Telegram-only accounts) cannot be mentioned, so they are not offered.

interface Query {
  /** Where «@» stands in the text. */
  at: number
  text: string
}

/** The «@…» being typed right before the caret, if any. */
function queryAt(value: string, caret: number): Query | null {
  const before = value.slice(0, caret)
  const m = /(^|[\s([{<«])@([^\s@]{0,30})$/.exec(before)
  if (!m) return null
  return { at: caret - m[2]!.length - 1, text: m[2]!.toLowerCase() }
}

type Props = Omit<TextareaProps, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  members: WorkspaceMember[]
  /** Ctrl/⌘+Enter. */
  onSubmit?: () => void
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function MentionTextarea(
    { value, onValueChange, members, onSubmit, onKeyDown, className, ...rest },
    ref,
  ) {
    const { t } = useTranslation()
    const inner = useRef<HTMLTextAreaElement>(null)
    useImperativeHandle(ref, () => inner.current!)
    const [query, setQuery] = useState<Query | null>(null)
    const [active, setActive] = useState(0)

    const options = useMemo(() => {
      if (!query) return []
      return members
        .filter((m) => !m.deactivated_at && mentionHandle(m))
        .filter((m) =>
          [fullName(m.user), m.user.display_name, mentionHandle(m) ?? '']
            .join(' ')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .includes(query.text.replace(/ё/g, 'е')),
        )
        .slice(0, 6)
    }, [members, query])
    const open = query !== null && options.length > 0

    function update(next: string, caret: number) {
      onValueChange(next)
      setQuery(queryAt(next, caret))
      setActive(0)
    }

    function pick(member: WorkspaceMember) {
      const el = inner.current
      if (!el || !query) return
      const handle = `@${mentionHandle(member)} `
      const caret = el.selectionStart ?? value.length
      const next = value.slice(0, query.at) + handle + value.slice(caret)
      onValueChange(next)
      setQuery(null)
      const pos = query.at + handle.length
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(pos, pos)
      })
    }

    return (
      <div className="relative">
        <Textarea
          ref={inner}
          value={value}
          onChange={(e) =>
            update(
              e.target.value,
              e.target.selectionStart ?? e.target.value.length,
            )
          }
          onClick={(e) =>
            setQuery(
              queryAt(value, e.currentTarget.selectionStart ?? value.length),
            )
          }
          onBlur={() => setTimeout(() => setQuery(null), 150)}
          onKeyDown={(e) => {
            if (open) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const step = e.key === 'ArrowDown' ? 1 : -1
                setActive((i) => (i + step + options.length) % options.length)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                pick(options[active]!)
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setQuery(null)
                return
              }
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onSubmit?.()
              return
            }
            onKeyDown?.(e)
          }}
          className={className}
          {...rest}
        />
        {open && (
          <div
            role="listbox"
            aria-label={t('Упомянуть')}
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md sm:right-auto sm:w-72"
          >
            {options.map((m, i) => (
              <button
                key={m.user_id}
                type="button"
                role="option"
                aria-selected={i === active}
                // mousedown, not click: the textarea must not lose the caret first.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(m)
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                  i === active ? 'bg-accent' : 'hover:bg-accent',
                )}
              >
                <PersonAvatar person={{ ...m.user, id: m.user_id }} size={20} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{shortName(m.user)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    @{mentionHandle(m)}
                    {m.position ? ` · ${m.position}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  },
)
