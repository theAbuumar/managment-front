import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MultiSelect } from '@/components/ui/multi-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createReportSchedule,
  updateReportSchedule,
  type PlannedReport,
  type ReportChannel,
  type ReportFilters,
  type ReportFrequency,
  type ReportPeriod,
  type ReportSchedule,
} from '@/api/reportSchedules'
import { flattenTree, getDepartmentTree } from '@/api/department'
import { getProjects, type Project } from '@/api/project'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import { useAuthStore } from '@/stores/authStore'
import { errorText } from '@/lib/errorMessages'
import { fullName } from '@/lib/people'
import {
  DEFAULT_PERIOD,
  PERIODS,
  REPORTS,
  REPORT_FREQUENCIES,
  WEEKDAY_NAMES,
  describeTiming,
} from './reportText'

// The form of a planned report (Ф10 10.F7): what, for which filters and period,
// when, to whom and how. Opened from «Настройки → Плановые отчёты» and from
// «Аналитика → По расписанию» with the page's filters (ADR-032).

const ALL = '__all__'

export interface ReportDraft {
  report?: PlannedReport
  filters?: ReportFilters
}

interface Form {
  name: string
  report: PlannedReport
  department: string
  project: string
  kind: 'task' | 'assignment' | typeof ALL
  frequency: ReportFrequency
  weekday: number
  monthday: number
  time: string
  /** null — by the frequency. */
  period: ReportPeriod | null
  recipients: string[]
  channels: ReportChannel[]
}

function formOf(
  item: ReportSchedule | null,
  draft: ReportDraft | undefined,
  me: string,
): Form {
  const filters = item?.filters ?? draft?.filters ?? {}
  return {
    name: item?.name ?? '',
    report: item?.report ?? draft?.report ?? 'discipline',
    department: filters.department?.[0] ?? ALL,
    project: filters.project?.[0] ?? ALL,
    kind: filters.kind ?? ALL,
    frequency: item?.frequency ?? 'weekly',
    weekday: item?.by_weekday[0] ?? 1,
    monthday: item?.by_monthday ?? 1,
    time: item?.time ?? '08:00',
    period: item ? item.period : null,
    recipients: item?.recipient_ids ?? [me],
    channels: item?.channels ?? ['telegram', 'email'],
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {children}
    </div>
  )
}

export function ReportScheduleDialog({
  open,
  onOpenChange,
  slug,
  item,
  draft,
  onSaved,
  listLink,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  /** The report being edited; null — a new one. */
  item: ReportSchedule | null
  /** Prefill of a new report (the analytics filters). */
  draft?: ReportDraft
  onSaved: (schedule: ReportSchedule) => void
  /** Opened outside «Плановые отчёты»: the toast links to the list. */
  listLink?: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const me = useAuthStore((s) => s.user?.id ?? '')
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  // The role from the members list: settings pages have no summary loaded.
  const role = members.find((m) => m.user_id === me)?.role
  const isAdmin = role === 'owner' || role === 'admin'
  // Others than the author only in a report of an admin (ADR-032).
  const authorIsMe = !item || item.created_by.id === me
  const canShare = isAdmin && authorIsMe
  const [form, setForm] = useState<Form>(() => formOf(item, draft, me))
  const [busy, setBusy] = useState(false)
  const [departments, setDepartments] = useState<
    { id: string; name: string; depth: number }[]
  >([])
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getDepartmentTree(slug).then(
      (tree) => !cancelled && setDepartments(flattenTree(tree)),
      () => undefined,
    )
    getProjects(slug).then(
      (list) => !cancelled && setProjects(list),
      () => undefined,
    )
    getWorkspaceMembers(slug).then(
      (list) => !cancelled && setMembers(list),
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [open, slug])

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const period = form.period ?? DEFAULT_PERIOD[form.frequency]
  const needsProject = form.report === 'project'
  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        value: m.user_id,
        label:
          m.user_id === me
            ? t('{{name}} (вы)', { name: fullName(m.user) })
            : fullName(m.user),
      })),
    [members, me, t],
  )

  async function submit() {
    if (busy) return
    if (needsProject && form.project === ALL) {
      toast.error(t('Выберите проект для отчёта по проекту'))
      return
    }
    if (form.channels.length === 0) {
      toast.error(t('Выберите, куда отправлять: Telegram, почта или оба'))
      return
    }
    if (form.recipients.length === 0) {
      toast.error(t('Добавьте хотя бы одного получателя'))
      return
    }
    const filters: ReportFilters = {
      ...(form.department !== ALL && { department: [form.department] }),
      ...(form.project !== ALL && { project: [form.project] }),
      ...(form.kind !== ALL && { kind: form.kind }),
    }
    const body = {
      name: form.name.trim() || null,
      report: form.report,
      filters,
      period,
      frequency: form.frequency,
      ...(form.frequency === 'weekly' && { by_weekday: [form.weekday] }),
      ...((form.frequency === 'monthly' || form.frequency === 'quarterly') && {
        by_monthday: form.monthday,
      }),
      time: form.time,
      ...((canShare || !item) && {
        recipient_ids: canShare ? form.recipients : [me],
      }),
      channels: form.channels,
    }
    setBusy(true)
    try {
      const saved = item
        ? await updateReportSchedule(slug, item.id, body)
        : await createReportSchedule(slug, body)
      toast.success(
        item ? t('Плановый отчёт сохранён') : t('Плановый отчёт создан'),
        {
          description: saved.next_run_at
            ? t('Следующая отправка — {{when}}', {
                when: new Date(saved.next_run_at).toLocaleString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })
            : undefined,
          action: listLink
            ? {
                label: t('Все плановые отчёты'),
                onClick: () => navigate('/settings/reports'),
              }
            : undefined,
        },
      )
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сохранить плановый отчёт')))
    } finally {
      setBusy(false)
    }
  }

  const toggleChannel = (c: ReportChannel) =>
    set(
      'channels',
      form.channels.includes(c)
        ? form.channels.filter((x) => x !== c)
        : [...form.channels, c],
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item ? t('Плановый отчёт') : t('Новый плановый отчёт')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Документ формируется сам по расписанию — тот же, что «Справка PDF» и «Реестр Excel» в аналитике, с правами автора. Время — по поясу пространства.',
            )}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field label={t('Документ')}>
            <Select
              value={form.report}
              onValueChange={(v) => set('report', v as PlannedReport)}
            >
              <SelectTrigger aria-label={t('Документ')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORTS.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.label()} · {r.file}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label={needsProject ? t('Проект') : t('Проект (необязательно)')}
            >
              <Select
                value={form.project}
                onValueChange={(v) => set('project', v)}
              >
                <SelectTrigger aria-label={t('Проект')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {!needsProject && (
                    <SelectItem value={ALL}>{t('Все проекты')}</SelectItem>
                  )}
                  {needsProject && form.project === ALL && (
                    <SelectItem value={ALL} disabled>
                      {t('Выберите проект')}
                    </SelectItem>
                  )}
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('Подразделение')}>
              <Select
                value={form.department}
                onValueChange={(v) => set('department', v)}
              >
                <SelectTrigger aria-label={t('Подразделение')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={ALL}>{t('Все в моей зоне')}</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      <span style={{ paddingLeft: d.depth * 12 }}>
                        {d.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label={t('Что учитывать')}>
            <Select
              value={form.kind}
              onValueChange={(v) => set('kind', v as Form['kind'])}
            >
              <SelectTrigger aria-label={t('Что учитывать')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('Поручения и задачи')}</SelectItem>
                <SelectItem value="assignment">
                  {t('Только поручения')}
                </SelectItem>
                <SelectItem value="task">{t('Только задачи')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field label={t('Как часто')}>
              <Select
                value={form.frequency}
                onValueChange={(v) => set('frequency', v as ReportFrequency)}
              >
                <SelectTrigger aria-label={t('Как часто')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_FREQUENCIES.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {f.label()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {form.frequency === 'weekly' && (
              <Field label={t('День недели')}>
                <Select
                  value={String(form.weekday)}
                  onValueChange={(v) => set('weekday', Number(v))}
                >
                  <SelectTrigger aria-label={t('День недели')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i + 1)}>
                        {name()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {(form.frequency === 'monthly' ||
              form.frequency === 'quarterly') && (
              <Field label={t('Число месяца')}>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.monthday}
                  onChange={(e) =>
                    set(
                      'monthday',
                      Math.min(31, Math.max(1, Number(e.target.value) || 1)),
                    )
                  }
                  aria-label={t('Число месяца')}
                />
              </Field>
            )}
            {form.frequency === 'daily' && <div className="hidden sm:block" />}
            <Field label={t('Время')}>
              <Input
                type="time"
                value={form.time}
                onChange={(e) => e.target.value && set('time', e.target.value)}
                aria-label={t('Время')}
                className="sm:w-28"
              />
            </Field>
          </div>

          <Field label={t('Период отчёта')}>
            <Select
              value={period}
              onValueChange={(v) => set('period', v as ReportPeriod)}
            >
              <SelectTrigger aria-label={t('Период отчёта')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {describeTiming({
                frequency: form.frequency,
                by_weekday: [form.weekday],
                by_monthday: form.monthday,
                time: form.time,
              })}
              {' · '}
              {t('только завершённые дни, без дня отправки')}
            </p>
          </Field>

          <Field label={t('Кому')}>
            {canShare ? (
              <MultiSelect
                options={memberOptions}
                value={form.recipients}
                onChange={(v) => set('recipients', v)}
                placeholder={t('Выберите сотрудников')}
              />
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                {authorIsMe
                  ? t(
                      'Только вам. Другим сотрудникам плановые отчёты отправляют администраторы.',
                    )
                  : t('Получателей меняет автор отчёта.')}
              </p>
            )}
          </Field>

          <Field label={t('Куда')}>
            <div className="flex flex-wrap gap-4 text-sm">
              {(
                [
                  ['telegram', t('Telegram — документом')],
                  ['email', t('Почта — вложением')],
                ] as const
              ).map(([c, label]) => (
                <label key={c} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={form.channels.includes(c)}
                    onChange={() => toggleChannel(c)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                'В приложении уведомление «Отчёт готов» с файлом приходит всегда.',
              )}
            </p>
          </Field>

          <Field label={t('Название (необязательно)')}>
            <Input
              value={form.name}
              maxLength={120}
              placeholder={t('Например, «Справка ректору к планёрке»')}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('Отмена')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('Сохраняем…') : item ? t('Сохранить') : t('Создать')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
