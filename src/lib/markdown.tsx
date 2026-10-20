import { Fragment, type ReactNode } from 'react'

// A small, safe markdown for comments (4.F8, ADR-031): bold, italic, `code`,
// links (http/https only), bare URLs, bulleted and numbered lists, quotes and
// @mentions. The text is split into React elements — nothing is ever inserted
// as HTML, so markup typed into a comment is shown as text, not run.

/** Turns «@ivanov» into a name, or null to leave the handle as it is. */
export type MentionResolver = (handle: string) => string | null

// One inline token at a time, leftmost first. Order matters where two could
// start at the same place: code wins (its content is literal), then links.
const INLINE =
  /(`[^`\n]+`)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?»"'])|((?:^|(?<=[\s([{<«]))@[a-zA-Z0-9._-]*[a-zA-Z0-9])/g

function inline(
  text: string,
  mention: MentionResolver | undefined,
  key: string,
): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0
    if (start > last) out.push(text.slice(last, start))
    const k = `${key}.${n++}`
    const [token, code, link, bold, italic, url, handle] = m
    if (code) {
      out.push(
        <code
          key={k}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {code.slice(1, -1)}
        </code>,
      )
    } else if (link) {
      const split = link.indexOf('](')
      out.push(
        <a
          key={k}
          href={link.slice(split + 2, -1)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2"
        >
          {link.slice(1, split)}
        </a>,
      )
    } else if (bold) {
      out.push(<strong key={k}>{inline(bold.slice(2, -2), mention, k)}</strong>)
    } else if (italic) {
      out.push(<em key={k}>{inline(italic.slice(1, -1), mention, k)}</em>)
    } else if (url) {
      out.push(
        <a
          key={k}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary underline underline-offset-2"
        >
          {url}
        </a>,
      )
    } else if (handle) {
      const name = mention?.(handle.slice(1).toLowerCase())
      out.push(
        <span
          key={k}
          className="rounded bg-primary/10 px-1 font-medium text-primary"
          title={name ? handle : undefined}
        >
          {name ? `@${name}` : handle}
        </span>,
      )
    } else {
      out.push(token)
    }
    last = start + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Lines joined with line breaks, each with its inline markup. */
function lines(
  rows: string[],
  mention: MentionResolver | undefined,
  key: string,
): ReactNode[] {
  return rows.map((row, i) => (
    <Fragment key={`${key}.${i}`}>
      {i > 0 && <br />}
      {inline(row, mention, `${key}.${i}`)}
    </Fragment>
  ))
}

const BULLET = /^\s*[-*•]\s+/
const NUMBER = /^\s*\d+[.)]\s+/
const QUOTE = /^\s*>\s?/

export function Markdown({
  text,
  mention,
  className,
}: {
  text: string
  mention?: MentionResolver
  className?: string
}) {
  const blocks: ReactNode[] = []
  const rows = text.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  while (i < rows.length) {
    const row = rows[i]!
    if (!row.trim()) {
      i++
      continue
    }
    const key = `b${blocks.length}`
    const take = (test: RegExp) => {
      const items: string[] = []
      while (i < rows.length && test.test(rows[i]!))
        items.push(rows[i++]!.replace(test, ''))
      return items
    }
    if (BULLET.test(row) || NUMBER.test(row)) {
      const ordered = NUMBER.test(row)
      const items = take(ordered ? NUMBER : BULLET)
      const List = ordered ? 'ol' : 'ul'
      blocks.push(
        <List
          key={key}
          className={
            ordered
              ? 'list-decimal space-y-0.5 pl-5'
              : 'list-disc space-y-0.5 pl-5'
          }
        >
          {items.map((item, j) => (
            <li key={j}>{inline(item, mention, `${key}.${j}`)}</li>
          ))}
        </List>,
      )
    } else if (QUOTE.test(row)) {
      blocks.push(
        <blockquote
          key={key}
          className="border-l-2 border-border pl-3 text-muted-foreground"
        >
          {lines(take(QUOTE), mention, key)}
        </blockquote>,
      )
    } else {
      const para: string[] = []
      while (
        i < rows.length &&
        rows[i]!.trim() &&
        !BULLET.test(rows[i]!) &&
        !NUMBER.test(rows[i]!) &&
        !QUOTE.test(rows[i]!)
      ) {
        para.push(rows[i++]!)
      }
      blocks.push(<p key={key}>{lines(para, mention, key)}</p>)
    }
  }
  return <div className={className ?? 'space-y-2 break-words'}>{blocks}</div>
}
