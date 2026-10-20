import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FilePen, PencilLine, Send, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  deleteDraft,
  getDrafts,
  publishDraft,
  type IssueDraft,
} from '@/api/drafts'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useReadOnly } from '@/stores/summaryStore'
import { errorText } from '@/lib/errorMessages'
import { longDate, timeAgo } from '@/lib/dates'

/**
 * «Черновики» (7.F6): what the create form saved while you typed and did not
 * create. «Продолжить» reopens the form with it, «Опубликовать» creates the
 * issue as it is (same rules as the form), «Удалить» drops it. Only the author
 * sees their drafts.
 */
export function DraftsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const readOnly = useReadOnly()
  const [drafts, setDrafts] = useState<IssueDraft[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [removing, setRemoving] = useState<IssueDraft | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      setDrafts(null)
      try {
        const res = await getDrafts(slug)
        if (!cancelled) setDrafts(res.data)
      } catch (err) {
        if (cancelled) return
        toast.error(errorText(err, t('Не удалось загрузить черновики')))
        setDrafts([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, t])

  async function publish(draft: IssueDraft) {
    if (!slug || busy) return
    setBusy(draft.id)
    try {
      const issue = await publishDraft(slug, draft.id)
      setDrafts((prev) => prev?.filter((d) => d.id !== draft.id) ?? null)
      const key = `${draft.project?.identifier}-${issue.sequence_id}`
      toast.success(
        issue.kind === 'assignment'
          ? t('Поручение {{key}} создано', { key })
          : t('Задача {{key}} создана', { key }),
        {
          action: {
            label: t('Открыть'),
            onClick: () =>
              navigate(
                `/projects/${issue.project_id}/work-items?issue=${issue.id}`,
              ),
          },
        },
      )
    } catch (err) {
      toast.error(errorText(err, t('Не удалось опубликовать черновик')))
    } finally {
      setBusy(null)
    }
  }

  async function remove(draft: IssueDraft) {
    if (!slug) return
    const snapshot = drafts
    setDrafts((prev) => prev?.filter((d) => d.id !== draft.id) ?? null)
    try {
      await deleteDraft(slug, draft.id)
    } catch (err) {
      setDrafts(snapshot)
      toast.error(errorText(err, t('Не удалось удалить черновик')))
    }
  }

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <PencilLine size={16} />
        {t('Черновики')}
      </div>

      <div className="max-w-5xl space-y-4 px-4 py-6 md:px-8">
        <p className="text-sm text-muted-foreground">
          {t(
            'Форма создания задачи сохраняется сама, пока вы печатаете. Если закрыть её, не создав задачу, черновик останется здесь. Черновики видите только вы.',
          )}
        </p>

        {drafts === null ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : drafts.length === 0 ? (
          <EmptyState
            icon={FilePen}
            title={t('Черновиков нет')}
            description={t('Всё, что вы начали, уже создано.')}
          />
        ) : (
          <ul
            className="divide-y divide-border rounded-lg border border-border"
            data-testid="drafts"
          >
            {drafts.map((draft) => {
              const d = draft.data
              const title = d.title?.trim()
              const ready = Boolean(draft.project_id && title)
              return (
                <li
                  key={draft.id}
                  className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:px-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {d.kind !== 'task' && (
                        <ShieldCheck
                          size={13}
                          className="shrink-0 text-primary"
                          aria-label={t('Поручение')}
                        />
                      )}
                      <span
                        className={
                          title
                            ? 'truncate'
                            : 'truncate italic text-muted-foreground'
                        }
                      >
                        {title || t('Без названия')}
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>
                        {draft.project
                          ? `${draft.project.icon ?? '📁'} ${draft.project.name}`
                          : t('Без проекта')}
                      </span>
                      {d.due_date && (
                        <span>
                          {t('срок {{date}}', { date: longDate(d.due_date) })}
                        </span>
                      )}
                      <span>
                        {t('изменён {{ago}}', {
                          ago: timeAgo(draft.updated_at),
                        })}
                      </span>
                    </p>
                    {d.description && (
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {d.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {draft.project_id && !readOnly && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(
                            `/projects/${draft.project_id}/work-items?create=1&draft=${draft.id}`,
                          )
                        }
                      >
                        <PencilLine size={14} />
                        {t('Продолжить')}
                      </Button>
                    )}
                    {!readOnly && (
                      <Button
                        size="sm"
                        onClick={() => void publish(draft)}
                        disabled={!ready || busy === draft.id}
                        title={ready ? undefined : t('Нужны проект и название')}
                      >
                        <Send size={14} />
                        {t('Опубликовать')}
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => setRemoving(draft)}
                      aria-label={t('Удалить черновик')}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('Удалить черновик?')}
        description={removing?.data.title?.trim() || t('Без названия')}
        confirmLabel={t('Удалить')}
        onConfirm={() => removing && void remove(removing)}
      />
    </div>
  )
}
