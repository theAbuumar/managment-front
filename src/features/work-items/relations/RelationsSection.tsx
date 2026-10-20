import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Link2, Loader2, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { errorText } from '@/lib/errorMessages'
import { isOwnEcho, useRealtime } from '@/lib/realtime'
import { OPEN_GROUPS } from '@/api/state'
import {
  searchWorkspace,
  MARK_END,
  MARK_START,
  type SearchIssue,
} from '@/api/search'
import {
  createRelation,
  deleteRelation,
  getIssueRelations,
  RELATION_LABELS,
  type IssueLink,
  type IssueRelations,
  type RelationType,
} from '@/api/relation'

// «Связи» in the issue panel (4.F6, ADR-031): блокирует / блокируется / связана /
// дубликат. A link is made by finding the other issue by key («ACCR-12») or by
// words of its title — in any project the person can see. While an open issue
// blocks this one, the section (and the card on the board) says it is blocked.

const TYPES: RelationType[] = [
  'blocked_by',
  'blocks',
  'relates_to',
  'duplicates',
]

const plain = (text: string) =>
  text.split(MARK_START).join('').split(MARK_END).join('')

export function RelationsSection({
  slug,
  projectId,
  issueId,
  readOnly,
  onOpenIssue,
  onChanged,
  onNames,
}: {
  slug: string
  projectId: string
  issueId: string
  readOnly: boolean
  /** Open an issue of this project in the same panel. */
  onOpenIssue?: (issueId: string) => void
  /** After a change: the issue's counters and history moved. */
  onChanged: () => void
  /** «ACCR-12 Название» of the linked issues, for the history. */
  onNames?: (entries: [string, string][]) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [links, setLinks] = useState<IssueRelations | null>(null)
  const [adding, setAdding] = useState(false)

  async function reload() {
    const next = await getIssueRelations(slug, projectId, issueId).catch(
      () => null,
    )
    if (next) setLinks(next)
  }

  // Mounted per issue (keyed in the panel), so nothing to reset here.
  useEffect(() => {
    let cancelled = false
    getIssueRelations(slug, projectId, issueId)
      .then((next) => !cancelled && setLinks(next))
      .catch(
        () =>
          !cancelled &&
          setLinks({
            blocks: [],
            blocked_by: [],
            relates_to: [],
            duplicates: [],
          }),
      )
    return () => {
      cancelled = true
    }
  }, [slug, projectId, issueId])

  // A link made or removed from the other side, or a blocker closed elsewhere.
  useRealtime((message) => {
    if (message.type === 'resync' || isOwnEcho(message)) return
    const related = links
      ? TYPES.flatMap((k) => links[k]).some(
          (l) => l.related_issue_id === message.issue_id,
        )
      : false
    if (message.issue_id === issueId || related) void reload()
  })

  const all = links ? TYPES.flatMap((k) => links[k]) : []
  useEffect(() => {
    if (!links || !onNames) return
    onNames(
      TYPES.flatMap((k) => links[k]).map((l) => [
        l.related_issue_id,
        `${l.related_issue.project.identifier}-${l.related_issue.sequence_id} ${l.related_issue.title}`,
      ]),
    )
  }, [links]) // eslint-disable-line react-hooks/exhaustive-deps
  const blockers = (links?.blocked_by ?? []).filter((l) =>
    OPEN_GROUPS.includes(l.related_issue.state.group),
  )

  function open(link: IssueLink) {
    const other = link.related_issue
    if (other.project_id === projectId && onOpenIssue) onOpenIssue(other.id)
    else navigate(`/projects/${other.project_id}/work-items?issue=${other.id}`)
  }

  async function remove(link: IssueLink) {
    setLinks((prev) =>
      prev
        ? {
            ...prev,
            [link.relation_type]: prev[link.relation_type].filter(
              (l) => l.id !== link.id,
            ),
          }
        : prev,
    )
    try {
      await deleteRelation(slug, projectId, issueId, link.id)
      onChanged()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить связь')))
      void reload()
    }
  }

  async function add(type: RelationType, other: SearchIssue) {
    try {
      const link = await createRelation(
        slug,
        projectId,
        issueId,
        other.id,
        type,
      )
      setLinks((prev) =>
        prev ? { ...prev, [type]: [...prev[type], link] } : prev,
      )
      setAdding(false)
      onChanged()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось связать задачи')))
    }
  }

  return (
    <div className="border-b border-border p-4">
      <div className="mb-2 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('Связи')}
          {all.length > 0 && ` · ${all.length}`}
        </p>
        {!readOnly && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus size={13} /> {t('Связать')}
          </button>
        )}
      </div>

      {blockers.length > 0 && (
        <div className="mb-2 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            {t('Задача заблокирована: сначала нужно закрыть {{keys}}.', {
              keys: blockers
                .map(
                  (l) =>
                    `${l.related_issue.project.identifier}-${l.related_issue.sequence_id}`,
                )
                .join(', '),
            })}
          </span>
        </div>
      )}

      {adding && (
        <AddLink
          slug={slug}
          issueId={issueId}
          linkedIds={all.map((l) => l.related_issue_id)}
          onPick={add}
          onCancel={() => setAdding(false)}
        />
      )}

      {links === null ? (
        <Skeleton className="h-8 w-full" />
      ) : all.length === 0 ? (
        !adding && (
          <p className="text-sm text-muted-foreground">
            {t(
              'Нет связанных задач. Отметьте, что задача ждёт другую или повторяет её.',
            )}
          </p>
        )
      ) : (
        <div className="space-y-2">
          {TYPES.filter((type) => links[type].length > 0).map((type) => (
            <div key={type}>
              <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                {RELATION_LABELS[type]()}
              </p>
              <ul className="space-y-0.5">
                {links[type].map((link) => (
                  <LinkRow
                    key={link.id}
                    link={link}
                    otherProject={link.related_issue.project_id !== projectId}
                    readOnly={readOnly}
                    onOpen={() => open(link)}
                    onRemove={() => void remove(link)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LinkRow({
  link,
  otherProject,
  readOnly,
  onOpen,
  onRemove,
}: {
  link: IssueLink
  otherProject: boolean
  readOnly: boolean
  onOpen: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const other = link.related_issue
  const done =
    other.state.group === 'completed' || other.state.group === 'cancelled'
  return (
    <li className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: other.state.color }}
        title={other.state.name}
      />
      <button
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
      >
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {other.project.identifier}-{other.sequence_id}
        </span>
        <span
          className={cn(
            'truncate',
            done && 'text-muted-foreground line-through',
          )}
        >
          {other.title}
        </span>
        {otherProject && (
          <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:inline">
            · {other.project.name}
          </span>
        )}
      </button>
      {!readOnly && (
        <button
          onClick={onRemove}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
          title={t('Удалить связь')}
          aria-label={t('Удалить связь')}
        >
          <X size={13} />
        </button>
      )}
    </li>
  )
}

function AddLink({
  slug,
  issueId,
  linkedIds,
  onPick,
  onCancel,
}: {
  slug: string
  issueId: string
  linkedIds: string[]
  onPick: (type: RelationType, other: SearchIssue) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [type, setType] = useState<RelationType>('blocked_by')
  const [q, setQ] = useState('')
  // Results remember the query they answer: a shorter query shows nothing, and
  // a query still waiting for its answer shows «searching».
  const [results, setResults] = useState<{
    query: string
    issues: SearchIssue[]
  } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const seq = useRef(0)
  const query = q.trim()
  const found =
    query.length >= 2 && results?.query === query ? results.issues : null
  const searching = query.length >= 2 && results?.query !== query

  // Search as you type, the latest answer wins.
  useEffect(() => {
    if (query.length < 2) return
    const mine = ++seq.current
    const timer = setTimeout(async () => {
      const res = await searchWorkspace(slug, query, {
        types: ['issues'],
        limit: 8,
      }).catch(() => null)
      if (mine !== seq.current) return
      setResults({ query, issues: res?.issues ?? [] })
    }, 250)
    return () => clearTimeout(timer)
  }, [slug, query])

  const options = useMemo(
    () =>
      (found ?? []).filter(
        (i) => i.id !== issueId && !linkedIds.includes(i.id),
      ),
    [found, issueId, linkedIds],
  )

  return (
    <div className="mb-3 space-y-2 rounded-md border border-border p-2">
      <div
        className="flex flex-wrap gap-1"
        role="radiogroup"
        aria-label={t('Вид связи')}
      >
        {TYPES.map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={type === k}
            onClick={() => setType(k)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              type === k
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {RELATION_LABELS[k]()}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-md border border-input px-2">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
          }}
          placeholder={t('Ключ задачи (ACCR-12) или слова из названия')}
          className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {searching && (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
      {found !== null && (
        <ul className="max-h-56 overflow-y-auto">
          {options.length === 0 && !searching && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              {t('Ничего не найдено.')}
            </li>
          )}
          {options.map((i) => (
            <li key={i.id}>
              <button
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(i.id)
                  await onPick(type, i)
                  setBusy(null)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-60"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: i.state.color }}
                />
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {i.key}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {plain(i.title_hl)}
                </span>
                {busy === i.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('Отмена')}
        </Button>
      </div>
    </div>
  )
}
