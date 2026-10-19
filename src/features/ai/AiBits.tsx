import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

// Shared pieces of every AI surface (Ф11 11.F5): the «made with AI» mark, the
// «check before sending» note, and the light markup the model writes (`## `
// headings, `- ` and `1. ` lists, `**bold**`) with issue keys turned into links.

/** «Создано с помощью AI» chip next to anything the model produced. */
export function AiMark({
  label,
  className,
}: {
  label?: string
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300',
        className,
      )}
    >
      <Sparkles size={11} className="shrink-0" />
      {label ?? t('Создано с помощью AI')}
    </span>
  )
}

/** The reminder that a person checks AI output before it goes anywhere. */
export function AiCheckNote({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <p
      className={cn(
        'flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300',
        className,
      )}
    >
      <AlertTriangle size={13} className="mt-px shrink-0" />
      <span>
        {children ??
          t(
            'AI может ошибаться: проверьте имена, сроки и цифры перед отправкой.',
          )}
      </span>
    </p>
  )
}

const KEY = /\b[A-Z0-9]{1,10}-\d{1,9}\b/g

/** `**bold**` and linked issue keys inside one line. */
function Inline({
  text,
  link,
}: {
  text: string
  link?: (key: string) => ReactNode | null
}) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return (
    <>
      {parts.map((part, i) => {
        const bold =
          part.startsWith('**') && part.endsWith('**') && part.length > 4
        const body = bold ? part.slice(2, -2) : part
        const content: ReactNode[] = []
        let last = 0
        if (link) {
          for (const m of body.matchAll(KEY)) {
            const node = link(m[0])
            if (!node) continue
            content.push(
              body.slice(last, m.index),
              <Fragment key={m.index}>{node}</Fragment>,
            )
            last = m.index! + m[0].length
          }
        }
        content.push(body.slice(last))
        return bold ? (
          <strong key={i} className="font-semibold">
            {content}
          </strong>
        ) : (
          <Fragment key={i}>{content}</Fragment>
        )
      })}
    </>
  )
}

type Block =
  | { type: 'h'; text: string }
  | { type: 'p'; text: string }
  | { type: 'li'; ordered: string | null; items: string[] }

function blocks(text: string): Block[] {
  const out: Block[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length) out.push({ type: 'p', text: paragraph.join(' ') })
    paragraph = []
  }
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    let m: RegExpExecArray | null
    if (!line) flush()
    else if ((m = /^#{1,3}\s+(.*)$/.exec(line))) {
      flush()
      out.push({ type: 'h', text: m[1]! })
    } else if ((m = /^(?:[-*•]|(\d{1,3}[.)]))\s+(.*)$/.exec(line))) {
      flush()
      const prev = out.at(-1)
      const ordered = m[1] ? 'ol' : null
      if (prev?.type === 'li' && (prev.ordered === null) === (ordered === null))
        prev.items.push(m[2]!)
      else out.push({ type: 'li', ordered, items: [m[2]!] })
    } else paragraph.push(line)
  }
  flush()
  return out
}

/** Render the model's light markup; `link` turns an issue key into a link. */
export function AiText({
  text,
  link,
  className,
}: {
  text: string
  link?: (key: string) => ReactNode | null
  className?: string
}) {
  return (
    <div className={cn('space-y-2 text-sm leading-relaxed', className)}>
      {blocks(text).map((b, i) => {
        if (b.type === 'h')
          return (
            <h3 key={i} className="pt-1 text-sm font-semibold">
              <Inline text={b.text} link={link} />
            </h3>
          )
        if (b.type === 'li') {
          const List = b.ordered ? 'ol' : 'ul'
          return (
            <List
              key={i}
              className={cn(
                'space-y-1 pl-5',
                b.ordered ? 'list-decimal' : 'list-disc',
              )}
            >
              {b.items.map((item, j) => (
                <li key={j}>
                  <Inline text={item} link={link} />
                </li>
              ))}
            </List>
          )
        }
        return (
          <p key={i}>
            <Inline text={b.text} link={link} />
          </p>
        )
      })}
    </div>
  )
}
