import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GripVertical, ListChecks, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { errorText } from '@/lib/errorMessages'
import { shortName } from '@/lib/people'
import { shortDate } from '@/lib/dates'
import { isOwnEcho, useRealtime } from '@/lib/realtime'
import {
  addChecklistItem,
  deleteChecklistItem,
  getChecklist,
  reorderChecklist,
  updateChecklistItem,
  type Checklist,
  type ChecklistItem,
} from '@/api/checklist'

// «Чек-лист» in the issue panel (Ф6 6.F5): the steps of a multi-step job. Tick,
// rename (click the text), drag to reorder, remove; the progress «3/7» is also on
// the card. Every answer is the whole checklist, so the list is replaced with it.
// A guest only reads (12.B4).

const MAX_ITEMS = 100

export function ChecklistSection({
  slug,
  projectId,
  issueId,
  total,
  readOnly = false,
  onChanged,
}: {
  slug: string
  projectId: string
  issueId: string
  /** The issue's own count: decides whether there is anything to load. */
  total: number
  readOnly?: boolean
  /** After a change: the issue's counters and history moved. */
  onChanged: () => void
}) {
  const { t } = useTranslation()
  // Mounted per issue (key = issue id), so the state starts fresh for each one.
  const [list, setList] = useState<Checklist | null>(() =>
    total > 0 ? null : { data: [], total: 0, done: 0 },
  )
  const [loading, setLoading] = useState(total > 0)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(
    null,
  )
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function reload() {
    const fresh = await getChecklist(slug, projectId, issueId).catch(() => null)
    if (fresh) setList(fresh)
  }

  useEffect(() => {
    if (total === 0) return
    let cancelled = false
    ;(async () => {
      const fresh = await getChecklist(slug, projectId, issueId).catch(
        () => null,
      )
      if (cancelled) return
      setList(fresh ?? { data: [], total: 0, done: 0 })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Someone else ticked or reordered: follow them.
  useRealtime((message) => {
    if (
      message.type === 'resync' ||
      message.issue_id !== issueId ||
      isOwnEcho(message)
    )
      return
    void reload()
  })

  async function run(
    promise: Promise<Checklist>,
    failMsg: string,
    rollback?: Checklist,
  ) {
    try {
      setList(await promise)
      onChanged()
    } catch (err) {
      if (rollback) setList(rollback)
      toast.error(errorText(err, failMsg))
    }
  }

  function add() {
    const value = text.trim()
    if (!value) return
    setText('')
    void run(
      addChecklistItem(slug, projectId, issueId, value),
      t('Не удалось добавить пункт'),
    )
    inputRef.current?.focus()
  }

  function toggle(item: ChecklistItem) {
    if (!list) return
    const snapshot = list
    const data = list.data.map((i) =>
      i.id === item.id ? { ...i, is_done: !i.is_done } : i,
    )
    setList({ ...list, data, done: data.filter((i) => i.is_done).length })
    void run(
      updateChecklistItem(slug, projectId, issueId, item.id, {
        is_done: !item.is_done,
      }),
      t('Не удалось отметить пункт'),
      snapshot,
    )
  }

  function rename() {
    if (!editing) return
    const value = editing.text.trim()
    const before = list?.data.find((i) => i.id === editing.id)
    setEditing(null)
    if (!value || !before || value === before.text) return
    void run(
      updateChecklistItem(slug, projectId, issueId, editing.id, {
        text: value,
      }),
      t('Не удалось переименовать пункт'),
    )
  }

  function remove(item: ChecklistItem) {
    if (!list) return
    const snapshot = list
    const data = list.data.filter((i) => i.id !== item.id)
    setList({
      data,
      total: data.length,
      done: data.filter((i) => i.is_done).length,
    })
    void run(
      deleteChecklistItem(slug, projectId, issueId, item.id),
      t('Не удалось удалить пункт'),
      snapshot,
    )
  }

  function drop(targetId: string) {
    if (!list || !dragId || dragId === targetId) return
    const snapshot = list
    const ids = list.data.map((i) => i.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    ids.splice(to, 0, ids.splice(from, 1)[0]!)
    const byId = new Map(list.data.map((i) => [i.id, i]))
    setList({ ...list, data: ids.map((id) => byId.get(id)!) })
    void (async () => {
      try {
        setList(await reorderChecklist(slug, projectId, issueId, ids))
      } catch (err) {
        setList(snapshot)
        toast.error(errorText(err, t('Не удалось переставить пункты')))
      }
    })()
  }

  const items = list?.data ?? []
  const done = list?.done ?? 0
  const count = list?.total ?? total
  // Nothing to show to a guest when there are no steps.
  if (readOnly && !loading && items.length === 0) return null
  const full = items.length >= MAX_ITEMS

  return (
    <div className="border-b border-border p-4">
      <div className="mb-2 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('Чек-лист')}
          {count > 0 && ` · ${done}/${count}`}
        </p>
        {count > 0 && (
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={count}
            aria-valuenow={done}
            aria-label={t('Выполнено пунктов: {{done}} из {{total}}', {
              done,
              total: count,
            })}
          >
            <div
              className={cn(
                'h-full rounded-full transition-all',
                done === count ? 'bg-emerald-500' : 'bg-primary',
              )}
              style={{ width: `${(done / count) * 100}%` }}
            />
          </div>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <>
          {items.length > 0 && (
            <ul className="mb-1 space-y-0.5">
              {items.map((item) => (
                <li
                  key={item.id}
                  onDragOver={(e) => {
                    if (!dragId) return
                    e.preventDefault()
                    setOverId(item.id)
                  }}
                  onDragLeave={() =>
                    setOverId((o) => (o === item.id ? null : o))
                  }
                  onDrop={(e) => {
                    e.preventDefault()
                    setOverId(null)
                    drop(item.id)
                  }}
                  className={cn(
                    'group flex items-start gap-2 rounded-md px-1 py-1 transition-colors hover:bg-accent/50',
                    overId === item.id && dragId !== item.id && 'bg-primary/10',
                    dragId === item.id && 'opacity-50',
                  )}
                >
                  {!readOnly && (
                    <span
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', item.id)
                        setDragId(item.id)
                      }}
                      onDragEnd={() => {
                        setDragId(null)
                        setOverId(null)
                      }}
                      className="mt-0.5 hidden cursor-grab text-muted-foreground/60 hover:text-muted-foreground sm:block"
                      title={t('Перетащите, чтобы изменить порядок')}
                    >
                      <GripVertical size={14} />
                    </span>
                  )}
                  <input
                    type="checkbox"
                    checked={item.is_done}
                    disabled={readOnly}
                    onChange={() => toggle(item)}
                    aria-label={item.text}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  {editing?.id === item.id ? (
                    <input
                      autoFocus
                      value={editing.text}
                      maxLength={500}
                      onChange={(e) =>
                        setEditing({ id: item.id, text: e.target.value })
                      }
                      onBlur={rename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-sm outline-none focus:border-primary"
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() =>
                        setEditing({ id: item.id, text: item.text })
                      }
                      title={
                        item.is_done && item.done_by
                          ? t('Отметил(а) {{name}}, {{date}}', {
                              name: shortName(item.done_by),
                              date: item.done_at ? shortDate(item.done_at) : '',
                            })
                          : undefined
                      }
                      className={cn(
                        'min-w-0 flex-1 break-words text-left text-sm disabled:cursor-default',
                        item.is_done && 'text-muted-foreground line-through',
                      )}
                    >
                      {item.text}
                    </button>
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      title={t('Удалить пункт')}
                      aria-label={t('Удалить пункт «{{text}}»', {
                        text: item.text,
                      })}
                    >
                      <X size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!readOnly &&
            (adding || items.length > 0 ? (
              <div className="flex items-center gap-2 px-1">
                <Plus size={14} className="shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  autoFocus={adding}
                  value={text}
                  maxLength={500}
                  disabled={full}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      add()
                    }
                    if (e.key === 'Escape' && !text) setAdding(false)
                  }}
                  onBlur={() => {
                    if (!text.trim() && items.length === 0) setAdding(false)
                  }}
                  placeholder={
                    full
                      ? t('В чек-листе не больше 100 пунктов')
                      : t('Добавить пункт…')
                  }
                  aria-label={t('Новый пункт чек-листа')}
                  className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 rounded px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ListChecks size={14} />
                {t('Добавить чек-лист')}
              </button>
            ))}
        </>
      )}
    </div>
  )
}
