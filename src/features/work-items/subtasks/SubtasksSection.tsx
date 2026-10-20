import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CornerLeftUp, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { errorText } from '@/lib/errorMessages'
import { shortName } from '@/lib/people'
import { isOwnEcho, useRealtime } from '@/lib/realtime'
import { createIssue, getIssue, getIssues, type Issue } from '@/api/issue'
import type { State } from '@/api/state'

// «Подзадачи» in the issue panel (4.F7, ADR-031): one level only. A parent lists
// its sub-issues with progress and takes new ones by name (they land in the
// project's default state); a sub-issue shows its parent instead. A distribution
// to departments has its own block (its sub-issues are the department parts).

export function SubtasksSection({
  slug,
  projectId,
  projectKey,
  issue,
  states,
  readOnly,
  onOpenIssue,
  onCreated,
  onNames,
}: {
  slug: string
  projectId: string
  projectKey: string
  issue: Issue
  states: State[]
  readOnly: boolean
  onOpenIssue?: (issueId: string) => void
  /** A sub-issue was made: the board shows it too. */
  onCreated: (child: Issue) => void
  /** «ACCR-12 Название» of the parent, for the history. */
  onNames?: (entries: [string, string][]) => void
}) {
  if (issue.parent_id) {
    return (
      <ParentLink
        slug={slug}
        projectId={projectId}
        projectKey={projectKey}
        parentId={issue.parent_id}
        onOpenIssue={onOpenIssue}
        onNames={onNames}
      />
    )
  }
  return (
    <Children
      slug={slug}
      projectId={projectId}
      projectKey={projectKey}
      issue={issue}
      states={states}
      readOnly={readOnly}
      onOpenIssue={onOpenIssue}
      onCreated={onCreated}
    />
  )
}

function ParentLink({
  slug,
  projectId,
  projectKey,
  parentId,
  onOpenIssue,
  onNames,
}: {
  slug: string
  projectId: string
  projectKey: string
  parentId: string
  onOpenIssue?: (issueId: string) => void
  onNames?: (entries: [string, string][]) => void
}) {
  const { t } = useTranslation()
  const [parent, setParent] = useState<Issue | null>(null)
  useEffect(() => {
    let cancelled = false
    getIssue(slug, projectId, parentId)
      .then((p) => {
        if (cancelled) return
        setParent(p)
        onNames?.([[p.id, `${projectKey}-${p.sequence_id} ${p.title}`]])
      })
      .catch(() => !cancelled && setParent(null))
    return () => {
      cancelled = true
    }
  }, [slug, projectId, parentId]) // eslint-disable-line react-hooks/exhaustive-deps -- onNames/projectKey: labels only
  if (!parent) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2.5 text-sm text-muted-foreground">
      <CornerLeftUp size={14} className="shrink-0" />
      <span>{t('Подзадача для')}</span>
      <button
        onClick={() => onOpenIssue?.(parent.id)}
        className="flex min-w-0 items-center gap-1.5 text-primary hover:underline"
      >
        <span className="font-mono text-xs">
          {projectKey}-{parent.sequence_id}
        </span>
        <span className="truncate">{parent.title}</span>
      </button>
    </div>
  )
}

function Children({
  slug,
  projectId,
  projectKey,
  issue,
  states,
  readOnly,
  onOpenIssue,
  onCreated,
}: {
  slug: string
  projectId: string
  projectKey: string
  issue: Issue
  states: State[]
  readOnly: boolean
  onOpenIssue?: (issueId: string) => void
  onCreated: (child: Issue) => void
}) {
  const { t } = useTranslation()
  const expected = issue._count?.children ?? 0
  const [children, setChildren] = useState<Issue[] | null>(() =>
    expected > 0 ? null : [],
  )
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = () =>
    getIssues(slug, projectId, { parent_id: issue.id, limit: 100 })
      .then((page) => page.data)
      .catch(() => null)

  async function reload() {
    const next = await load()
    if (next) setChildren(next)
  }

  // Mounted per issue; later changes come through the counter and live events.
  // Also when the count on the issue moved (a sub-issue made, moved or trashed elsewhere).
  const known = children?.length ?? null
  useEffect(() => {
    if (expected === 0 && known === null) return
    if (known !== null && expected === known) return
    let cancelled = false
    load().then((next) => {
      if (!cancelled && next) setChildren(next)
    })
    return () => {
      cancelled = true
    }
  }, [expected]) // eslint-disable-line react-hooks/exhaustive-deps

  // A sub-issue changed state or title: follow it.
  useRealtime((message) => {
    if (message.type === 'resync' || isOwnEcho(message) || !children) return
    if (children.some((c) => c.id === message.issue_id)) void reload()
  })

  const stateOf = (c: Issue) => states.find((s) => s.id === c.state_id)
  const done = (children ?? []).filter((c) => {
    const group = stateOf(c)?.group ?? c.state?.group
    return group === 'completed' || group === 'cancelled'
  }).length
  const count = children?.length ?? expected

  async function add() {
    const value = title.trim()
    if (!value || busy) return
    const state =
      states.find((s) => s.is_default) ??
      states.find((s) => s.group === 'unstarted') ??
      states[0]
    if (!state) return
    setBusy(true)
    try {
      const child = await createIssue(slug, projectId, {
        title: value,
        state_id: state.id,
        parent_id: issue.id,
      })
      setChildren((prev) => [...(prev ?? []), child])
      onCreated(child)
      setTitle('')
      inputRef.current?.focus()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось создать подзадачу')))
    } finally {
      setBusy(false)
    }
  }

  if (count === 0 && readOnly) return null

  return (
    <div className="border-b border-border p-4">
      <div className="mb-2 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('Подзадачи')}
          {count > 0 && ` · ${done}/${count}`}
        </p>
        {count > 0 && (
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={count}
            aria-valuenow={done}
            aria-label={t('Закрыто подзадач: {{done}} из {{total}}', {
              done,
              total: count,
            })}
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${(done / count) * 100}%` }}
            />
          </div>
        )}
        {!readOnly && !adding && (
          <button
            onClick={() => setAdding(true)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              count === 0 && 'ml-auto',
            )}
          >
            <Plus size={13} /> {t('Подзадача')}
          </button>
        )}
      </div>

      {children === null ? (
        <Skeleton className="h-8 w-full" />
      ) : (
        <ul className="space-y-0.5">
          {children.map((c) => {
            const state = stateOf(c)
            const closed =
              state?.group === 'completed' || state?.group === 'cancelled'
            const primary =
              c.assignees.find((a) => a.is_primary) ?? c.assignees[0]
            return (
              <li key={c.id}>
                <button
                  onClick={() => onOpenIssue?.(c.id)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: state?.color ?? '#94a3b8' }}
                    title={state?.name}
                  />
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {projectKey}-{c.sequence_id}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      closed && 'text-muted-foreground line-through',
                    )}
                  >
                    {c.title}
                  </span>
                  {primary?.user && (
                    <span title={shortName(primary.user)}>
                      <PersonAvatar
                        person={{ ...primary.user, id: primary.user_id }}
                        size={18}
                      />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {adding && (
        <div className="mt-1 flex items-center gap-2">
          <input
            ref={inputRef}
            autoFocus
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add()
              if (e.key === 'Escape') {
                setTitle('')
                setAdding(false)
              }
            }}
            onBlur={() => !title.trim() && setAdding(false)}
            placeholder={t('Название подзадачи, Enter — добавить')}
            className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}
    </div>
  )
}
