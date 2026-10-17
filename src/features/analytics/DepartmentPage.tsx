import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Building2,
  ChevronRight,
  Gauge,
  CheckCircle2,
  Flame,
  Briefcase,
  BarChart3,
  FileDown,
  Users,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getDepartments, type Department } from '@/api/department'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import { getWorkspaceIssues, type Issue } from '@/api/issue'
import {
  downloadReport,
  getByAssignee,
  getByDepartment,
  getSummary,
  type AssigneeRow,
  type DepartmentNode,
  type Summary,
} from '@/api/analytics'
import { ApiError } from '@/api/client'
import { errorText } from '@/lib/errorMessages'
import { fullName, shortName } from '@/lib/people'
import { pluralize } from '@/lib/plural'
import { IssueRow } from '@/features/issues/IssueRow'
import { WorkspaceIssuePanel } from '@/features/issues/WorkspaceIssuePanel'
import { StatTile } from './charts'
import { delta, fmt, issuesLink, pct, periodLabel } from './format'

// Страница подразделения (Ф10 10.F6): who works here, what they are doing, how
// on time they are, and the units below. Indicators follow the analytics rights
// (admins, the head of this unit or of a unit above it); others see the people,
// the open work and the structure without the figures.

function findNode(nodes: DepartmentNode[], id: string): DepartmentNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const sub = findNode(n.children, id)
    if (sub) return sub
  }
  return null
}

export function DepartmentPage() {
  const { id } = useParams()
  // A new department is a fresh page: keyed, so no state leaks between them.
  return id ? <DepartmentView key={id} id={id} /> : null
}

function DepartmentView({ id }: { id: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const [departments, setDepartments] = useState<Department[] | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [node, setNode] = useState<DepartmentNode | null>(null)
  const [load, setLoad] = useState<AssigneeRow[]>([])
  const [noAccess, setNoAccess] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      const [deps, mem, open] = await Promise.all([
        getDepartments(slug).catch(() => [] as Department[]),
        getWorkspaceMembers(slug).catch(() => [] as WorkspaceMember[]),
        getWorkspaceIssues(slug, {
          department: id,
          open: 'true',
          sort_by: 'due_date',
          order: 'asc',
          limit: 100,
        })
          .then((r) => r.data)
          .catch(() => [] as Issue[]),
      ])
      if (cancelled) return
      setDepartments(deps)
      setMembers(mem)
      setIssues(open)
      try {
        const [s, tree, people] = await Promise.all([
          getSummary(slug, { department: id }),
          getByDepartment(slug, { department: id }),
          getByAssignee(slug, { department: id }),
        ])
        if (cancelled) return
        setSummary(s)
        setNode(findNode(tree.tree, id))
        setLoad(people.items)
      } catch (err) {
        if (!cancelled && err instanceof ApiError && err.status === 403)
          setNoAccess(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, id])

  const dept = departments?.find((d) => d.id === id)
  const path = useMemo(() => {
    const byId = new Map((departments ?? []).map((d) => [d.id, d]))
    const result: Department[] = []
    let cur = dept?.parent_id ? byId.get(dept.parent_id) : undefined
    while (cur) {
      result.unshift(cur)
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    return result
  }, [departments, dept])
  const children = (departments ?? []).filter((d) => d.parent_id === id)
  const staff = members.filter((m) => m.department_id === id)
  const loadOf = new Map(load.map((r) => [r.user.id, r]))
  const selected = issues?.find((i) => i.id === selectedId) ?? null

  if (departments && !dept) {
    return (
      <EmptyState icon={AlertCircle} title={t('Подразделение не найдено')} />
    )
  }

  async function exportPdf() {
    if (!slug || !dept) return
    try {
      await downloadReport(
        slug,
        'discipline.pdf',
        { department: id },
        `${t('Справка')} — ${dept.name}.pdf`,
      )
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сформировать отчёт')))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 sm:px-6">
        <Building2 size={16} className="text-muted-foreground" />
        <nav className="flex min-w-0 items-center gap-1 text-sm">
          {path.map((p) => (
            <span
              key={p.id}
              className="hidden items-center gap-1 text-muted-foreground sm:flex"
            >
              <Link
                to={`/departments/${p.id}`}
                className="truncate hover:text-foreground"
              >
                {p.short_name ?? p.name}
              </Link>
              <ChevronRight size={13} />
            </span>
          ))}
          <span className="truncate font-semibold">{dept?.name ?? '…'}</span>
        </nav>
        {summary && (
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/analytics?department=${id}`)}
            >
              <BarChart3 size={14} />
              <span className="hidden sm:inline">{t('Аналитика')}</span>
            </Button>
            <Button size="sm" variant="outline" onClick={exportPdf}>
              <FileDown size={14} />
              <span className="hidden sm:inline">{t('Справка PDF')}</span>
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
          {!departments ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              {/* Head */}
              <div className="flex items-center gap-3">
                {dept?.head ? (
                  <>
                    <PersonAvatar person={dept.head} size={40} />
                    <div>
                      <p className="text-sm font-medium">
                        {fullName(dept.head)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {members.find((m) => m.user_id === dept.head_id)
                          ?.position ?? t('Руководитель')}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('Руководитель не назначен')}
                  </p>
                )}
              </div>

              {/* Indicators */}
              {summary ? (
                <section>
                  <h2 className="mb-2 text-sm font-semibold">
                    {t('Показатели')}{' '}
                    <span className="font-normal text-muted-foreground">
                      {periodLabel(summary.period)}
                    </span>
                  </h2>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatTile
                      icon={Gauge}
                      label={t('Исполнено в срок')}
                      value={pct(summary.current.discipline)}
                      delta={delta(
                        summary.current.discipline,
                        summary.previous.discipline,
                        { upIsGood: true, points: true },
                      )}
                    />
                    <StatTile
                      icon={CheckCircle2}
                      label={t('Исполнено')}
                      value={fmt(summary.current.completed)}
                    />
                    <StatTile
                      icon={Flame}
                      label={t('Просрочено')}
                      value={fmt(summary.current.overdue)}
                      critical={summary.current.overdue > 0}
                      onClick={() =>
                        navigate(
                          issuesLink(
                            {},
                            {
                              department: id,
                              overdue: true,
                              title: t('Просрочено: {{name}}', {
                                name: dept?.name ?? '',
                              }),
                            },
                          ),
                        )
                      }
                    />
                    <StatTile
                      icon={Briefcase}
                      label={t('В работе')}
                      value={fmt(summary.current.open)}
                    />
                  </div>
                </section>
              ) : noAccess ? (
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  {t(
                    'Показатели подразделения видят администраторы и руководители этого или вышестоящего подразделения.',
                  )}
                </p>
              ) : (
                <Skeleton className="h-24" />
              )}

              {/* Units below */}
              {children.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-semibold">
                    {t('Подразделения в составе')}
                  </h2>
                  <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {children.map((c) => {
                      const stats = node?.children.find(
                        (n) => n.id === c.id,
                      )?.total
                      return (
                        <Link
                          key={c.id}
                          to={`/departments/${c.id}`}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-muted/50"
                        >
                          <span className="min-w-0 flex-1 basis-48 truncate text-sm font-medium">
                            {c.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {c.head ? shortName(c.head) : t('нет руководителя')}
                          </span>
                          {stats && (
                            <span className="flex items-center gap-3 text-xs tabular-nums">
                              <span title={t('Исполнено в срок')}>
                                {pct(stats.discipline)}
                              </span>
                              <span className="text-muted-foreground">
                                {t('в работе: {{n}}', { n: stats.open })}
                              </span>
                              {stats.overdue > 0 && (
                                <span className="flex items-center gap-0.5 text-[var(--viz-critical)]">
                                  <Flame size={11} aria-hidden />
                                  {stats.overdue}
                                </span>
                              )}
                            </span>
                          )}
                          <ChevronRight
                            size={14}
                            className="text-muted-foreground"
                          />
                        </Link>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* People */}
              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Users size={14} />
                  {t('Сотрудники')}
                  <span className="font-normal text-muted-foreground">
                    {staff.length}
                  </span>
                </h2>
                {staff.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('В подразделении пока нет сотрудников.')}
                  </p>
                ) : (
                  <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {staff.map((m) => {
                      const l = loadOf.get(m.user_id)
                      return (
                        <div
                          key={m.user_id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
                        >
                          <PersonAvatar
                            person={{ ...m.user, id: m.user_id }}
                            size={28}
                          />
                          <span className="min-w-0 flex-1 basis-48">
                            <span className="block truncate text-sm">
                              {fullName(m.user)}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {m.position ?? '—'}
                            </span>
                          </span>
                          {l && (
                            <span className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                              <span>
                                {t('в работе: {{n}}', {
                                  n: l.open_primary + l.open_co,
                                })}
                              </span>
                              {l.overdue > 0 && (
                                <span className="flex items-center gap-0.5 text-[var(--viz-critical)]">
                                  <Flame size={11} aria-hidden />
                                  {l.overdue}
                                </span>
                              )}
                              <span title={t('Исполнено в срок')}>
                                {pct(l.discipline)}
                              </span>
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* Open work */}
              <section>
                <h2 className="mb-2 text-sm font-semibold">
                  {children.length > 0
                    ? t('Задачи в работе, вместе с подчинёнными')
                    : t('Задачи в работе')}{' '}
                  {issues && (
                    <span className="font-normal text-muted-foreground">
                      {pluralize(issues.length, [
                        t('задача'),
                        t('задачи'),
                        t('задач'),
                      ])}
                    </span>
                  )}
                </h2>
                {issues === null ? (
                  <Skeleton className="h-32" />
                ) : issues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('Открытых задач нет.')}
                  </p>
                ) : (
                  <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {issues.map((issue) => (
                      <IssueRow
                        key={issue.id}
                        issue={issue}
                        onOpen={() => setSelectedId(issue.id)}
                      />
                    ))}
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
            setIssues(
              (prev) =>
                prev?.map((i) => (i.id === updated.id ? updated : i)) ?? prev,
            )
          }
          onDeleted={(issueId) => {
            setIssues((prev) => prev?.filter((i) => i.id !== issueId) ?? prev)
            setSelectedId(null)
          }}
        />
      )}
    </div>
  )
}
