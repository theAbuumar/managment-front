import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { ListFilter, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PRIORITY_CONFIG } from '@/components/ui/status-badge'
import { STATE_GROUPS } from '@/api/state'
import type { Label } from '@/api/label'
import type { WorkspaceMember } from '@/api/workspace'
import { fullName, shortName } from '@/lib/people'
import { GROUPS, PRIORITIES, panelCount, type BoardFilters } from './filters'

const ANY = 'any'

function Chip({
  on,
  onClick,
  children,
  color,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
  color?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
        on
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-foreground hover:bg-muted',
      )}
    >
      {color && (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
      )}
      {children}
    </button>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value]

/**
 * «Фильтры» of a project's board (7.F5): type, state, priority, assignee and
 * labels on top of the quick filters. Everything goes into the address, so the
 * picture can be shared as a link or saved as a view.
 */
export function FilterPanel({
  filters,
  onChange,
  members,
  labels,
}: {
  filters: BoardFilters
  /** Gets the current filters and returns what changes. */
  onChange: (update: (current: BoardFilters) => Partial<BoardFilters>) => void
  members: WorkspaceMember[]
  labels: Label[]
}) {
  const { t } = useTranslation()
  const count = panelCount(filters)
  const people = [...members]
    .filter((m) => m.role !== 'guest')
    .sort((a, b) => fullName(a.user).localeCompare(fullName(b.user), 'ru'))

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={cn(count > 0 && 'border-primary/50 text-primary')}
          title={t('Фильтры')}
        >
          <ListFilter size={15} />
          <span className="hidden sm:inline">{t('Фильтры')}</span>
          {count > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">
              {count}
            </span>
          )}
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label={t('Фильтры')}
          className="z-50 max-h-[min(32rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw-1.5rem))] space-y-4 overflow-y-auto rounded-lg border border-border bg-popover p-4 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Section title={t('Тип')}>
            <Chip
              on={filters.kind === 'assignment'}
              onClick={() =>
                onChange((f) => ({
                  kind: f.kind === 'assignment' ? null : 'assignment',
                }))
              }
            >
              {t('Поручения')}
            </Chip>
            <Chip
              on={filters.kind === 'task'}
              onClick={() =>
                onChange((f) => ({ kind: f.kind === 'task' ? null : 'task' }))
              }
            >
              {t('Задачи')}
            </Chip>
          </Section>

          <Section title={t('Состояние')}>
            {GROUPS.map((g) => (
              <Chip
                key={g}
                on={filters.group.includes(g)}
                color={STATE_GROUPS[g].color}
                onClick={() => onChange((f) => ({ group: toggle(f.group, g) }))}
              >
                {STATE_GROUPS[g].label()}
              </Chip>
            ))}
          </Section>

          <Section title={t('Приоритет')}>
            {PRIORITIES.map((p) => {
              const Icon = PRIORITY_CONFIG[p].icon
              return (
                <Chip
                  key={p}
                  on={filters.priority.includes(p)}
                  onClick={() =>
                    onChange((f) => ({ priority: toggle(f.priority, p) }))
                  }
                >
                  <Icon size={12} />
                  {PRIORITY_CONFIG[p].label}
                </Chip>
              )
            })}
          </Section>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t('Исполнитель')}
            </p>
            <Select
              value={filters.assignee ?? ANY}
              onValueChange={(v) =>
                onChange(() => ({ assignee: v === ANY ? null : v }))
              }
            >
              <SelectTrigger aria-label={t('Исполнитель')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t('Любой')}</SelectItem>
                <SelectItem value="me">{t('Я')}</SelectItem>
                {people.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {shortName(m.user)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {labels.length > 0 && (
            <Section title={t('Метки')}>
              {labels.map((l) => (
                <Chip
                  key={l.id}
                  on={filters.label.includes(l.id)}
                  color={l.color}
                  onClick={() =>
                    onChange((f) => ({ label: toggle(f.label, l.id) }))
                  }
                >
                  {l.name}
                </Chip>
              ))}
            </Section>
          )}

          {count > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() =>
                onChange(() => ({
                  group: [],
                  priority: [],
                  assignee: null,
                  kind: null,
                  label: [],
                }))
              }
            >
              <X size={14} />
              {t('Сбросить фильтры')}
            </Button>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
