import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Mail,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  deleteReportSchedule,
  downloadReportRun,
  getReportRuns,
  getReportSchedules,
  sendReportNow,
  updateReportSchedule,
  type ReportRun,
  type ReportSchedule,
} from '@/api/reportSchedules'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { getWorkspaceMembers } from '@/api/workspace'
import { dateTime } from '@/lib/dates'
import { errorText } from '@/lib/errorMessages'
import { fullName, shortName } from '@/lib/people'
import { pluralize } from '@/lib/plural'
import { cn } from '@/lib/utils'
import { ReportScheduleDialog } from './ReportScheduleDialog'
import {
  deliveryText,
  describeTiming,
  periodLabel,
  reportLabel,
  runPeriod,
  scheduleErrorText,
} from './reportText'

// «Настройки → Плановые отчёты» (Ф10 10.F7, ADR-032): every planned report I may
// see — mine, the ones I receive, all of them for an admin — with when it goes
// next, to whom and how, its latest sending and the history with the files.

const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${n.toLocaleString('ru-RU')}%`

function RunLine({
  run,
  slug,
  schedule,
}: {
  run: ReportRun
  slug: string
  schedule: ReportSchedule
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const name = (id: string) => {
    const r = schedule.recipients.find((x) => x.id === id)
    return r ? shortName(r) : t('Сотрудник')
  }
  async function download() {
    setBusy(true)
    try {
      await downloadReportRun(slug, run.id)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось скачать отчёт')))
    } finally {
      setBusy(false)
    }
  }
  const problems = run.deliveries.filter((d) => d.status !== 'sent')
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <p className="text-foreground">
          <span className="font-medium">
            {runPeriod(run.period_from, run.period_to)}
          </span>
          <span className="text-muted-foreground">
            {' · '}
            {t('отправлено {{when}}', { when: dateTime(run.created_at) })}
            {run.triggered_by_id && ` · ${t('вручную')}`}
          </span>
        </p>
        {run.status === 'failed' ? (
          <p className="mt-0.5 text-amber-700 dark:text-amber-300">
            {scheduleErrorText(run.error ?? '')}
          </p>
        ) : (
          <p className="mt-0.5 text-muted-foreground">
            {t(
              'В срок: {{pct}} · просрочено: {{overdue}} · исполнено: {{done}}',
              {
                pct: pct(run.summary.discipline),
                overdue: run.summary.overdue ?? 0,
                done: run.summary.completed ?? 0,
              },
            )}
          </p>
        )}
        {problems.length > 0 && (
          <p className="mt-0.5 text-muted-foreground">
            {problems
              .map((d) =>
                schedule.can_edit
                  ? `${name(d.user_id)} — ${deliveryText(d)}`
                  : deliveryText(d),
              )
              .join('; ')}
          </p>
        )}
      </div>
      {run.can_download && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={download}
          disabled={busy}
        >
          <Download size={13} />
          {t('Скачать')}
        </Button>
      )}
    </li>
  )
}

function History({
  slug,
  schedule,
}: {
  slug: string
  schedule: ReportSchedule
}) {
  const { t } = useTranslation()
  const [runs, setRuns] = useState<ReportRun[] | null>(null)
  useEffect(() => {
    let cancelled = false
    getReportRuns(slug, schedule.id).then(
      (res) => !cancelled && setRuns(res.data),
      () => !cancelled && setRuns([]),
    )
    return () => {
      cancelled = true
    }
  }, [slug, schedule.id, schedule.last_run?.id])
  if (runs === null) return <Skeleton className="mt-2 h-10 w-full" />
  if (runs.length === 0)
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        {t('Отчёт ещё не отправлялся.')}
      </p>
    )
  return (
    <ul
      className="mt-1 divide-y divide-border border-t border-border"
      data-testid="report-runs"
    >
      {runs.map((run) => (
        <RunLine key={run.id} run={run} slug={slug} schedule={schedule} />
      ))}
    </ul>
  )
}

function ScheduleRow({
  schedule,
  slug,
  onEdit,
  onDelete,
  onChanged,
}: {
  schedule: ReportSchedule
  slug: string
  onEdit: () => void
  onDelete: () => void
  onChanged: (s: ReportSchedule) => void
}) {
  const { t } = useTranslation()
  const [sending, setSending] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const Icon = schedule.report === 'assignments' ? FileSpreadsheet : FileText
  const last = schedule.last_run
  const recipients = schedule.recipients
  const reached = (channel: 'telegram' | 'email') =>
    recipients.filter((r) =>
      channel === 'telegram' ? r.has_telegram : r.has_email,
    ).length

  async function send() {
    setSending(true)
    try {
      const run = await sendReportNow(slug, schedule.id)
      if (run.status === 'failed')
        toast.error(scheduleErrorText(run.error ?? ''))
      else {
        const sent = run.deliveries.filter((d) => d.status === 'sent').length
        toast.success(t('Отчёт отправлен'), {
          description:
            sent > 0
              ? t(
                  'Доставлено копий: {{n}}. В приложении — у всех получателей.',
                  { n: sent },
                )
              : t('Отчёт в приложении у всех получателей.'),
        })
      }
      onChanged({
        ...schedule,
        last_run: run,
        last_run_at: run.created_at,
        last_error: run.error,
      })
    } catch (err) {
      toast.error(errorText(err, t('Не удалось отправить отчёт')))
    } finally {
      setSending(false)
    }
  }

  async function toggle() {
    try {
      const saved = await updateReportSchedule(slug, schedule.id, {
        is_active: !schedule.is_active,
      })
      onChanged(saved)
      toast.success(
        saved.is_active ? t('Отправка возобновлена') : t('Отправка на паузе'),
      )
    } catch (err) {
      toast.error(errorText(err, t('Не удалось изменить плановый отчёт')))
    }
  }

  return (
    <li
      className="rounded-lg border border-border bg-card px-4 py-3"
      data-testid="report-schedule"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {schedule.name || reportLabel(schedule.report)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {schedule.name && `${reportLabel(schedule.report)} · `}
            {describeTiming(schedule)} ·{' '}
            {periodLabel(schedule.period).toLowerCase()}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span
              className={cn(
                'rounded px-1.5 py-px font-medium',
                schedule.is_active
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
              )}
            >
              {schedule.is_active && schedule.next_run_at
                ? t('Следующая: {{when}}', {
                    when: dateTime(schedule.next_run_at),
                  })
                : t('На паузе')}
            </span>
            <span className="flex items-center gap-1">
              <span className="flex -space-x-1">
                {recipients.slice(0, 4).map((r) => (
                  <PersonAvatar key={r.id} person={r} size={16} />
                ))}
              </span>
              {recipients.length === 1
                ? shortName(recipients[0]!)
                : pluralize(recipients.length, [
                    t('получатель'),
                    t('получателя'),
                    t('получателей'),
                  ])}
            </span>
            <span className="flex items-center gap-1">
              {schedule.channels.includes('telegram') && (
                <span
                  title={
                    schedule.can_edit && recipients.length > 1
                      ? t(
                          'Telegram привязан у {{n}} из {{total}} получателей',
                          {
                            n: reached('telegram'),
                            total: recipients.length,
                          },
                        )
                      : t('Telegram')
                  }
                >
                  <Send size={11} className="inline" /> Telegram
                  {schedule.can_edit &&
                    recipients.length > 1 &&
                    ` · ${t('привязан у {{n}} из {{total}}', {
                      n: reached('telegram'),
                      total: recipients.length,
                    })}`}
                </span>
              )}
              {schedule.channels.includes('email') && (
                <span title={t('Почта')} className="ml-1.5">
                  <Mail size={11} className="inline" /> {t('почта')}
                </span>
              )}
            </span>
            {!schedule.can_edit && (
              <span>
                {t('от {{name}}', { name: fullName(schedule.created_by) })}
              </span>
            )}
          </div>
          {schedule.can_edit &&
            schedule.channels.includes('telegram') &&
            recipients.length === 1 &&
            recipients[0]!.has_telegram === false && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t(
                  'Telegram не привязан — подключите его в профиле, чтобы получать отчёт в чат.',
                )}
              </p>
            )}
          {schedule.last_error && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              {scheduleErrorText(schedule.last_error)}
            </p>
          )}
          {last && last.status !== 'failed' && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                'Последний: {{period}} — в срок {{pct}}, просрочено {{overdue}}',
                {
                  period: runPeriod(last.period_from, last.period_to),
                  pct: pct(last.summary.discipline),
                  overdue: last.summary.overdue ?? 0,
                },
              )}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {schedule.can_edit && (
          <Button size="sm" variant="outline" onClick={send} disabled={sending}>
            <Send size={13} />
            {sending ? t('Отправляем…') : t('Отправить сейчас')}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setHistoryOpen((o) => !o)}
          aria-expanded={historyOpen}
        >
          <ChevronDown
            size={13}
            className={cn('transition-transform', historyOpen && 'rotate-180')}
          />
          {t('История')}
        </Button>
        {schedule.can_edit && (
          <>
            <Button size="sm" variant="outline" onClick={toggle}>
              {schedule.is_active ? <Pause size={13} /> : <Play size={13} />}
              {schedule.is_active ? t('Пауза') : t('Возобновить')}
            </Button>
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil size={13} />
              {t('Изменить')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 size={13} />
              {t('Удалить')}
            </Button>
          </>
        )}
      </div>
      {historyOpen && <History slug={slug} schedule={schedule} />}
    </li>
  )
}

export function ReportSchedulesPage() {
  const { t } = useTranslation()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const me = useAuthStore((s) => s.user?.id)
  // A guest only reads (12.B4); the role comes from the members list here.
  const [readOnly, setReadOnly] = useState(true)
  const [items, setItems] = useState<ReportSchedule[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ReportSchedule | 'new' | null>(null)
  const [dialogKey, setDialogKey] = useState(0)
  const [removing, setRemoving] = useState<ReportSchedule | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    getWorkspaceMembers(slug).then(
      (list) =>
        !cancelled &&
        setReadOnly(list.find((m) => m.user_id === me)?.role === 'guest'),
      () => undefined,
    )
    getReportSchedules(slug).then(
      (res) => {
        if (cancelled) return
        setItems(res.data)
        setError(null)
      },
      (err) => {
        if (cancelled) return
        setItems([])
        setError(errorText(err, t('Не удалось загрузить плановые отчёты')))
      },
    )
    return () => {
      cancelled = true
    }
  }, [slug, me, t])

  function open(item: ReportSchedule | 'new') {
    setDialogKey((k) => k + 1)
    setEditing(item)
  }

  const put = (s: ReportSchedule) =>
    setItems((list) =>
      list?.some((x) => x.id === s.id)
        ? list.map((x) => (x.id === s.id ? s : x))
        : [...(list ?? []), s],
    )

  async function remove(s: ReportSchedule) {
    if (!slug) return
    try {
      await deleteReportSchedule(slug, s.id)
      setItems((list) => list?.filter((x) => x.id !== s.id) ?? null)
      toast.success(t('Плановый отчёт удалён'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить плановый отчёт')))
    }
  }

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <CalendarClock size={16} />
        {t('Плановые отчёты')}
        {!readOnly && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => open('new')}
            disabled={!items}
          >
            <Plus size={14} />
            {t('Новый плановый отчёт')}
          </Button>
        )}
      </div>

      <div className="max-w-3xl px-4 py-6 md:px-8">
        <p className="mb-5 text-sm text-muted-foreground">
          {t(
            'Справка об исполнении поручений, реестр или отчёт по проекту уходят сами: в Telegram документом и на почту вложением. Каждая отправка хранится в истории вместе с файлом.',
          )}
        </p>

        {items === null ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <EmptyState
            icon={AlertTriangle}
            title={t('Не удалось загрузить')}
            description={error}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={t('Плановых отчётов пока нет')}
            description={t(
              'Например, «Справка об исполнении поручений за прошлую неделю — каждый понедельник в 08:00».',
            )}
            action={
              readOnly
                ? undefined
                : {
                    label: t('Новый плановый отчёт'),
                    onClick: () => open('new'),
                  }
            }
          />
        ) : (
          <ul className="space-y-2">
            {items.map((s) => (
              <ScheduleRow
                key={s.id}
                schedule={s}
                slug={slug!}
                onEdit={() => open(s)}
                onDelete={() => setRemoving(s)}
                onChanged={put}
              />
            ))}
          </ul>
        )}
      </div>

      {slug && (
        <ReportScheduleDialog
          key={dialogKey}
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
          slug={slug}
          item={editing === 'new' ? null : editing}
          onSaved={put}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('Удалить плановый отчёт «{{name}}»?', {
          name: removing ? removing.name || reportLabel(removing.report) : '',
        })}
        description={t(
          'Отправки прекратятся, история и файлы прошлых отправок удалятся.',
        )}
        confirmLabel={t('Удалить')}
        onConfirm={() => removing && void remove(removing)}
      />
    </div>
  )
}
