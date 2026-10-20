import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import { PersonAvatar } from '@/components/ui/person-avatar'
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
import { createCycle, updateCycle, type CycleInput } from '@/api/cycle'
import {
  MODULE_STATUSES,
  createModule,
  updateModule,
  type ModuleInput,
  type ModuleStatus,
} from '@/api/module'
import type { WorkspaceMember } from '@/api/workspace'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { dateInputToIso, isoToDateInput } from '@/lib/dates'
import { errorText } from '@/lib/errorMessages'
import { fullName, shortName } from '@/lib/people'
import { cn } from '@/lib/utils'
import { scopeEnd, type Scope, type ScopeKind } from './scopes'

const NONE = '__none__'

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  )
}

/**
 * Create or edit a cycle (name, description, period) or a module (also status
 * and lead). Open it with a fresh `key` so the form starts from `item`.
 */
export function ScopeDialog({
  kind,
  item,
  open,
  onOpenChange,
  slug,
  projectId,
  members,
  onSaved,
}: {
  kind: ScopeKind
  /** null — a new one. */
  item: Scope | null
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  projectId: string
  /** For a module's lead; deactivated ones are shown only as the current lead. */
  members: WorkspaceMember[]
  onSaved: (item: Scope) => void
}) {
  const { t } = useTranslation()
  const timeZone = useWorkspaceStore((s) => s.workspace?.timezone)
  const initial = {
    name: item?.name ?? '',
    description: item?.description ?? '',
    start: isoToDateInput(item?.start_date, timeZone),
    end: isoToDateInput(item ? scopeEnd(item) : null, timeZone),
    // A new module is usually work that is already going on.
    status: item && 'lead_id' in item ? item.status : ('in_progress' as const),
    lead: (item && 'lead_id' in item ? item.lead_id : null) ?? '',
  }
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const isCycle = kind === 'cycle'
  // The same rule as the server's (400): the end may be the start day itself.
  const datesWrong = !!form.start && !!form.end && form.end < form.start
  const name = form.name.trim()

  // A lead can be anyone who may be given work (ADR-031); the current lead
  // stays in the list even after losing that, so editing does not drop them.
  const leads = members
    .filter(
      (m) =>
        (m.role !== 'guest' && !m.deactivated_at) || m.user_id === initial.lead,
    )
    .sort((a, b) => fullName(a.user).localeCompare(fullName(b.user), 'ru'))

  async function submit() {
    if (!name || datesWrong || saving) return
    setSaving(true)
    const description = form.description.trim()
    const start = dateInputToIso(form.start)
    const end = dateInputToIso(form.end)
    try {
      let saved: Scope
      if (isCycle) {
        const body: CycleInput = {
          name,
          ...(description
            ? { description }
            : item?.description
              ? { description: null }
              : {}),
          start_date: start,
          end_date: end,
        }
        saved = item
          ? await updateCycle(slug, projectId, item.id, body)
          : await createCycle(slug, projectId, body)
      } else {
        const body: ModuleInput = {
          name,
          ...(description
            ? { description }
            : item?.description
              ? { description: null }
              : {}),
          status: form.status,
          start_date: start,
          target_date: end,
        }
        // Only a changed lead is sent: the server checks a sent lead again.
        if (!item || form.lead !== initial.lead)
          body.lead_id = form.lead || null
        saved = item
          ? await updateModule(slug, projectId, item.id, body)
          : await createModule(slug, projectId, body)
      }
      onSaved(saved)
      onOpenChange(false)
      toast.success(
        item
          ? t('Изменения сохранены')
          : isCycle
            ? t('Этап «{{name}}» создан', { name: saved.name })
            : t('Модуль «{{name}}» создан', { name: saved.name }),
      )
    } catch (err) {
      toast.error(
        errorText(
          err,
          isCycle
            ? t('Не удалось сохранить этап')
            : t('Не удалось сохранить модуль'),
        ),
      )
    } finally {
      setSaving(false)
    }
  }

  const title = item
    ? isCycle
      ? t('Изменить этап')
      : t('Изменить модуль')
    : isCycle
      ? t('Новый этап')
      : t('Новый модуль')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {!item && (
            <DialogDescription>
              {isCycle
                ? t(
                    'Период работы проекта: семестр, квартал, подготовка к проверке. Задачи добавляются на доске этапа.',
                  )
                : t(
                    'Постоянное направление работы со своим руководителем. Задачи добавляются на доске модуля.',
                  )}
            </DialogDescription>
          )}
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field label={t('Название')} htmlFor="scope-name">
            <Input
              id="scope-name"
              autoFocus
              maxLength={255}
              value={form.name}
              placeholder={
                isCycle
                  ? t('Например, «Осенний семестр 2026»')
                  : t('Например, «Приёмная кампания»')
              }
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>

          <Field label={t('Описание')} htmlFor="scope-description">
            <Textarea
              id="scope-description"
              rows={3}
              maxLength={10_000}
              value={form.description}
              placeholder={
                isCycle
                  ? t('Что должно быть сделано к концу этапа')
                  : t('За что отвечает модуль, какой результат ожидается')
              }
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>

          {!isCycle && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('Статус')}>
                <Select
                  value={form.status}
                  onValueChange={(v) => set('status', v as ModuleStatus)}
                >
                  <SelectTrigger aria-label={t('Статус')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MODULE_STATUSES) as ModuleStatus[]).map(
                      (s) => (
                        <SelectItem key={s} value={s}>
                          <span className="flex items-center gap-2">
                            <span
                              className="size-2 rounded-full"
                              style={{ background: MODULE_STATUSES[s].color }}
                            />
                            {MODULE_STATUSES[s].label()}
                          </span>
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('Руководитель')}>
                <Select
                  value={form.lead || NONE}
                  onValueChange={(v) => set('lead', v === NONE ? '' : v)}
                >
                  <SelectTrigger aria-label={t('Руководитель')}>
                    <SelectValue placeholder={t('Не назначен')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={NONE}>{t('Не назначен')}</SelectItem>
                    {leads.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        <span className="flex min-w-0 items-center gap-2">
                          <PersonAvatar
                            person={{ ...m.user, id: m.user_id }}
                            size={18}
                            title={false}
                          />
                          <span className="truncate">
                            {shortName(m.user)}
                            {m.position ? ` · ${m.position}` : ''}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Начало')} htmlFor="scope-start">
              <DatePicker
                id="scope-start"
                value={form.start}
                max={form.end || undefined}
                onChange={(e) => set('start', e.target.value)}
              />
            </Field>
            <Field
              label={isCycle ? t('Окончание') : t('Плановое завершение')}
              htmlFor="scope-end"
            >
              <DatePicker
                id="scope-end"
                value={form.end}
                min={form.start || undefined}
                aria-invalid={datesWrong || undefined}
                className={cn(datesWrong && 'border-destructive')}
                onChange={(e) => set('end', e.target.value)}
              />
            </Field>
            {datesWrong && (
              <p
                role="alert"
                className="col-span-2 -mt-1 text-xs text-destructive"
              >
                {isCycle
                  ? t('Окончание этапа не может быть раньше его начала.')
                  : t('Плановое завершение не может быть раньше начала.')}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('Отмена')}
            </Button>
            <Button type="submit" disabled={!name || datesWrong || saving}>
              {item
                ? t('Сохранить')
                : isCycle
                  ? t('Создать этап')
                  : t('Создать модуль')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
