import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { errorText } from '@/lib/errorMessages'
import { useAuthStore } from '@/stores/authStore'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import type { IssueKind, IssuePriorityValue } from '@/api/issue'
import {
  createTemplate,
  updateTemplate,
  type IssueFields,
  type IssueTemplate,
} from '@/api/templates'
import {
  AssigneesChip,
  ControllerChip,
  PriorityChip,
} from '@/features/work-items/CreateIssueDialog'
import { ChecklistEditor } from './ChecklistEditor'

// A template of a typical issue (Ф6 6.F3): created in the settings or with
// «Сохранить как шаблон» from an issue, changed by its author or an admin. A
// workspace template is for admins and has no labels (ADR-030).

export interface TemplateDraft {
  name: string
  data: IssueFields
  due_in_days: number | null
}

export function TemplateDialog({
  open,
  onOpenChange,
  slug,
  projectId,
  template,
  initial,
  canWorkspace,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  /** The project of a new template; null — a workspace template. */
  projectId: string | null
  /** Edit this one. */
  template?: IssueTemplate | null
  /** A new template prefilled (from an issue). */
  initial?: TemplateDraft | null
  /** Admins may make a new template workspace-wide. */
  canWorkspace: boolean
  onSaved: (template: IssueTemplate) => void
}) {
  const { t } = useTranslation()
  const me = useAuthStore((s) => s.user?.id)
  const source: TemplateDraft = template
    ? {
        name: template.name,
        data: template.data,
        due_in_days: template.due_in_days,
      }
    : (initial ?? {
        name: '',
        data: { title: '', kind: 'assignment' },
        due_in_days: 7,
      })
  const [name, setName] = useState(source.name)
  const [kind, setKind] = useState<IssueKind>(source.data.kind ?? 'task')
  const [title, setTitle] = useState(source.data.title)
  const [description, setDescription] = useState(source.data.description ?? '')
  const [basis, setBasis] = useState(source.data.basis ?? '')
  const [priority, setPriority] = useState<IssuePriorityValue>(
    source.data.priority ?? 'none',
  )
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    source.data.assignee_ids ?? [],
  )
  const [primaryId, setPrimaryId] = useState<string | undefined>(
    source.data.primary_assignee_id,
  )
  const [controllerId, setControllerId] = useState(
    source.data.controller_id ?? me ?? '',
  )
  const [requiresReview, setRequiresReview] = useState(
    source.data.requires_review ?? true,
  )
  const [dueInDays, setDueInDays] = useState(
    source.due_in_days === null ? '' : String(source.due_in_days),
  )
  const [checklist, setChecklist] = useState<string[]>(
    source.data.checklist ?? [],
  )
  const [workspaceWide, setWorkspaceWide] = useState(
    template ? template.project_id === null : projectId === null,
  )
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const list = await getWorkspaceMembers(slug).catch(() => [])
      if (!cancelled) setMembers(list)
    })()
    return () => {
      cancelled = true
    }
  }, [open, slug])

  const isAssignment = kind === 'assignment'
  const primary =
    primaryId && assigneeIds.includes(primaryId) ? primaryId : assigneeIds[0]
  const scopeFixed = Boolean(template) || projectId === null || !canWorkspace

  async function save() {
    if (!name.trim() || !title.trim() || busy) return
    setBusy(true)
    const days =
      dueInDays.trim() === ''
        ? null
        : Math.min(365, Math.max(0, Number(dueInDays) || 0))
    const data: IssueFields = {
      title: title.trim(),
      kind,
      priority,
      ...(description.trim() && { description: description.trim() }),
      assignee_ids: assigneeIds,
      ...(primary && { primary_assignee_id: primary }),
      // Labels belong to a project: a workspace template has none.
      ...(!workspaceWide &&
        source.data.label_ids?.length && { label_ids: source.data.label_ids }),
      ...(checklist.length > 0 && { checklist }),
      ...(isAssignment && {
        controller_id: controllerId || null,
        requires_review: requiresReview,
        basis: basis.trim() || null,
      }),
    }
    try {
      const saved = template
        ? await updateTemplate(slug, template.id, {
            name: name.trim(),
            data,
            due_in_days: days,
          })
        : await createTemplate(slug, {
            name: name.trim(),
            project_id: workspaceWide ? null : projectId,
            data,
            due_in_days: days,
          })
      toast.success(
        template
          ? t('Шаблон сохранён')
          : t('Шаблон «{{name}}» создан', { name: saved.name }),
      )
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сохранить шаблон')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? t('Шаблон') : t('Новый шаблон')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'По шаблону форма создания заполняется одним щелчком: поля, контролёр, срок и чек-лист.',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('Название шаблона')}
            <Input
              autoFocus
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('Например, «Отчёт кафедры к аккредитации»')}
            />
          </label>

          {!scopeFixed && (
            <div
              className="flex gap-1 rounded-lg bg-muted p-1"
              role="radiogroup"
              aria-label={t('Где доступен')}
            >
              {[
                { ws: false, label: t('В этом проекте') },
                { ws: true, label: t('Во всём пространстве') },
              ].map((o) => (
                <button
                  key={String(o.ws)}
                  type="button"
                  role="radio"
                  aria-checked={workspaceWide === o.ws}
                  onClick={() => setWorkspaceWide(o.ws)}
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-sm transition-colors',
                    workspaceWide === o.ws
                      ? 'bg-card shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {(
              [
                { k: 'assignment', label: t('Поручение') },
                { k: 'task', label: t('Задача') },
              ] as const
            ).map(({ k, label }) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                  kind === k
                    ? 'bg-card font-medium shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {k === 'assignment' && (
                  <ShieldCheck size={14} className="text-primary" />
                )}
                {label}
              </button>
            ))}
          </div>

          <Input
            placeholder={
              isAssignment ? t('Что поручается?') : t('Название задачи')
            }
            value={title}
            maxLength={500}
            onChange={(e) => setTitle(e.target.value)}
            aria-label={t('Название задачи')}
          />
          <Textarea
            placeholder={t('Описание, требования к результату (необязательно)')}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {isAssignment && (
            <Input
              placeholder={t(
                'Основание: например, «Протокол ректората №5 от 12.10.2026»',
              )}
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
            />
          )}

          <div className="flex flex-wrap gap-1.5">
            <PriorityChip value={priority} onChange={setPriority} />
            <AssigneesChip
              members={members}
              value={assigneeIds}
              primary={primary}
              onChange={setAssigneeIds}
              onPrimary={setPrimaryId}
            />
            {isAssignment && (
              <ControllerChip
                members={members}
                value={controllerId}
                onChange={setControllerId}
              />
            )}
          </div>

          {isAssignment && (
            <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span className="text-sm">
                {t('Требует проверки результата')}
              </span>
              <Switch
                checked={requiresReview}
                onCheckedChange={setRequiresReview}
              />
            </label>
          )}

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

          <div className="rounded-md border border-border p-2">
            <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('Чек-лист')}
            </p>
            <ChecklistEditor value={checklist} onChange={setChecklist} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Отмена')}
          </Button>
          <Button
            onClick={save}
            disabled={busy || !name.trim() || !title.trim()}
          >
            {busy ? t('Сохраняем…') : t('Сохранить шаблон')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
