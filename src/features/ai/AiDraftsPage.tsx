import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  FileUp,
  Loader2,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { shortName } from '@/lib/people'
import { dateInputToIso } from '@/lib/dates'
import { errorText } from '@/lib/errorMessages'
import { pluralize } from '@/lib/plural'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { refreshAiStatus } from '@/stores/aiStore'
import { ApiError } from '@/api/client'
import { draftIssues, type AiDraft, type AiDraftsResult } from '@/api/ai'
import {
  createIssue,
  distributeIssue,
  getIssue,
  type Issue,
  type IssuePriorityValue,
} from '@/api/issue'
import { getProjects, type Project } from '@/api/project'
import { getStates } from '@/api/state'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import { getDepartments, type Department } from '@/api/department'
import { PRIORITY_CONFIG } from '@/components/ui/status-badge'
import { WorkspaceIssuePanel } from '@/features/issues/WorkspaceIssuePanel'
import { AiCheckNote, AiMark } from './AiBits'
import { AiLayout } from './AiLayout'
import { fileToBase64 } from './files'

// «Создать из текста или протокола» (Ф11 11.F2): the document goes to AI (11.B2),
// the proposed assignments come back as editable rows, and nothing exists until
// the person presses «Создать N поручений». Rows are created one by one with the
// regular endpoints — a person to one assignee, departments as a distribution
// (6.B1) — marked `ai_assisted`. A failed row stays for a fix; the others go on.

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = '.docx,.pdf,.txt'
const PRIORITIES: IssuePriorityValue[] = [
  'urgent',
  'high',
  'medium',
  'low',
  'none',
]
const ASSIGNMENTS: [string, string, string] = [
  'поручение',
  'поручения',
  'поручений',
]

interface Row {
  id: number
  include: boolean
  title: string
  description: string
  priority: IssuePriorityValue
  mode: 'person' | 'distribution'
  assigneeId: string
  departmentIds: string[]
  controllerId: string
  due: string
  basis: string
  warnings: string[]
  quote: string | null
  assigneeText: string | null
  open: boolean
  created?: { key: string; id: string; projectId: string }
  error?: string
}

function toRow(d: AiDraft, i: number, me: string): Row {
  return {
    id: i,
    include: true,
    title: d.title,
    description: d.description,
    priority: d.priority === 'none' ? 'medium' : d.priority,
    mode: d.mode,
    assigneeId: d.assignee?.id ?? '',
    departmentIds: d.departments.map((x) => x.id),
    controllerId: d.controller?.id ?? me,
    due: d.due_date ?? '',
    basis: d.basis ?? '',
    warnings: d.warnings,
    quote: d.source_quote,
    assigneeText: d.assignee_text,
    open: false,
  }
}

/** Why a row cannot be created yet, or null. */
function problem(r: Row, t: (s: string) => string): string | null {
  if (!r.title.trim()) return t('Укажите название')
  if (r.mode === 'person' && !r.assigneeId) return t('Выберите исполнителя')
  if (r.mode === 'distribution' && r.departmentIds.length === 0)
    return t('Выберите подразделения')
  return null
}

const selectCls =
  'h-8 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60'

function DraftRow({
  row,
  members,
  departments,
  onChange,
}: {
  row: Row
  members: WorkspaceMember[]
  departments: Department[]
  onChange: (patch: Partial<Row>) => void
}) {
  const { t } = useTranslation()
  const done = Boolean(row.created)
  const issue = problem(row, t)
  const deptName = (id: string) => {
    const d = departments.find((x) => x.id === id)
    return d?.short_name ?? d?.name ?? '—'
  }
  const memberLabel = (m: WorkspaceMember) =>
    `${shortName(m.user)}${m.position ? ` — ${m.position}` : ''}`

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        done
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : row.include
            ? 'border-border bg-card'
            : 'border-dashed border-border bg-muted/30 opacity-70',
      )}
    >
      <div className="flex items-start gap-2">
        {done ? (
          <CheckCircle2
            size={18}
            className="mt-1.5 shrink-0 text-emerald-600"
          />
        ) : (
          <input
            type="checkbox"
            checked={row.include}
            onChange={(e) => onChange({ include: e.target.checked })}
            className="mt-2 size-4 shrink-0 accent-primary"
            aria-label={t('Создавать это поручение')}
          />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={row.title}
            onChange={(e) => onChange({ title: e.target.value })}
            disabled={done || !row.include}
            className="h-8 font-medium"
            aria-label={t('Название поручения')}
          />

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
            {/* Who: a person, or departments for a distribution */}
            <div className="space-y-1">
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={done || !row.include}
                  onClick={() => onChange({ mode: 'person' })}
                  className={cn(
                    'flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]',
                    row.mode === 'person'
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground',
                  )}
                >
                  <User size={11} />
                  {t('Исполнитель')}
                </button>
                <button
                  type="button"
                  disabled={done || !row.include}
                  onClick={() => onChange({ mode: 'distribution' })}
                  className={cn(
                    'flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]',
                    row.mode === 'distribution'
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground',
                  )}
                >
                  <Building2 size={11} />
                  {t('Подразделения')}
                </button>
              </div>
              {row.mode === 'person' ? (
                <select
                  value={row.assigneeId}
                  onChange={(e) => onChange({ assigneeId: e.target.value })}
                  disabled={done || !row.include}
                  className={cn(
                    selectCls,
                    !row.assigneeId && row.include && 'border-amber-500',
                  )}
                  aria-label={t('Исполнитель')}
                >
                  <option value="">
                    {row.assigneeText
                      ? t('Не найден: «{{name}}» — выберите', {
                          name: row.assigneeText,
                        })
                      : t('Выберите исполнителя')}
                  </option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {memberLabel(m)}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex flex-wrap items-center gap-1">
                  {row.departmentIds.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[11px]"
                    >
                      {deptName(id)}
                      {!done && row.include && (
                        <button
                          type="button"
                          onClick={() =>
                            onChange({
                              departmentIds: row.departmentIds.filter(
                                (x) => x !== id,
                              ),
                            })
                          }
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={t('Убрать')}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </span>
                  ))}
                  {!done && row.include && (
                    <select
                      value=""
                      onChange={(e) =>
                        e.target.value &&
                        onChange({
                          departmentIds: [...row.departmentIds, e.target.value],
                        })
                      }
                      className="h-6 max-w-40 rounded border border-input bg-background px-1 text-[11px]"
                      aria-label={t('Добавить подразделение')}
                    >
                      <option value="">{t('+ подразделение')}</option>
                      {departments
                        .filter((d) => !row.departmentIds.includes(d.id))
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            <label className="space-y-1">
              <span className="block text-[11px] text-muted-foreground">
                {t('Срок')}
              </span>
              <input
                type="date"
                value={row.due}
                onChange={(e) => onChange({ due: e.target.value })}
                disabled={done || !row.include}
                className={selectCls}
              />
            </label>

            <label className="space-y-1">
              <span className="block text-[11px] text-muted-foreground">
                {t('Контролёр')}
              </span>
              <select
                value={row.controllerId}
                onChange={(e) => onChange({ controllerId: e.target.value })}
                disabled={done || !row.include}
                className={selectCls}
              >
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {memberLabel(m)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="block text-[11px] text-muted-foreground">
                {t('Приоритет')}
              </span>
              <select
                value={row.priority}
                onChange={(e) =>
                  onChange({ priority: e.target.value as IssuePriorityValue })
                }
                disabled={done || !row.include}
                className={selectCls}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_CONFIG[p].label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {row.warnings.length > 0 && !done && (
            <ul className="space-y-0.5">
              {row.warnings.map((w) => (
                <li
                  key={w}
                  className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"
                >
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          )}
          {row.error && <p className="text-xs text-destructive">{row.error}</p>}
          {row.include && !done && issue && !row.error && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {issue}
            </p>
          )}
          {row.created && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              {t('Создано: {{key}}', { key: row.created.key })}
            </p>
          )}

          <button
            type="button"
            onClick={() => onChange({ open: !row.open })}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              size={12}
              className={cn('transition-transform', row.open && 'rotate-180')}
            />
            {t('Описание, основание и фрагмент протокола')}
          </button>
          {row.open && (
            <div className="space-y-2">
              <Textarea
                value={row.description}
                onChange={(e) => onChange({ description: e.target.value })}
                disabled={done || !row.include}
                rows={3}
                placeholder={t('Описание, требования к результату')}
                className="text-sm"
              />
              <Input
                value={row.basis}
                onChange={(e) => onChange({ basis: e.target.value })}
                disabled={done || !row.include}
                placeholder={t('Основание: протокол, приказ')}
                className="h-8 text-sm"
              />
              {row.quote && (
                <blockquote className="border-l-2 border-violet-400 pl-2 text-xs italic text-muted-foreground">
                  {row.quote}
                </blockquote>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function AiDraftsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const me = useAuthStore((s) => s.user?.id) ?? ''
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [seconds, setSeconds] = useState<number | null>(null)
  const [result, setResult] = useState<AiDraftsResult | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState(params.get('project') ?? '')
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [creating, setCreating] = useState(false)
  const [opened, setOpened] = useState<Issue | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    Promise.all([
      getProjects(slug).catch(() => [] as Project[]),
      getWorkspaceMembers(slug).catch(() => [] as WorkspaceMember[]),
      getDepartments(slug).catch(() => [] as Department[]),
    ]).then(([p, m, d]) => {
      if (cancelled) return
      const open = p.filter((x) => !x.is_archived)
      setProjects(open)
      setProjectId((prev) =>
        prev && open.some((x) => x.id === prev) ? prev : (open[0]?.id ?? ''),
      )
      setMembers(m.filter((x) => x.role !== 'guest'))
      setDepartments(d)
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  function pickFile(f: File | undefined | null) {
    if (!f) return
    if (!/\.(docx|pdf|txt)$/i.test(f.name)) {
      toast.error(t('Нужен файл .docx, .pdf или .txt'))
      return
    }
    if (f.size > MAX_BYTES) {
      toast.error(t('Файл больше 10 МБ'))
      return
    }
    setFile(f)
  }

  async function recognize() {
    if (!slug || busy || (!text.trim() && !file)) return
    setBusy(true)
    const started = performance.now()
    try {
      const res = await draftIssues(slug, {
        ...(text.trim() && { text: text.trim() }),
        ...(file && {
          file: { name: file.name, data: await fileToBase64(file) },
        }),
      })
      setSeconds(Math.round((performance.now() - started) / 1000))
      setResult(res)
      setRows(res.drafts.map((d, i) => toRow(d, i, me)))
      if (res.drafts.length === 0)
        toast.info(t('Поручений в документе не найдено'))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось распознать документ')))
      if (err instanceof ApiError && err.code === 'AI_LIMIT_REACHED')
        refreshAiStatus()
    } finally {
      setBusy(false)
    }
  }

  const update = (id: number, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch, error: undefined } : r)),
    )

  const ready = useMemo(
    () => rows.filter((r) => r.include && !r.created && !problem(r, t)),
    [rows, t],
  )
  const created = rows.filter((r) => r.created)
  const project = projects.find((p) => p.id === projectId)

  async function createAll() {
    if (!slug || !project || ready.length === 0 || creating) return
    setCreating(true)
    try {
      const states = await getStates(slug, project.id)
      const start =
        states.find((s) => s.is_default) ??
        states.find((s) => s.group === 'unstarted') ??
        states[0]
      let ok = 0
      for (const r of ready) {
        try {
          const common = {
            title: r.title.trim(),
            description: r.description.trim() || undefined,
            priority: r.priority,
            due_date: dateInputToIso(r.due),
            controller_id: r.controllerId || null,
            basis: r.basis.trim() || null,
            ai_assisted: true,
          }
          const issue =
            r.mode === 'distribution'
              ? await distributeIssue(slug, project.id, {
                  ...common,
                  department_ids: r.departmentIds,
                })
              : await createIssue(slug, project.id, {
                  ...common,
                  state_id: start!.id,
                  kind: 'assignment',
                  requires_review: true,
                  assignee_ids: [r.assigneeId],
                  primary_assignee_id: r.assigneeId,
                })
          ok++
          setRows((prev) =>
            prev.map((x) =>
              x.id === r.id
                ? {
                    ...x,
                    created: {
                      key: `${project.identifier}-${issue.sequence_id}`,
                      id: issue.id,
                      projectId: project.id,
                    },
                  }
                : x,
            ),
          )
        } catch (err) {
          setRows((prev) =>
            prev.map((x) =>
              x.id === r.id ? { ...x, error: errorText(err) } : x,
            ),
          )
        }
      }
      if (ok > 0) {
        toast.success(t('Создано: {{n}}', { n: pluralize(ok, ASSIGNMENTS) }))
      }
    } catch (err) {
      toast.error(errorText(err, t('Не удалось создать поручения')))
    } finally {
      setCreating(false)
    }
  }

  async function openCreated(r: Row) {
    if (!slug || !r.created) return
    try {
      setOpened(await getIssue(slug, r.created.projectId, r.created.id))
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  function restart() {
    setResult(null)
    setRows([])
    setText('')
    setFile(null)
    setSeconds(null)
  }

  return (
    <AiLayout>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
          {!result && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold">
                  {t('Поручения из протокола или текста')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'Загрузите протокол заседания, приказ или вставьте текст. AI найдёт поручения, подберёт исполнителей по оргструктуре и сроки — вы проверите и создадите их одной кнопкой.',
                  )}
                </p>
              </div>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  pickFile(e.dataTransfer.files[0])
                }}
                className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center"
              >
                <FileUp className="size-7 text-muted-foreground" />
                {file ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={t('Убрать файл')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('Перетащите файл .docx, .pdf или .txt (до 10 МБ) или')}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                >
                  {file ? t('Выбрать другой файл') : t('Выбрать файл')}
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    pickFile(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </div>

              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder={t(
                  'Или вставьте текст: «1. Деканам факультетов до 1 ноября представить отчёты о практике. Контроль возложить на проректора по учебной работе…»',
                )}
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={recognize}
                  disabled={busy || (!text.trim() && !file)}
                >
                  {busy ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  {busy ? t('AI читает документ…') : t('Распознать поручения')}
                </Button>
                <AiCheckNote>
                  {t(
                    'Текст документа отправляется AI-сервису. Ничего не создаётся без вашего подтверждения.',
                  )}
                </AiCheckNote>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <AiMark label={t('Черновики подготовлены AI')} />
                <span className="text-sm text-muted-foreground">
                  {t('Найдено: {{n}}', {
                    n: pluralize(result.drafts.length, ASSIGNMENTS),
                  })}
                  {seconds !== null && ` · ${t('{{s}} с', { s: seconds })}`}
                  {result.source.name && ` · ${result.source.name}`}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={restart}
                >
                  {t('Другой документ')}
                </Button>
              </div>
              {result.basis && (
                <p className="text-sm">
                  <span className="text-muted-foreground">
                    {t('Основание:')}
                  </span>{' '}
                  {result.basis}
                </p>
              )}
              <AiCheckNote>
                {t(
                  'Проверьте исполнителей, сроки и формулировки перед созданием: AI может ошибиться. Снимите галочку, чтобы пропустить поручение.',
                )}
              </AiCheckNote>

              <div className="space-y-2">
                {rows.map((r) => (
                  <DraftRow
                    key={r.id}
                    row={r}
                    members={members}
                    departments={departments}
                    onChange={(patch) => update(r.id, patch)}
                  />
                ))}
              </div>

              <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t('Проект')}</span>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="h-8 max-w-56 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {created.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    {created.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => openCreated(r)}
                        className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-emerald-700 hover:underline dark:text-emerald-300"
                      >
                        {r.created!.key}
                      </button>
                    ))}
                  </div>
                )}
                <div className="ml-auto flex gap-2">
                  {created.length > 0 && project && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        navigate(`/projects/${project.id}/work-items`)
                      }
                    >
                      {t('К задачам проекта')}
                    </Button>
                  )}
                  <Button
                    onClick={createAll}
                    disabled={creating || ready.length === 0 || !project}
                  >
                    {creating && <Loader2 size={15} className="animate-spin" />}
                    {ready.length > 0
                      ? t('Создать {{n}}', {
                          n: pluralize(ready.length, ASSIGNMENTS),
                        })
                      : t('Создать поручения')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {slug && (
        <WorkspaceIssuePanel
          slug={slug}
          issue={opened}
          onClose={() => setOpened(null)}
          onUpdated={(updated) => setOpened(updated)}
          onDeleted={() => setOpened(null)}
        />
      )}
    </AiLayout>
  )
}
