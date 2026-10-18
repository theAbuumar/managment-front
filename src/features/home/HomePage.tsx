import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Home,
  ArrowRight,
  Gauge,
  CheckCircle2,
  Flame,
  Briefcase,
  CalendarClock,
  EyeOff,
  Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getWorkspaceIssues, type Issue } from '@/api/issue'
import { getNotifications, type AppNotification } from '@/api/notification'
import { getDashboard, type Dashboard } from '@/api/analytics'
import { deadlineInfo } from '@/lib/deadline'
import { shortName } from '@/lib/people'
import { timeAgo } from '@/lib/dates'
import { FEATURES } from '@/lib/features'
import { IssueRow } from '@/features/issues/IssueRow'
import { WorkspaceIssuePanel } from '@/features/issues/WorkspaceIssuePanel'
import { TYPE_META, TONES } from '@/features/notifications/notificationMeta'
import { BarList, StatTile } from '@/features/analytics/charts'
import {
  delta,
  fmt,
  issuesLink,
  pct,
  periodLabel,
} from '@/features/analytics/format'
import { t as translate } from '@/i18n'

// The trend chart pulls in the chart library: load it only for the manager
// dashboard, after the page itself is on screen (12.F4).
const DisciplineTrend = lazy(() =>
  import('@/features/analytics/trend-charts').then((m) => ({
    default: m.DisciplineTrend,
  })),
)

// Home by role (Ф7 7.F1, Ф10 10.F3) in three requests whatever the number of
// projects: my open work (GET WS/issues), the latest notifications, and the
// analytics dashboard. Heads and admins get the compact management dashboard;
// everyone gets their week and their own discipline figure.

function getGreeting() {
  const h = new Date().getHours()
  if (h < 5) return translate('Доброй ночи')
  if (h < 12) return translate('Доброе утро')
  if (h < 18) return translate('Добрый день')
  return translate('Добрый вечер')
}

function formatToday() {
  return new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const me = user?.id
  const workspace = useWorkspaceStore((s) => s.workspace)
  const slug = workspace?.slug
  const timeZone =
    workspace?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  const [mine, setMine] = useState<Issue[] | null>(null)
  const [notes, setNotes] = useState<AppNotification[] | null>(null)
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    void Promise.all([
      getWorkspaceIssues(slug, {
        assignee: 'me',
        open: 'true',
        sort_by: 'due_date',
        order: 'asc',
        limit: 100,
      })
        .then((r) => r.data)
        .catch(() => []),
      getNotifications(slug, { limit: 5 })
        .then((r) => r.data)
        .catch(() => []),
      FEATURES.analytics
        ? getDashboard(slug, { limit: 5 }).catch(() => null)
        : Promise.resolve(null),
    ]).then(([issues, notifications, dashboard]) => {
      if (cancelled) return
      setMine(issues)
      setNotes(notifications)
      setDash(dashboard)
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  // My week: overdue, today, the next 7 days — the order a person works through them.
  const week = useMemo(() => {
    const rows = (mine ?? []).map((i) => ({
      i,
      info: deadlineInfo(i.due_date, i.state?.group, timeZone),
    }))
    return {
      overdue: rows.filter((r) => r.info.tone === 'overdue').map((r) => r.i),
      today: rows.filter((r) => r.info.tone === 'today').map((r) => r.i),
      soon: rows
        .filter(
          (r) =>
            r.info.tone !== 'overdue' &&
            r.info.tone !== 'today' &&
            (r.info.days ?? 99) <= 7,
        )
        .map((r) => r.i),
      unack: (mine ?? []).filter(
        (i) =>
          i.kind === 'assignment' &&
          i.assignees.some((a) => a.user_id === me && !a.acknowledged_at),
      ),
    }
  }, [mine, timeZone, me])

  const manager = dash && dash.scope.kind !== 'self'
  const selected = (mine ?? []).find((i) => i.id === selectedId) ?? null

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-4">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Home size={14} />
          <span>{t('Главная')}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
          <div className="text-center">
            <h1 className="mb-1 text-2xl font-bold text-foreground">
              {getGreeting()}, {user?.display_name ?? ''}
            </h1>
            <p className="text-sm font-medium text-primary first-letter:uppercase">
              {formatToday()}
            </p>
          </div>

          {/* The three requests land together; until then one placeholder stands
              for the whole page, so the manager dashboard appearing above "My
              week" doesn't push already drawn blocks down (12.F4, layout shift). */}
          {mine === null ? (
            <div className="space-y-8" aria-busy="true">
              <Skeleton className="h-40" />
              <Skeleton className="h-32" />
              <Skeleton className="h-24" />
            </div>
          ) : (
            <>
              {manager && <ManagerDashboard dash={dash} />}

              {/* My week */}
              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    {t('Мои задачи на неделю')}
                  </h2>
                  <button
                    onClick={() => navigate('/your-work')}
                    className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    {t('Все мои задачи')}
                    <ArrowRight size={14} />
                  </button>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatTile
                    icon={Flame}
                    label={t('Просрочено')}
                    value={fmt(week.overdue.length)}
                    critical={week.overdue.length > 0}
                  />
                  <StatTile
                    icon={CalendarClock}
                    label={t('Срок сегодня')}
                    value={fmt(week.today.length)}
                  />
                  <StatTile
                    icon={Briefcase}
                    label={t('На неделе')}
                    value={fmt(week.soon.length)}
                  />
                  <StatTile
                    icon={EyeOff}
                    label={t('Ждут ознакомления')}
                    value={fmt(week.unack.length)}
                    onClick={
                      week.unack[0]
                        ? () => setSelectedId(week.unack[0]!.id)
                        : undefined
                    }
                  />
                </div>
                {week.overdue.length + week.today.length + week.soon.length ===
                0 ? (
                  <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                    {mine.length === 0
                      ? t('У вас нет открытых задач.')
                      : t(
                          'На ближайшую неделю сроков нет — всё под контролем.',
                        )}
                  </p>
                ) : (
                  <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {[...week.overdue, ...week.today, ...week.soon]
                      .slice(0, 10)
                      .map((issue) => (
                        <IssueRow
                          key={issue.id}
                          issue={issue}
                          person="controller"
                          onOpen={() => setSelectedId(issue.id)}
                        />
                      ))}
                  </div>
                )}
              </section>

              {/* Own discipline for those who don't manage anyone. */}
              {dash && !manager && dash.current.discipline !== null && (
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatTile
                    icon={Gauge}
                    label={t('Моя исполнительская дисциплина')}
                    value={pct(dash.current.discipline)}
                    delta={delta(
                      dash.current.discipline,
                      dash.previous.discipline,
                      { upIsGood: true, points: true },
                    )}
                    hint={periodLabel(dash.period)}
                  />
                  <StatTile
                    icon={CheckCircle2}
                    label={t('Исполнено за период')}
                    value={fmt(dash.current.completed)}
                  />
                </section>
              )}

              {/* Latest notifications */}
              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    {t('Последние уведомления')}
                  </h2>
                  <button
                    onClick={() => navigate('/notifications')}
                    className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    {t('Все уведомления')}
                    <ArrowRight size={14} />
                  </button>
                </div>
                {!notes || notes.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                    {t('Уведомлений пока нет.')}
                  </p>
                ) : (
                  <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {notes.map((n) => {
                      const meta = TYPE_META[n.type] ?? {
                        icon: Bell,
                        tone: 'gray' as const,
                        text: () => '',
                      }
                      const Icon = meta.icon
                      return (
                        <button
                          key={n.id}
                          onClick={() =>
                            n.issue
                              ? navigate(
                                  `/projects/${n.issue.project_id}/work-items?issue=${n.issue.id}`,
                                )
                              : navigate('/notifications')
                          }
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50"
                        >
                          <span
                            className={cn(
                              'flex size-7 shrink-0 items-center justify-center rounded-full',
                              TONES[meta.tone],
                            )}
                          >
                            <Icon size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-foreground">
                              {meta.text(n, shortName(n.actor))}
                            </span>
                            {n.issue && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {n.issue.project.identifier}-
                                {n.issue.sequence_id} · {n.issue.title}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {timeAgo(n.created_at)}
                          </span>
                          {!n.is_read && (
                            <span
                              className="size-2 shrink-0 rounded-full bg-primary"
                              aria-label={t('Новое')}
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {slug && (
        <WorkspaceIssuePanel
          slug={slug}
          issue={selected}
          onClose={() => setSelectedId(null)}
          onUpdated={(updated) =>
            setMine(
              (prev) =>
                prev?.map((i) => (i.id === updated.id ? updated : i)) ?? prev,
            )
          }
          onDeleted={(id) => {
            setMine((prev) => prev?.filter((i) => i.id !== id) ?? prev)
            setSelectedId(null)
          }}
        />
      )}
    </div>
  )
}

/** Compact management dashboard (10.F3): the full one is the «Аналитика» page. */
function ManagerDashboard({ dash }: { dash: Dashboard }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const c = dash.current
  const p = dash.previous
  const ranked = [...dash.departments].sort(
    (a, b) =>
      (b.total.discipline ?? -1) - (a.total.discipline ?? -1) ||
      b.total.overdue - a.total.overdue,
  )
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {dash.scope.kind === 'all'
            ? t('Исполнение поручений')
            : t('Исполнение поручений в вашем подразделении')}
          <span className="ml-2 font-normal text-muted-foreground">
            {t('{{cur}}, изменения — к {{prev}}', {
              cur: periodLabel(dash.period),
              prev: periodLabel(dash.previous_period),
            })}
          </span>
        </h2>
        <button
          onClick={() => navigate('/analytics')}
          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t('Вся аналитика')}
          <ArrowRight size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          icon={Gauge}
          label={t('Исполнено в срок')}
          value={pct(c.discipline)}
          delta={delta(c.discipline, p.discipline, {
            upIsGood: true,
            points: true,
          })}
        />
        <StatTile
          icon={CheckCircle2}
          label={t('Исполнено')}
          value={fmt(c.completed)}
          delta={delta(c.completed, p.completed, { upIsGood: true })}
        />
        <StatTile
          icon={Flame}
          label={t('Просрочено сейчас')}
          value={fmt(c.overdue)}
          critical={c.overdue > 0}
          delta={delta(c.overdue, p.overdue, { upIsGood: false })}
          onClick={() =>
            navigate(
              issuesLink(
                {},
                { overdue: true, title: t('Просроченные поручения') },
              ),
            )
          }
        />
        <StatTile
          icon={Briefcase}
          label={t('В работе')}
          value={fmt(c.open)}
          hint={t('не ознакомлены: {{n}}', { n: c.unacknowledged })}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {t('Рейтинг подразделений — исполнено в срок')}
          </h3>
          {ranked.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('Нет данных за период.')}
            </p>
          ) : (
            <BarList
              max={100}
              rows={ranked.slice(0, 8).map((d) => ({
                id: d.id,
                label: d.short_name ?? d.name,
                value: d.total.discipline,
                valueText: pct(d.total.discipline),
                tooltip: t(
                  '{{name}}: исполнено {{done}}, в срок {{onTime}}, с опозданием {{late}}',
                  {
                    name: d.name,
                    done: d.total.completed,
                    onTime: d.total.on_time,
                    late: d.total.late,
                  },
                ),
                note: d.total.overdue
                  ? t('просрочено: {{n}}', { n: d.total.overdue })
                  : undefined,
                noteCritical: d.total.overdue > 0,
                onClick: () => navigate(`/analytics?department=${d.id}`),
                onNoteClick: () =>
                  navigate(
                    issuesLink(
                      {},
                      {
                        department: d.id,
                        overdue: true,
                        title: t('Просрочено: {{name}}', { name: d.name }),
                      },
                    ),
                  ),
              }))}
            />
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {t('Самые просроченные')}
          </h3>
          {dash.overdue.items.length === 0 ? (
            <p className="flex items-center gap-1.5 text-sm text-[var(--viz-good-text)]">
              <CheckCircle2 size={15} />
              {t('Просроченных поручений нет.')}
            </p>
          ) : (
            <ul className="space-y-2">
              {dash.overdue.items.map((x) => (
                <li key={x.id}>
                  <button
                    onClick={() =>
                      x.project &&
                      navigate(
                        `/projects/${x.project.id}/work-items?issue=${x.id}`,
                      )
                    }
                    className="flex w-full items-start gap-2 text-left hover:text-primary"
                  >
                    <span className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground">
                      {x.key}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{x.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[
                          shortName(x.assignee),
                          x.department?.short_name ?? x.department?.name,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--viz-critical)]">
                      <Flame size={12} aria-hidden />
                      {t('{{n}} дн.', { n: x.days_overdue })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {dash.overdue.total > dash.overdue.items.length && (
            <button
              onClick={() =>
                navigate(
                  issuesLink(
                    {},
                    { overdue: true, title: t('Просроченные поручения') },
                  ),
                )
              }
              className="mt-3 text-xs font-medium text-primary hover:underline"
            >
              {t('Все просроченные: {{n}}', { n: dash.overdue.total })}
            </button>
          )}
        </div>
      </div>

      {dash.trend.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-1 text-sm font-semibold">
            {t('Исполнено в срок по неделям, %')}
          </h3>
          <Suspense fallback={<Skeleton className="h-[160px]" />}>
            <DisciplineTrend items={dash.trend} bucket="week" height={160} />
          </Suspense>
        </div>
      )}
    </section>
  )
}
