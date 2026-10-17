import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Check, Globe, Lock, Search, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import { PersonAvatar } from '@/components/ui/person-avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { fullName, shortName } from '@/lib/people'
import { PROJECT_STATUSES, type ProjectStatus, type ProjectVisibility } from '@/api/project'
import type { WorkspaceMember } from '@/api/workspace'
import { buildTree, flattenTree, type Department } from '@/api/department'
import { COLORS, ICONS, NONE, identifierFor, type ProjectFormValue } from './projectForm'

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

export function ProjectFields({
  value,
  onChange,
  members,
  departments,
  mode,
}: {
  value: ProjectFormValue
  onChange: (v: ProjectFormValue) => void
  members: WorkspaceMember[]
  departments: Department[]
  mode: 'create' | 'edit'
}) {
  const { t } = useTranslation()
  const set = <K extends keyof ProjectFormValue>(key: K, v: ProjectFormValue[K]) => onChange({ ...value, [key]: v })
  const deptRows = flattenTree(buildTree(departments))

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {/* Icon + colour */}
        <PopoverPrimitive.Root>
          <PopoverPrimitive.Trigger asChild>
            <button
              type="button"
              className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-xl text-3xl transition-shadow hover:shadow-md"
              style={{ background: `${value.color}26` }}
              title={t('Иконка и цвет')}
            >
              {value.icon}
            </button>
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content align="start" sideOffset={6} className="z-50 w-64 rounded-md border border-border bg-popover p-3 shadow-md">
              <div className="grid grid-cols-7 gap-1">
                {ICONS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => set('icon', i)}
                    className={cn('rounded p-1 text-xl hover:bg-accent', value.icon === i && 'bg-accent')}
                  >
                    {i}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set('color', c)}
                    className={cn('size-6 rounded-full ring-offset-2 ring-offset-popover', value.color === c && 'ring-2 ring-foreground')}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>

        <div className="grid flex-1 grid-cols-[1fr_120px] gap-3">
          <Field label={t('Название проекта')}>
            <Input
              autoFocus={mode === 'create'}
              value={value.name}
              placeholder={t('Например, «Аккредитация 2027»')}
              onChange={(e) =>
                onChange({
                  ...value,
                  name: e.target.value,
                  ...(mode === 'create' && { identifier: identifierFor(e.target.value) }),
                })
              }
            />
          </Field>
          <Field label={t('Ключ задач')}>
            <Input
              value={value.identifier}
              disabled={mode === 'edit'}
              placeholder="ACCR"
              onChange={(e) => set('identifier', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
            />
          </Field>
        </div>
      </div>

      <Field label={t('Описание')}>
        <Textarea
          rows={3}
          value={value.description}
          placeholder={t('Цель проекта, ожидаемый результат')}
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('Статус')}>
          <Select value={value.status} onValueChange={(v) => set('status', v as ProjectStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PROJECT_STATUSES) as ProjectStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: PROJECT_STATUSES[s].color }} />
                    {PROJECT_STATUSES[s].label()}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('Видимость')}>
          <Select value={value.visibility} onValueChange={(v) => set('visibility', v as ProjectVisibility)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">
                <span className="flex items-center gap-2">
                  <Globe size={14} />
                  {t('Открытый — видят все сотрудники')}
                </span>
              </SelectItem>
              <SelectItem value="private">
                <span className="flex items-center gap-2">
                  <Lock size={14} />
                  {t('Приватный — только участники')}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('Дата начала')}>
          <DatePicker value={value.start} onChange={(e) => set('start', e.target.value)} />
        </Field>
        <Field label={t('Плановая дата завершения')}>
          <DatePicker value={value.target} onChange={(e) => set('target', e.target.value)} />
        </Field>

        <Field label={t('Курирующее подразделение')}>
          <Select value={value.department_id || NONE} onValueChange={(v) => set('department_id', v === NONE ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder={t('Не выбрано')} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={NONE}>{t('Не выбрано')}</SelectItem>
              {deptRows.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  <span style={{ paddingLeft: d.depth * 12 }}>{d.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('Руководитель проекта')}>
          <Select value={value.lead_id || NONE} onValueChange={(v) => set('lead_id', v === NONE ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder={t('Не выбран')} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={NONE}>{t('Не выбран')}</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {shortName(m.user)}
                  {m.position ? ` · ${m.position}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {mode === 'create' && (
        <Field label={t('Участники проекта')}>
          <MembersPicker members={members} value={value.member_ids} onChange={(ids) => set('member_ids', ids)} />
        </Field>
      )}
    </div>
  )
}

function MembersPicker({
  members,
  value,
  onChange,
}: {
  members: WorkspaceMember[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const filtered = members.filter((m) =>
    [fullName(m.user), m.position ?? '', m.department?.name ?? ''].join(' ').toLowerCase().includes(needle),
  )
  const chosen = members.filter((m) => value.includes(m.user_id))
  return (
    <PopoverPrimitive.Root onOpenChange={() => setQ('')}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 text-left text-sm"
        >
          {chosen.length === 0 ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Users size={14} />
              {t('Добавить участников (вы будете добавлены автоматически)')}
            </span>
          ) : (
            chosen.map((m) => (
              <span key={m.user_id} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                <PersonAvatar person={{ ...m.user, id: m.user_id }} size={16} />
                {shortName(m.user)}
              </span>
            ))
          )}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content align="start" sideOffset={6} className="z-50 w-80 rounded-md border border-border bg-popover p-1 shadow-md">
          <div className="mb-1 flex items-center gap-2 border-b border-border px-2 pb-2">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('Поиск по ФИО, должности, подразделению…')}
              className="flex-1 bg-transparent py-1 text-sm outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.map((m) => {
              const selected = value.includes(m.user_id)
              return (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => onChange(selected ? value.filter((v) => v !== m.user_id) : [...value, m.user_id])}
                  className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <PersonAvatar person={{ ...m.user, id: m.user_id }} size={22} />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate">{shortName(m.user)}</span>
                    {m.position && <span className="block truncate text-xs text-muted-foreground">{m.position}</span>}
                  </span>
                  {selected && <Check className="size-3.5" />}
                </button>
              )
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
