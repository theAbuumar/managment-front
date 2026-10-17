import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ChevronRight, Send } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { shortName } from '@/lib/people'
import { pluralize } from '@/lib/plural'
import { dateInputToIso } from '@/lib/dates'
import { errorText } from '@/lib/errorMessages'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import {
  distributeIssue,
  type Issue,
  type IssuePriorityValue,
} from '@/api/issue'
import { getDepartmentTree, type DepartmentNode } from '@/api/department'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import { ControllerChip, DueDateChip, PriorityChip } from './CreateIssueDialog'

// «Разослать подразделениям» (Ф6 6.F1): one assignment for many departments.
// Pick departments in the org tree; each head becomes the responsible person of
// their department's copy, the controller and deadline are shared. The preview
// says exactly what will be created before anything is.

const TASKS: [string, string, string] = ['поручение', 'поручения', 'поручений']

function flatten(nodes: DepartmentNode[]): DepartmentNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)])
}

export function DistributeDialog({
  open,
  onOpenChange,
  slug,
  projectId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  slug: string
  projectId: string
  onCreated: (parent: Issue) => void
}) {
  const { t } = useTranslation()
  const me = useAuthStore((s) => s.user?.id)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [basis, setBasis] = useState('')
  const [priority, setPriority] = useState<IssuePriorityValue>('none')
  const [controllerId, setControllerId] = useState('')
  const [requiresReview, setRequiresReview] = useState(true)
  const [due, setDue] = useState('')
  const [tree, setTree] = useState<DepartmentNode[] | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setControllerId((prev) => prev || me || '')
      const [deps, mem] = await Promise.all([
        getDepartmentTree(slug).catch(() => [] as DepartmentNode[]),
        getWorkspaceMembers(slug).catch(() => []),
      ])
      if (cancelled) return
      setTree(deps)
      setMembers(mem)
      // Open the first two levels: Ректорат → проректораты and their units.
      setExpanded(
        new Set(deps.flatMap((d) => [d.id, ...d.children.map((c) => c.id)])),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [open, slug, me])

  const all = useMemo(() => flatten(tree ?? []), [tree])
  const byId = useMemo(() => new Map(all.map((d) => [d.id, d])), [all])
  const faculties = useMemo(
    () => all.filter((d) => /факультет/i.test(d.name) && d.head_id),
    [all],
  )
  const chosen = all.filter((d) => selected.has(d.id))

  function reset() {
    setTitle('')
    setDescription('')
    setBasis('')
    setPriority('none')
    setControllerId('')
    setRequiresReview(true)
    setDue('')
    setSelected(new Set())
  }

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on && byId.get(id)?.head_id) next.add(id)
        else next.delete(id)
      }
      return next
    })

  async function submit() {
    if (!title.trim() || chosen.length === 0 || busy) return
    setBusy(true)
    try {
      const parent = await distributeIssue(slug, projectId, {
        title: title.trim(),
        description: description.trim() || null,
        basis: basis.trim() || null,
        priority,
        due_date: dateInputToIso(due),
        controller_id: controllerId || null,
        requires_review: requiresReview,
        department_ids: chosen.map((d) => d.id),
      })
      toast.success(
        t('Разослано: {{n}}', { n: pluralize(chosen.length, TASKS) }),
      )
      onCreated(parent)
      reset()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DEPARTMENT_HAS_NO_HEAD') {
        const names = (
          err.details as { departments?: { name: string }[] } | undefined
        )?.departments
        toast.error(
          t(
            'Не назначен руководитель: {{names}}. Назначьте его в оргструктуре.',
            {
              names: names?.map((d) => d.name).join(', ') ?? '',
            },
          ),
        )
      } else toast.error(errorText(err, t('Не удалось разослать поручение')))
    } finally {
      setBusy(false)
    }
  }

  // A render helper, not a component: the tree must not remount on every keystroke.
  function renderNode(node: DepartmentNode, depth: number): React.ReactNode {
    const isOpen = expanded.has(node.id)
    const childIds = node.children.map((c) => c.id)
    const childrenOn = childIds.filter((id) => selected.has(id)).length
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1.5 py-1"
          style={{ paddingLeft: depth * 16 }}
        >
          <button
            type="button"
            onClick={() =>
              setExpanded((prev) => {
                const next = new Set(prev)
                if (next.has(node.id)) next.delete(node.id)
                else next.add(node.id)
                return next
              })
            }
            className={cn(
              'rounded p-0.5 text-muted-foreground hover:bg-muted',
              node.children.length === 0 && 'invisible',
            )}
            aria-label={isOpen ? t('Свернуть') : t('Развернуть')}
          >
            <ChevronRight
              size={14}
              className={cn('transition-transform', isOpen && 'rotate-90')}
            />
          </button>
          <label
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2',
              !node.head_id && 'opacity-60',
            )}
          >
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={selected.has(node.id)}
              disabled={!node.head_id}
              onChange={(e) => toggle([node.id], e.target.checked)}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{node.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {node.head
                  ? shortName(node.head)
                  : t('нет руководителя — нельзя выбрать')}
              </span>
            </span>
          </label>
          {node.children.length > 0 && (
            <button
              type="button"
              onClick={() => toggle(childIds, childrenOn < childIds.length)}
              className="shrink-0 rounded px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10"
            >
              {childrenOn < childIds.length
                ? t('все подчинённые')
                : t('снять подчинённые')}
            </button>
          )}
        </div>
        {isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send size={18} className="text-primary" />
            {t('Разослать подразделениям')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            autoFocus
            placeholder={t('Что поручается?')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder={t('Описание, требования к результату (необязательно)')}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Input
            placeholder={t(
              'Основание: например, «Протокол ректората №5 от 12.10.2026»',
            )}
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            <PriorityChip value={priority} onChange={setPriority} />
            <ControllerChip
              members={members}
              value={controllerId}
              onChange={setControllerId}
            />
            <DueDateChip value={due} onChange={setDue} />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <span>
              <span className="block text-sm font-medium">
                {t('Требует проверки результата')}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t(
                  'Каждое подразделение сдаёт отчёт, контролёр принимает или возвращает на доработку.',
                )}
              </span>
            </span>
            <Switch
              checked={requiresReview}
              onCheckedChange={setRequiresReview}
            />
          </label>

          <div className="rounded-md border border-border">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <span className="text-sm font-medium">{t('Подразделения')}</span>
              {faculties.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    toggle(
                      faculties.map((f) => f.id),
                      true,
                    )
                  }
                  className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-accent"
                >
                  {t('Все факультеты ({{n}})', { n: faculties.length })}
                </button>
              )}
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('Снять все')}
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto px-2 py-1">
              {tree === null ? (
                <Skeleton className="my-2 h-24 w-full" />
              ) : tree.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  {t(
                    'Оргструктура пуста. Добавьте подразделения в настройках.',
                  )}
                </p>
              ) : (
                tree.map((n) => renderNode(n, 0))
              )}
            </div>
          </div>

          {/* Preview of what will be created. */}
          {chosen.length > 0 && (
            <div className="rounded-md bg-muted/60 px-3 py-2 text-sm">
              <p className="font-medium">
                {t('Будет создано: {{n}}, у каждого подразделения своё.', {
                  n: pluralize(chosen.length, TASKS),
                })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('Ответственные:')}{' '}
                {chosen
                  .map(
                    (d) => `${shortName(d.head)} (${d.short_name ?? d.name})`,
                  )
                  .join(', ')}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Отмена')}
          </Button>
          <Button
            onClick={submit}
            disabled={busy || !title.trim() || chosen.length === 0}
          >
            {busy
              ? t('Рассылаем…')
              : chosen.length
                ? t('Разослать: {{n}}', { n: pluralize(chosen.length, TASKS) })
                : t('Разослать')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
