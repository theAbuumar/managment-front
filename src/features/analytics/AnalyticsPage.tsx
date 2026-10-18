import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  BarChart3,
  Gauge,
  CheckCircle2,
  Flame,
  Briefcase,
  CalendarClock,
  Undo2,
  Timer,
  FileDown,
  FileSpreadsheet,
  Printer,
  ChevronRight,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getProjects, type Project } from '@/api/project'
import {
  downloadReport,
  getByAssignee,
  getByDepartment,
  getByProject,
  getDeadlineChanges,
  getOverdue,
  getReactionTime,
  getSummary,
  getTrends,
  type AnalyticsFilters,
  type AssigneeRow,
  type DeadlineChanges,
  type DepartmentNode,
  type OverdueItem,
  type ProjectRow,
  type ReactionTime,
  type Summary,
  type TrendPoint,
} from '@/api/analytics'
import type { IssueKind } from '@/api/issue'
import { errorText } from '@/lib/errorMessages'
import { shortName } from '@/lib/people'
import { shortDate } from '@/lib/dates'
import { BarList, ChartCard, DataTable, StatTile } from './charts'
import { CompletedTrend, DisciplineTrend } from './trend-charts'
import {
  bucketLabel,
  delta,
  fmt,
  hasWork,
  issuesLink,
  pct,
  periodLabel,
  PRESETS,
  presetPeriod,
  type PresetKey,
} from './format'

// «Аналитика» (Ф10 10.F1, 10.F2, 10.F4): execution discipline for the
// management. Filters live in the URL (shareable, printable, the home page links
// into a department). Every chart opens the issues behind it; the same numbers
// download as the PDF справка or the XLSX реестр with the current filters.

interface Data {
  summary: Summary
  trends: { bucket: 'week' | 'month'; items: TrendPoint[] }
  tree: DepartmentNode[]
  assignees: AssigneeRow[]
  projects: ProjectRow[]
  overdue: { total: number; items: OverdueItem[] }
  moves: DeadlineChanges
  reaction: ReactionTime
}

type RatingMetric = 'discipline' | 'overdue' | 'open'

function findPath(
  nodes: DepartmentNode[],
  id: string,
): DepartmentNode[] | null {
  for (const n of nodes) {
    if (n.id === id) return [n]
    const sub = findPath(n.children, id)
    if (sub) return [n, ...sub]
  }
  return null
}

function flatten(
  nodes: DepartmentNode[],
  depth = 0,
): { node: DepartmentNode; depth: number }[] {
  return nodes.flatMap((n) => [
    { node: n, depth },
    ...flatten(n.children, depth + 1),
  ])
}

export function AnalyticsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const slug = workspace?.slug
  const timeZone =
    workspace?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const [params, setParams] = useSearchParams()

  // A custom range (?from=&to=) wins over a preset (?preset=month); default — 30 days.
  const fromParam = params.get('from')
  const presetParam = params.get('preset')
  const preset: PresetKey | null = fromParam
    ? null
    : PRESETS.some((p) => p.key === presetParam)
      ? (presetParam as PresetKey)
      : '30d'
  const period = preset
    ? presetPeriod(preset, timeZone)
    : { from: fromParam!, to: params.get('to') ?? fromParam! }
  const filters: AnalyticsFilters = useMemo(
    () => ({
      from: period.from,
      to: period.to,
      department: params.get('department') ?? undefined,
      project: params.get('project') ?? undefined,
      kind: (params.get('kind') as IssueKind | null) ?? undefined,
    }),
    [period.from, period.to, params],
  )
  const setFilter = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') next.delete(k)
          else next.set(k, v)
        }
        return next
      },
      { replace: true },
    )

  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Which filters the shown data belongs to: anything else means a reload is in flight.
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [metric, setMetric] = useState<RatingMetric>('discipline')
  const [exporting, setExporting] = useState<string | null>(null)
  const key = JSON.stringify(filters)
  const loading = loadedKey !== key

  useEffect(() => {
    if (!slug) return
    getProjects(slug)
      .then(setProjects)
      .catch(() => undefined)
  }, [slug])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    const f = JSON.parse(key) as AnalyticsFilters
    Promise.all([
      getSummary(slug, f),
      getTrends(slug, f),
      getByDepartment(slug, f),
      getByAssignee(slug, f),
      getByProject(slug, f),
      getOverdue(slug, { ...f, limit: 10 }),
      getDeadlineChanges(slug, { ...f, limit: 6 }),
      getReactionTime(slug, f),
    ])
      .then(
        ([
          summary,
          trends,
          deps,
          assignees,
          byProject,
          overdue,
          moves,
          reaction,
        ]) => {
          if (cancelled) return
          setData({
            summary,
            trends,
            tree: deps.tree,
            assignees: assignees.items,
            projects: byProject.items,
            overdue,
            moves,
            reaction,
          })
          setError(null)
        },
      )
      .catch((err) => {
        if (cancelled) return
        setError(errorText(err, t('Не удалось загрузить аналитику')))
        // A department outside the viewer's area: drop the filter.
        if (f.department) setFilter({ department: null })
      })
      .finally(() => !cancelled && setLoadedKey(key))
    return () => {
      cancelled = true
    }
  }, [slug, key]) // eslint-disable-line react-hooks/exhaustive-deps

  async function exportReport(kind: 'pdf' | 'xlsx') {
    if (!slug) return
    setExporting(kind)
    try {
      await downloadReport(
        slug,
        kind === 'pdf' ? 'discipline.pdf' : 'assignments.xlsx',
        filters,
        kind === 'pdf'
          ? `${t('Справка об исполнении поручений')} ${filters.from}—${filters.to}.pdf`
          : `${t('Реестр поручений')} ${filters.from}—${filters.to}.xlsx`,
      )
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сформировать отчёт')))
    } finally {
      setExporting(null)
    }
  }

  const scopeLabel = !data
    ? ''
    : data.summary.scope.kind === 'all'
      ? t('Всё пространство')
      : data.summary.scope.kind === 'departments'
        ? t('Ваша зона ответственности: {{names}}', {
            names: data.summary.scope.department_ids
              .map((id) => findPath(data.tree, id)?.at(-1)?.name)
              .filter(Boolean)
              .join(', '),
          })
        : t('Ваши показатели')

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 sm:px-6">
        <BarChart3 size={16} className="text-muted-foreground" />
        <h1 className="text-sm font-semibold">{t('Аналитика')}</h1>
        {scopeLabel && (
          <span className="hidden truncate text-xs text-muted-foreground md:inline">
            · {scopeLabel}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5 print-hidden">
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportReport('pdf')}
            disabled={!!exporting || !data}
          >
            <FileDown size={14} />
            <span className="hidden sm:inline">
              {exporting === 'pdf' ? t('Формируем…') : t('Справка PDF')}
            </span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportReport('xlsx')}
            disabled={!!exporting || !data}
          >
            <FileSpreadsheet size={14} />
            <span className="hidden sm:inline">
              {exporting === 'xlsx' ? t('Формируем…') : t('Реестр Excel')}
            </span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.print()}
            disabled={!data}
            title={t('Печать')}
          >
            <Printer size={14} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" data-print="page">
        <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
          {/* Filters: one row above the charts. */}
          <div className="flex flex-wrap items-center gap-2 print-hidden">
            <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() =>
                    setFilter({
                      preset: p.key === '30d' ? null : p.key,
                      from: null,
                      to: null,
                    })
                  }
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    preset === p.key
                      ? 'bg-card shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {p.label()}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              {t('с')}
              <input
                type="date"
                value={period.from}
                max={period.to}
                onChange={(e) =>
                  e.target.value &&
                  setFilter({
                    preset: null,
                    from: e.target.value,
                    to: period.to,
                  })
                }
                className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
              />
              {t('по')}
              <input
                type="date"
                value={period.to}
                min={period.from}
                onChange={(e) =>
                  e.target.value &&
                  setFilter({
                    preset: null,
                    from: period.from,
                    to: e.target.value,
                  })
                }
                className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
              />
            </label>
            {/* Shown (disabled) while loading too: a select that appears with
                the data would re-wrap the toolbar and push the page down (12.F4). */}
            {(!data || data.tree.length > 0) && (
              <select
                value={filters.department ?? ''}
                onChange={(e) =>
                  setFilter({ department: e.target.value || null })
                }
                disabled={!data}
                className="max-w-60 rounded-md border border-input bg-background px-2 py-1 text-xs"
                aria-label={t('Подразделение')}
              >
                <option value="">{t('Все подразделения')}</option>
                {flatten(data?.tree ?? []).map(({ node, depth }) => (
                  <option key={node.id} value={node.id}>
                    {`${'  '.repeat(depth)}${node.name}`}
                  </option>
                ))}
              </select>
            )}
            <select
              value={filters.project ?? ''}
              onChange={(e) => setFilter({ project: e.target.value || null })}
              className="max-w-52 rounded-md border border-input bg-background px-2 py-1 text-xs"
              aria-label={t('Проект')}
            >
              <option value="">{t('Все проекты')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={filters.kind ?? ''}
              onChange={(e) => setFilter({ kind: e.target.value || null })}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              aria-label={t('Вид')}
            >
              <option value="">{t('Поручения и задачи')}</option>
              <option value="assignment">{t('Только поручения')}</option>
              <option value="task">{t('Только задачи')}</option>
            </select>
          </div>

          {/* Printed header (the screen has the toolbar instead). */}
          <div className="hidden print:block">
            <p className="text-lg font-semibold">{workspace?.name}</p>
            <p className="text-sm">
              {t('Аналитика исполнения поручений')} · {periodLabel(period)} ·{' '}
              {scopeLabel}
            </p>
          </div>

          {error && !data ? (
            <EmptyState
              icon={AlertCircle}
              title={t('Не удалось загрузить аналитику')}
              description={error}
            />
          ) : !data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
              <Skeleton className="h-64" />
            </div>
          ) : (
            <div
              className={cn(
                'space-y-4 transition-opacity',
                loading && 'opacity-60',
              )}
            >
              <Kpis data={data} filters={filters} />

              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard
                  title={t('Исполнено в срок, %')}
                  subtitle={t('по {{what}}', {
                    what:
                      data.trends.bucket === 'week'
                        ? t('неделям')
                        : t('месяцам'),
                  })}
                  table={
                    <DataTable
                      head={[
                        t('Период'),
                        t('Исполнено'),
                        t('В срок'),
                        t('С опозданием'),
                        t('Дисциплина'),
                      ]}
                      rows={data.trends.items.map((p) => [
                        bucketLabel(p.key, data.trends.bucket),
                        p.completed,
                        p.on_time,
                        p.late,
                        pct(p.discipline),
                      ])}
                    />
                  }
                >
                  <DisciplineTrend
                    items={data.trends.items}
                    bucket={data.trends.bucket}
                  />
                </ChartCard>
                <ChartCard
                  title={t('Исполнено: в срок и с опозданием')}
                  subtitle={t('щелчок по столбцу — список задач')}
                  table={
                    <DataTable
                      head={[
                        t('Период'),
                        t('В срок'),
                        t('С опозданием'),
                        t('Поступило'),
                      ]}
                      rows={data.trends.items.map((p) => [
                        bucketLabel(p.key, data.trends.bucket),
                        p.on_time,
                        p.late,
                        p.created,
                      ])}
                    />
                  }
                >
                  <CompletedTrend
                    items={data.trends.items}
                    bucket={data.trends.bucket}
                    onBucketClick={(p) =>
                      navigate(
                        issuesLink(filters, {
                          completed: { from: p.from, to: p.to },
                          title: t('Исполнено {{range}}', {
                            range: periodLabel(p),
                          }),
                        }),
                      )
                    }
                  />
                </ChartCard>
              </div>

              <DepartmentRating
                tree={data.tree}
                filters={filters}
                metric={metric}
                onMetric={setMetric}
                onDrill={(id) => setFilter({ department: id })}
                reaction={data.reaction}
              />

              <div className="grid gap-4 lg:grid-cols-2">
                <AssigneeLoad rows={data.assignees} filters={filters} />
                <OverdueTop overdue={data.overdue} filters={filters} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Moves moves={data.moves} />
                <ProjectsTable rows={data.projects} filters={filters} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── KPI ──────────────────────────────────────────────────────────────────────

function Kpis({ data, filters }: { data: Data; filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const c = data.summary.current
  const p = data.summary.previous
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        {t('Период: {{cur}}. Изменения — к прошлому периоду {{prev}}.', {
          cur: periodLabel(data.summary.period),
          prev: periodLabel(data.summary.previous_period),
        })}
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
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
          hint={t('в срок {{a}} · с опозданием {{b}}', {
            a: c.on_time,
            b: c.late,
          })}
          onClick={() =>
            navigate(
              issuesLink(filters, {
                completed: data.summary.period,
                title: t('Исполнено за {{p}}', {
                  p: periodLabel(data.summary.period),
                }),
              }),
            )
          }
        />
        <StatTile
          icon={Flame}
          label={t('Просрочено')}
          value={fmt(c.overdue)}
          critical={c.overdue > 0}
          delta={delta(c.overdue, p.overdue, { upIsGood: false })}
          onClick={() =>
            navigate(
              issuesLink(filters, {
                overdue: true,
                title: t('Просроченные поручения'),
              }),
            )
          }
        />
        <StatTile
          icon={Briefcase}
          label={t('В работе')}
          value={fmt(c.open)}
          hint={t('поступило за период: {{n}}', { n: c.created })}
          onClick={() =>
            navigate(issuesLink(filters, { open: true, title: t('В работе') }))
          }
        />
        <StatTile
          icon={CalendarClock}
          label={t('Переносов срока')}
          value={fmt(c.deadline_changes)}
          delta={delta(c.deadline_changes, p.deadline_changes, {
            upIsGood: false,
          })}
          hint={t('возвратов на доработку: {{n}}', { n: c.returns })}
        />
        <StatTile
          icon={Timer}
          label={t('Время реакции')}
          value={
            c.median_reaction_hours === null
              ? '—'
              : t('{{n}} ч', { n: fmt(c.median_reaction_hours) })
          }
          hint={t('медиана; исполнение — {{n}} дн.', {
            n: fmt(c.median_execution_days),
          })}
        />
      </div>
    </div>
  )
}

// ─── Department rating with drill-down ────────────────────────────────────────

function DepartmentRating({
  tree,
  filters,
  metric,
  onMetric,
  onDrill,
  reaction,
}: {
  tree: DepartmentNode[]
  filters: AnalyticsFilters
  metric: RatingMetric
  onMetric: (m: RatingMetric) => void
  onDrill: (id: string | null) => void
  reaction: ReactionTime
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const path = filters.department
    ? (findPath(tree, filters.department) ?? [])
    : []
  const current = path.at(-1)
  // The level being rated: the children of the chosen department (or of a single root).
  const level = current
    ? current.children.length > 0
      ? current.children
      : [current]
    : tree.length === 1 && tree[0]!.children.length > 0
      ? tree[0]!.children
      : tree
  const rows = level.filter((n) => hasWork(n.total))
  const valueOf = (n: DepartmentNode) =>
    metric === 'discipline'
      ? n.total.discipline
      : metric === 'overdue'
        ? n.total.overdue
        : n.total.open
  const sorted = [...rows].sort(
    (a, b) => (valueOf(b) ?? -1) - (valueOf(a) ?? -1),
  )
  const max =
    metric === 'discipline'
      ? 100
      : Math.max(1, ...rows.map((n) => valueOf(n) ?? 0))
  const reactionOf = new Map(
    reaction.by_department.map((r) => [r.department.id, r]),
  )

  const METRICS: { key: RatingMetric; label: string }[] = [
    { key: 'discipline', label: t('В срок, %') },
    { key: 'overdue', label: t('Просрочено') },
    { key: 'open', label: t('В работе') },
  ]

  return (
    <ChartCard
      title={t('Рейтинг подразделений')}
      subtitle={t(
        'щелчок по подразделению — уровень ниже; по просрочкам — список поручений',
      )}
      actions={
        <div className="flex gap-1 rounded-lg bg-muted p-0.5 print-hidden">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onMetric(m.key)}
              className={cn(
                'rounded-md px-2 py-0.5 text-xs',
                metric === m.key
                  ? 'bg-card shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      }
      table={
        <DataTable
          head={[
            t('Подразделение'),
            t('Поступило'),
            t('Исполнено'),
            t('В срок'),
            t('С опозданием'),
            t('Просрочено'),
            t('Дисциплина'),
            t('Реакция, ч'),
          ]}
          rows={sorted.map((n) => [
            n.name,
            n.total.created,
            n.total.completed,
            n.total.on_time,
            n.total.late,
            n.total.overdue,
            pct(n.total.discipline),
            fmt(reactionOf.get(n.id)?.median_hours ?? null),
          ])}
        />
      }
    >
      {path.length > 0 && (
        <nav className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground print-hidden">
          <button
            type="button"
            onClick={() => onDrill(null)}
            className="hover:text-foreground"
          >
            {t('Все подразделения')}
          </button>
          {path.map((n) => (
            <span key={n.id} className="flex items-center gap-1">
              <ChevronRight size={12} />
              <button
                type="button"
                onClick={() => onDrill(n.id)}
                className={cn(
                  'hover:text-foreground',
                  n.id === current?.id && 'font-medium text-foreground',
                )}
              >
                {n.short_name ?? n.name}
              </button>
            </span>
          ))}
        </nav>
      )}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('Нет данных за период.')}
        </p>
      ) : (
        <BarList
          max={max}
          rows={sorted.map((n) => {
            const v = valueOf(n)
            return {
              id: n.id,
              label: n.name,
              value: v,
              valueText: metric === 'discipline' ? pct(v) : fmt(v),
              tooltip: t(
                'Поступило {{c}}, исполнено {{d}} (в срок {{a}}, с опозданием {{b}}), в работе {{o}}',
                {
                  c: n.total.created,
                  d: n.total.completed,
                  a: n.total.on_time,
                  b: n.total.late,
                  o: n.total.open,
                },
              ),
              note:
                metric !== 'overdue' && n.total.overdue
                  ? t('просрочено: {{n}}', { n: n.total.overdue })
                  : undefined,
              noteCritical: true,
              onClick:
                n.children.length > 0 && n.id !== current?.id
                  ? () => onDrill(n.id)
                  : () =>
                      navigate(
                        issuesLink(filters, {
                          department: n.id,
                          open: true,
                          title: t('В работе: {{name}}', { name: n.name }),
                        }),
                      ),
              onNoteClick: () =>
                navigate(
                  issuesLink(filters, {
                    department: n.id,
                    overdue: true,
                    title: t('Просрочено: {{name}}', { name: n.name }),
                  }),
                ),
            }
          })}
        />
      )}
    </ChartCard>
  )
}

// ─── Load per person ──────────────────────────────────────────────────────────

function AssigneeLoad({
  rows,
  filters,
}: {
  rows: AssigneeRow[]
  filters: AnalyticsFilters
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const top = rows.filter((r) => r.open_primary + r.open_co > 0).slice(0, 10)
  const max = Math.max(1, ...top.map((r) => r.open_primary + r.open_co))
  return (
    <ChartCard
      title={t('Нагрузка исполнителей')}
      subtitle={t('открытые задачи')}
      table={
        <DataTable
          head={[
            t('Исполнитель'),
            t('Ответственный'),
            t('Соисполнитель'),
            t('Просрочено'),
            t('Исполнено'),
            t('Дисциплина'),
          ]}
          rows={rows.map((r) => [
            shortName(r.user),
            r.open_primary,
            r.open_co,
            r.overdue,
            r.completed,
            pct(r.discipline),
          ])}
        />
      }
    >
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--viz-1)]" />
          {t('Ответственный')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--viz-2)]" />
          {t('Соисполнитель')}
        </span>
      </div>
      {top.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('Открытых задач нет.')}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {top.map((r) => (
            <li
              key={r.user.id}
              className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 sm:grid-cols-[minmax(0,12rem)_1fr_auto]"
            >
              <button
                type="button"
                className="truncate text-left text-sm hover:text-primary"
                title={[r.user.position, r.department?.name]
                  .filter(Boolean)
                  .join(' · ')}
                onClick={() =>
                  navigate(
                    issuesLink(filters, {
                      assignee: r.user.id,
                      open: true,
                      title: t('В работе: {{name}}', {
                        name: shortName(r.user),
                      }),
                    }),
                  )
                }
              >
                {shortName(r.user)}
              </button>
              <span
                className="flex h-6 items-center gap-1.5"
                title={t('ответственный: {{a}}, соисполнитель: {{b}}', {
                  a: r.open_primary,
                  b: r.open_co,
                })}
              >
                <span
                  className="flex h-4 gap-[2px]"
                  style={{
                    width: `${((r.open_primary + r.open_co) / max) * 100}%`,
                  }}
                >
                  {r.open_primary > 0 && (
                    <span
                      className={cn(
                        'h-full bg-[var(--viz-1)]',
                        r.open_co === 0 && 'rounded-r-[4px]',
                      )}
                      style={{ flex: r.open_primary }}
                    />
                  )}
                  {r.open_co > 0 && (
                    <span
                      className="h-full rounded-r-[4px] bg-[var(--viz-2)]"
                      style={{ flex: r.open_co }}
                    />
                  )}
                </span>
                <span className="shrink-0 text-xs font-medium tabular-nums">
                  {r.open_primary + r.open_co}
                </span>
              </span>
              {r.overdue > 0 ? (
                <span className="flex items-center gap-0.5 text-xs text-[var(--viz-critical)]">
                  <Flame size={11} aria-hidden />
                  {r.overdue}
                </span>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  )
}

// ─── Top overdue ──────────────────────────────────────────────────────────────

function OverdueTop({
  overdue,
  filters,
}: {
  overdue: { total: number; items: OverdueItem[] }
  filters: AnalyticsFilters
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <ChartCard
      title={t('Топ просрочек')}
      subtitle={t('всего просрочено: {{n}}', { n: overdue.total })}
    >
      {overdue.items.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-[var(--viz-good-text)]">
          <CheckCircle2 size={15} />
          {t('Просроченных поручений нет.')}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {overdue.items.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                onClick={() =>
                  x.project &&
                  navigate(`/projects/${x.project.id}/work-items?issue=${x.id}`)
                }
                className="flex w-full items-start gap-2 py-2 text-left hover:text-primary"
              >
                <span className="mt-0.5 w-16 shrink-0 font-mono text-xs text-muted-foreground">
                  {x.key}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{x.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[
                      shortName(x.assignee),
                      x.department?.short_name ?? x.department?.name,
                      t('срок {{d}}', { d: shortDate(x.due_date) }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {x.deadline_changes > 0 &&
                      ` · ${t('переносов: {{n}}', { n: x.deadline_changes })}`}
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
      {overdue.total > overdue.items.length && (
        <button
          type="button"
          onClick={() =>
            navigate(
              issuesLink(filters, {
                overdue: true,
                title: t('Просроченные поручения'),
              }),
            )
          }
          className="mt-2 text-xs font-medium text-primary hover:underline print-hidden"
        >
          {t('Все просроченные: {{n}}', { n: overdue.total })}
        </button>
      )}
    </ChartCard>
  )
}

// ─── Deadline moves and returns ───────────────────────────────────────────────

function Moves({ moves }: { moves: DeadlineChanges }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const figures = [
    {
      label: t('Переносов одобрено'),
      value: moves.approved,
      icon: CalendarClock,
    },
    { label: t('Отклонено'), value: moves.rejected, icon: CalendarClock },
    { label: t('Ждут решения'), value: moves.pending, icon: CalendarClock },
    { label: t('Возвратов на доработку'), value: moves.returns, icon: Undo2 },
  ]
  return (
    <ChartCard title={t('Переносы сроков и возвраты')}>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {figures.map((f) => (
          <div key={f.label} className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-xl font-semibold">{f.value}</p>
            <p className="text-xs text-muted-foreground">{f.label}</p>
          </div>
        ))}
      </div>
      {moves.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('Сроки за период не переносились.')}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {moves.items.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() =>
                  m.project &&
                  navigate(
                    `/projects/${m.project.id}/work-items?issue=${m.issue_id}`,
                  )
                }
                className="w-full py-2 text-left hover:text-primary"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.key}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {m.title}
                  </span>
                  {m.shift_days !== null && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t('+{{n}} дн.', { n: m.shift_days })}
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {shortName(m.requested_by)}: «{m.reason}»
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  )
}

// ─── Projects ─────────────────────────────────────────────────────────────────

function ProjectsTable({
  rows,
  filters,
}: {
  rows: ProjectRow[]
  filters: AnalyticsFilters
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <ChartCard
      title={t('По проектам')}
      subtitle={t('прогресс — исполнено из всех задач проекта')}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('Нет данных.')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.project.id} className="flex items-center gap-3 py-2">
              <button
                type="button"
                onClick={() => navigate(`/projects/${r.project.id}/work-items`)}
                className="min-w-0 flex-1 text-left hover:text-primary"
              >
                <span className="block truncate text-sm">
                  {r.project.icon ? `${r.project.icon} ` : ''}
                  {r.project.name}
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-[var(--viz-1)]"
                      style={{ width: `${r.progress}%` }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {r.done}/{r.total} · {r.progress}%
                  </span>
                </span>
              </button>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums">
                {pct(r.discipline)}
              </span>
              {r.overdue > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      issuesLink(filters, {
                        project: r.project.id,
                        overdue: true,
                        title: t('Просрочено: {{name}}', {
                          name: r.project.name,
                        }),
                      }),
                    )
                  }
                  className="flex w-10 shrink-0 items-center justify-end gap-0.5 text-xs text-[var(--viz-critical)] hover:underline"
                >
                  <Flame size={11} aria-hidden />
                  {r.overdue}
                </button>
              ) : (
                <span className="w-10 shrink-0" />
              )}
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  )
}
