import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { dateTime } from '@/lib/dates'
import { errorText } from '@/lib/errorMessages'
import { shortName } from '@/lib/people'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getProject } from '@/api/project'
import {
  deleteRecurringRule,
  getRecurringRules,
  runRecurringRule,
  updateRecurringRule,
  type RecurringRule,
  type Schedule,
} from '@/api/recurring'
import { RepeatFields } from './RepeatFields'
import { describeSchedule, ruleErrorText } from './recurrence'

// «Повторяющиеся» in the project settings (Ф6 6.F4): every rule with its
// schedule in words, the next run, how many issues it made and the latest one.
// Its author or an admin pauses, resumes, runs it now, edits or deletes it.
// Rules are made in the create form with «Повторять».

function scheduleOf(rule: RecurringRule): Schedule {
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    by_weekday: rule.by_weekday,
    by_monthday: rule.by_monthday,
    by_month: rule.by_month,
    time: rule.time,
    start_date: rule.start_date,
    until: rule.until,
  }
}

function EditRuleDialog({
  rule,
  slug,
  projectId,
  onClose,
  onSaved,
}: {
  rule: RecurringRule
  slug: string
  projectId: string
  onClose: () => void
  onSaved: (rule: RecurringRule) => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(rule.data.title)
  const [schedule, setSchedule] = useState(scheduleOf(rule))
  const [dueInDays, setDueInDays] = useState(
    rule.due_in_days === null ? '' : String(rule.due_in_days),
  )
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      const saved = await updateRecurringRule(slug, projectId, rule.id, {
        ...schedule,
        data: { ...rule.data, title: title.trim() },
        due_in_days:
          dueInDays.trim() === ''
            ? null
            : Math.min(365, Math.max(0, Number(dueInDays) || 0)),
      })
      toast.success(t('Правило сохранено'))
      onSaved(saved)
      onClose()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сохранить правило')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Повторяющаяся задача')}</DialogTitle>
          <DialogDescription>
            {t(
              'Новое расписание действует со следующего запуска; пропущенные запуски не догоняются.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={title}
            maxLength={500}
            onChange={(e) => setTitle(e.target.value)}
            aria-label={t('Название задачи')}
          />
          <RepeatFields value={schedule} onChange={setSchedule} />
          <label className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {t('Срок исполнения — через')}
            <input
              type="number"
              min={0}
              max={365}
              value={dueInDays}
              onChange={(e) => setDueInDays(e.target.value)}
              placeholder="—"
              className="h-8 w-16 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              aria-label={t('Срок исполнения в днях')}
            />
            {t('дн. после создания')}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('Отмена')}
          </Button>
          <Button onClick={save} disabled={busy || !title.trim()}>
            {busy ? t('Сохраняем…') : t('Сохранить')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectRecurringPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projectId } = useParams()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const [rules, setRules] = useState<RecurringRule[] | null>(null)
  const [identifier, setIdentifier] = useState('')
  const [editing, setEditing] = useState<RecurringRule | null>(null)
  const [toDelete, setToDelete] = useState<RecurringRule | null>(null)

  useEffect(() => {
    if (!slug || !projectId) return
    let cancelled = false
    ;(async () => {
      const [res, project] = await Promise.all([
        getRecurringRules(slug, projectId).catch(() => ({ data: [] })),
        getProject(slug, projectId).catch(() => null),
      ])
      if (cancelled) return
      setRules(res.data)
      setIdentifier(project?.identifier ?? '')
    })()
    return () => {
      cancelled = true
    }
  }, [slug, projectId])

  const replace = (rule: RecurringRule) =>
    setRules((list) => list?.map((r) => (r.id === rule.id ? rule : r)) ?? null)

  async function toggle(rule: RecurringRule) {
    if (!slug || !projectId) return
    try {
      const saved = await updateRecurringRule(slug, projectId, rule.id, {
        is_active: !rule.is_active,
      })
      replace(saved)
      toast.success(
        saved.is_active ? t('Правило возобновлено') : t('Правило на паузе'),
      )
    } catch (err) {
      toast.error(errorText(err, t('Не удалось изменить правило')))
    }
  }

  async function runNow(rule: RecurringRule) {
    if (!slug || !projectId) return
    try {
      const issue = await runRecurringRule(slug, projectId, rule.id)
      const key = `${identifier}-${issue.sequence_id}`
      toast.success(t('Создана задача {{key}}', { key }), {
        action: {
          label: t('Открыть'),
          onClick: () => navigate(`/w/${slug}/browse/${key}`),
        },
      })
      const res = await getRecurringRules(slug, projectId).catch(() => null)
      if (res) setRules(res.data)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось создать задачу')))
    }
  }

  async function remove(rule: RecurringRule) {
    if (!slug || !projectId) return
    try {
      await deleteRecurringRule(slug, projectId, rule.id)
      setRules((list) => list?.filter((r) => r.id !== rule.id) ?? null)
      toast.success(t('Правило удалено'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить правило')))
    }
  }

  const newIssue = () => navigate(`/projects/${projectId}/work-items?create=1`)

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <Repeat size={16} />
        {t('Повторяющиеся задачи')}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={newIssue}
        >
          <Plus size={14} />
          {t('Новая задача')}
        </Button>
      </div>

      <div className="max-w-3xl px-4 py-6 md:px-8">
        <p className="mb-5 text-sm text-muted-foreground">
          {t(
            'Отчёты и поручения, которые создаются сами: ежемесячно, еженедельно, раз в квартал. Чтобы добавить, включите «Повторять» в форме создания задачи. Время — по поясу пространства.',
          )}
        </p>

        {rules === null ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title={t('Повторяющихся задач пока нет')}
            description={t(
              'Например, «Ежемесячный отчёт о посещаемости» — 1-го числа в 09:00.',
            )}
            action={{ label: t('Новая задача'), onClick: newIssue }}
          />
        ) : (
          <ul className="space-y-2" data-testid="recurring">
            {rules.map((rule) => {
              const finished = !rule.next_run_at
              return (
                <li
                  key={rule.id}
                  className="rounded-md border border-border px-3 py-2.5"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {rule.data.kind === 'assignment' && (
                          <ShieldCheck
                            size={14}
                            className="shrink-0 text-primary"
                            aria-label={t('Поручение')}
                          />
                        )}
                        <span className="truncate">{rule.data.title}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {describeSchedule(scheduleOf(rule))}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span
                          className={cn(
                            'rounded px-1.5 py-px font-medium',
                            !rule.is_active
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                              : finished
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
                          )}
                        >
                          {!rule.is_active
                            ? t('На паузе')
                            : finished
                              ? t('Завершено')
                              : t('Следующая: {{when}}', {
                                  when: dateTime(rule.next_run_at!),
                                })}
                        </span>
                        <span>
                          {t('Создано задач: {{n}}', { n: rule.issues_count })}
                        </span>
                        {rule.last_issue && identifier && (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/w/${slug}/browse/${identifier}-${rule.last_issue!.sequence_id}`,
                              )
                            }
                            className="text-primary hover:underline"
                          >
                            {t('последняя — {{key}}', {
                              key: `${identifier}-${rule.last_issue.sequence_id}`,
                            })}
                          </button>
                        )}
                        {rule.due_in_days !== null && (
                          <span>
                            {t('срок — через {{n}} дн.', {
                              n: rule.due_in_days,
                            })}
                          </span>
                        )}
                        <span>{shortName(rule.created_by)}</span>
                      </p>
                      {rule.last_error && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                          <AlertTriangle size={13} className="mt-px shrink-0" />
                          {ruleErrorText(rule.last_error)}
                        </p>
                      )}
                    </div>
                  </div>
                  {rule.can_edit && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => runNow(rule)}
                      >
                        <Zap size={13} />
                        {t('Создать сейчас')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggle(rule)}
                      >
                        {rule.is_active ? (
                          <Pause size={13} />
                        ) : (
                          <Play size={13} />
                        )}
                        {rule.is_active ? t('Пауза') : t('Возобновить')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(rule)}
                      >
                        <Pencil size={13} />
                        {t('Изменить')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setToDelete(rule)}
                      >
                        <Trash2 size={13} />
                        {t('Удалить')}
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {editing && slug && projectId && (
        <EditRuleDialog
          key={editing.id}
          rule={editing}
          slug={slug}
          projectId={projectId}
          onClose={() => setEditing(null)}
          onSaved={replace}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('Удалить правило «{{title}}»?', {
          title: toDelete?.data.title ?? '',
        })}
        description={t(
          'Новые задачи создаваться не будут. Уже созданные останутся.',
        )}
        confirmLabel={t('Удалить')}
        onConfirm={() => toDelete && void remove(toDelete)}
      />
    </div>
  )
}
