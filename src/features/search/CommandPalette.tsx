import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { matchPath, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  BarChart3,
  Bell,
  Building2,
  ChevronRight,
  CircleDot,
  FolderOpen,
  History,
  Info,
  Loader2,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  User,
  UserRound,
  Repeat,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { searchWorkspace, type SearchResult } from '@/api/search'
import { getProjects, type Project } from '@/api/project'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useMyRole } from '@/stores/summaryStore'
import { useAiEnabled } from '@/stores/aiStore'
import { useTheme } from '@/contexts/ThemeContext'
import { FEATURES } from '@/lib/features'
import { shortName } from '@/lib/people'
import { cn } from '@/lib/utils'
import { Highlight } from './Highlight'
import { paletteShortcut, usePaletteStore } from './paletteStore'

// Command palette (Ф7 7.F3): Ctrl+K (⌘K) or «/» anywhere, or the search field in
// the Topbar. Typing searches the workspace (GET WS/search: issues with Russian
// morphology, projects, people, departments) and filters the actions; ↑↓ pick,
// Enter opens. «Новое поручение…» and «Сменить пространство…» open a second
// step inside the palette; Backspace on an empty field goes back.

type Mode = 'root' | 'create' | 'workspace'

interface Item {
  id: string
  icon: ReactNode
  label: ReactNode
  hint?: ReactNode
  /** Second line (a description fragment with the matches). */
  extra?: ReactNode
  /** Shown at the right edge (a key, a chevron for the next step). */
  aside?: ReactNode
  run: () => void
}

interface Section {
  title: string
  items: Item[]
}

const SEARCH_DELAY_MS = 180

/** Lower-cased words of the query («ё» as «е»): every one must occur in the action's text. */
function words(q: string): string[] {
  return q.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean)
}

function matches(text: string, ws: string[]): boolean {
  const hay = text.toLowerCase().replace(/ё/g, 'е')
  return ws.every((w) => hay.includes(w))
}

const iconOf = (Icon: LucideIcon) => (
  <Icon size={15} className="shrink-0 text-muted-foreground" />
)

/** Focus is in a text field: «/» types a slash there instead of opening the palette. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return (
    el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
  )
}

export function CommandPalette() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const open = usePaletteStore((s) => s.open)
  const setOpen = usePaletteStore((s) => s.setOpen)
  const workspace = useWorkspaceStore((s) => s.workspace)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)
  const role = useMyRole()
  const aiEnabled = useAiEnabled()
  const { theme, toggle } = useTheme()
  const slug = workspace?.slug

  const [mode, setMode] = useState<Mode>('root')
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  // Projects for «Новое поручение…», kept with the workspace they belong to.
  const [loadedProjects, setLoadedProjects] = useState<{
    slug: string
    list: Project[]
  } | null>(null)
  const projects =
    loadedProjects && loadedProjects.slug === slug ? loadedProjects.list : null
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const requestNo = useRef(0)

  const admin = role === 'owner' || role === 'admin'
  const guest = role === 'guest'

  // Hotkeys: Ctrl/⌘+K toggles (by key position, so it works in the Russian
  // layout too); «/» opens and «C» creates (7.F8) unless the user is typing or
  // another dialog is open. «C» on a project's board opens its create dialog
  // (?create=1), anywhere else — «Новое поручение…» with a choice of project.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyK') {
        e.preventDefault()
        setOpen(!usePaletteStore.getState().open)
        return
      }
      const free =
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.repeat &&
        !typing(e.target) &&
        !usePaletteStore.getState().open &&
        !document.querySelector('[role="dialog"]')
      if (!free) return
      if (e.key === '/' || e.code === 'Slash') {
        e.preventDefault()
        setOpen(true)
        return
      }
      if (e.code === 'KeyC' && !e.shiftKey && !guest && slug) {
        e.preventDefault()
        if (matchPath('/projects/:id/work-items', window.location.pathname)) {
          const params = new URLSearchParams(window.location.search)
          params.set('create', '1')
          navigate({ search: params.toString() }, { replace: true })
          return
        }
        setMode('create')
        setQuery('')
        setActive(0)
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen, navigate, guest, slug])

  function reset() {
    setMode('root')
    setQuery('')
    setResult(null)
    setLoading(false)
    setActive(0)
  }

  function close() {
    setOpen(false)
    reset()
  }

  function go(path: string) {
    close()
    navigate(path)
  }

  function step(next: Mode) {
    setMode(next)
    setQuery('')
    setActive(0)
  }

  // Search as you type (root step only); a later answer replaces an earlier one.
  // `loading` is switched on by the input itself, so the effect only schedules.
  useEffect(() => {
    const q = query.trim()
    if (mode !== 'root' || !slug || !q) return
    const no = ++requestNo.current
    const timer = setTimeout(async () => {
      try {
        const found = await searchWorkspace(slug, q, { limit: 5 })
        if (no === requestNo.current) setResult(found)
      } catch {
        if (no === requestNo.current) setResult(null)
      } finally {
        if (no === requestNo.current) setLoading(false)
      }
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query, mode, slug])

  useEffect(() => {
    if (mode !== 'create' || !slug || projects) return
    getProjects(slug)
      .catch(() => [])
      .then((list) => setLoadedProjects({ slug, list }))
  }, [mode, slug, projects])

  // A result is shown only for the text it was found for (not after clearing).
  const q = query.trim()
  const shownResult = mode === 'root' && q ? result : null
  const busy = mode === 'root' && Boolean(q) && loading

  const sections: Section[] = useMemo(() => {
    const ws = words(query)
    if (mode === 'create') {
      const list = (projects ?? []).filter((p) =>
        matches(`${p.name} ${p.identifier}`, ws),
      )
      return [
        {
          title: t('В каком проекте создать поручение?'),
          items: list.map((p) => ({
            id: `create-${p.id}`,
            icon: iconOf(FolderOpen),
            label: p.name,
            aside: (
              <span className="font-mono text-xs text-muted-foreground">
                {p.identifier}
              </span>
            ),
            run: () => go(`/projects/${p.id}/work-items?create=1`),
          })),
        },
      ]
    }
    if (mode === 'workspace') {
      const list = workspaces.filter(
        (w) => w.id !== workspace?.id && matches(w.name, ws),
      )
      return [
        {
          title: t('Сменить пространство'),
          items: list.map((w) => ({
            id: `ws-${w.id}`,
            icon: iconOf(Building2),
            label: w.name,
            run: () => {
              setWorkspace(w)
              go('/')
            },
          })),
        },
      ]
    }

    const out: Section[] = []
    if (shownResult) {
      if (shownResult.issues.length > 0) {
        out.push({
          title: t('Задачи и поручения'),
          items: shownResult.issues.map((i) => ({
            id: `issue-${i.id}`,
            icon: iconOf(i.kind === 'assignment' ? ShieldCheck : CircleDot),
            label: (
              <>
                <span className="mr-2 font-mono text-xs text-muted-foreground">
                  {i.key}
                </span>
                <Highlight text={i.title_hl} />
              </>
            ),
            hint: `${i.project.name} · ${i.state.name}`,
            extra: i.snippet ? <Highlight text={i.snippet} /> : undefined,
            run: () => go(`/projects/${i.project.id}/work-items?issue=${i.id}`),
          })),
        })
      }
      if (shownResult.projects.length > 0) {
        out.push({
          title: t('Проекты'),
          items: shownResult.projects.map((p) => ({
            id: `project-${p.id}`,
            icon: iconOf(FolderOpen),
            label: <Highlight text={p.name_hl} />,
            aside: (
              <span className="font-mono text-xs text-muted-foreground">
                {p.identifier}
              </span>
            ),
            run: () => go(`/projects/${p.id}/work-items`),
          })),
        })
      }
      if (shownResult.people.length > 0) {
        out.push({
          title: t('Сотрудники'),
          items: shownResult.people.map((p) => {
            const name = shortName({ display_name: p.display_name })
            return {
              id: `person-${p.user_id}`,
              icon: (
                <PersonAvatar
                  person={{
                    id: p.user_id,
                    display_name: p.display_name,
                    avatar_url: p.avatar_url,
                  }}
                  size={18}
                  title={false}
                />
              ),
              label: <Highlight text={p.name_hl} />,
              hint: [p.position, p.department?.name]
                .filter(Boolean)
                .join(' · '),
              aside: (
                <span className="text-xs text-muted-foreground">
                  {t('открытые задачи')}
                </span>
              ),
              run: () =>
                go(
                  `/issues?${new URLSearchParams({
                    assignee: p.user_id,
                    open: 'true',
                    title: t('Открытые задачи: {{name}}', { name }),
                  })}`,
                ),
            }
          }),
        })
      }
      if (shownResult.departments.length > 0) {
        out.push({
          title: t('Подразделения'),
          items: shownResult.departments.map((d) => ({
            id: `department-${d.id}`,
            icon: iconOf(Building2),
            label: <Highlight text={d.name_hl} />,
            hint: d.head
              ? t('Руководитель: {{name}}', {
                  name: shortName({ display_name: d.head.display_name }),
                })
              : (d.short_name ?? undefined),
            aside: (
              <span className="text-xs text-muted-foreground">
                {t('открытые задачи')}
              </span>
            ),
            run: () =>
              go(
                `/issues?${new URLSearchParams({
                  department: d.id,
                  open: 'true',
                  title: t('Открытые задачи: {{name}}', {
                    name: d.short_name || d.name,
                  }),
                })}`,
              ),
          })),
        })
      }
    }

    const actions: (Item & { text: string; show: boolean })[] = [
      {
        id: 'new',
        text: t('Новое поручение создать задачу'),
        show: !guest,
        icon: iconOf(Plus),
        label: t('Новое поручение…'),
        aside: <ChevronRight size={14} className="text-muted-foreground" />,
        run: () => step('create'),
      },
      {
        id: 'your-work',
        text: t('Мои задачи'),
        show: true,
        icon: iconOf(User),
        label: t('Мои задачи'),
        run: () => go('/your-work'),
      },
      {
        id: 'control',
        text: t('На контроле поручения контролёр'),
        show: !guest,
        icon: iconOf(ShieldCheck),
        label: t('На контроле'),
        run: () => go('/your-work?tab=control'),
      },
      {
        id: 'analytics',
        text: t('Аналитика отчёты дисциплина'),
        show: FEATURES.analytics,
        icon: iconOf(BarChart3),
        label: t('Аналитика'),
        run: () => go('/analytics'),
      },
      {
        id: 'ai',
        text: t('AI-помощник вопрос'),
        show: FEATURES.ai && aiEnabled,
        icon: iconOf(Sparkles),
        label: t('AI-помощник'),
        run: () => go('/ai'),
      },
      {
        id: 'notifications',
        text: t('Уведомления'),
        show: true,
        icon: iconOf(Bell),
        label: t('Уведомления'),
        run: () => go('/notifications'),
      },
      {
        id: 'trash',
        text: t('Корзина удалённые восстановить'),
        show: FEATURES.trash && !guest,
        icon: iconOf(Trash2),
        label: t('Корзина'),
        run: () => go('/trash'),
      },
      {
        id: 'profile',
        text: t('Профиль сессии'),
        show: true,
        icon: iconOf(UserRound),
        label: t('Профиль'),
        run: () => go('/profile'),
      },
      {
        id: 'settings',
        text: t('Настройки пространства сотрудники оргструктура'),
        show: admin,
        icon: iconOf(Settings),
        label: t('Настройки пространства'),
        run: () => go('/settings/general'),
      },
      {
        id: 'audit',
        text: t('Журнал аудита'),
        show: admin,
        icon: iconOf(History),
        label: t('Журнал аудита'),
        run: () => go('/settings/audit'),
      },
      {
        id: 'workspace',
        text: t('Сменить пространство'),
        show: workspaces.length > 1,
        icon: iconOf(Repeat),
        label: t('Сменить пространство…'),
        aside: <ChevronRight size={14} className="text-muted-foreground" />,
        run: () => step('workspace'),
      },
      {
        id: 'about',
        text: t('О системе версия руководство справка горячие клавиши'),
        show: true,
        icon: iconOf(Info),
        label: t('О системе и руководство'),
        run: () => go('/about'),
      },
      {
        id: 'theme',
        text: t('Тема тёмная светлая'),
        show: true,
        icon: iconOf(theme === 'dark' ? Sun : Moon),
        label: theme === 'dark' ? t('Светлая тема') : t('Тёмная тема'),
        run: () => {
          toggle()
          close()
        },
      },
    ]
    const shown = actions.filter((a) => a.show && matches(a.text, ws))
    if (shown.length > 0) out.push({ title: t('Действия'), items: shown })
    return out
    // `go`, `step`, `close` only use stable setters and navigate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    query,
    shownResult,
    projects,
    workspaces,
    workspace?.id,
    guest,
    admin,
    aiEnabled,
    theme,
    t,
  ])

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections])
  const current = Math.min(active, Math.max(flat.length - 1, 0))

  // Keep the highlighted row in view while moving with the arrows.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [current])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((current + 1) % Math.max(flat.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((current - 1 + flat.length) % Math.max(flat.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      flat[current]?.run()
    } else if (e.key === 'Backspace' && query === '' && mode !== 'root') {
      e.preventDefault()
      step('root')
    }
  }

  const nothing = shownResult && !busy && flat.length === 0
  let index = -1

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : close())}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-3 z-50 flex max-h-[min(560px,calc(100dvh-24px))] w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl sm:top-[12vh]"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement)
              .querySelector<HTMLInputElement>('input')
              ?.focus()
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {t('Поиск и команды')}
          </DialogPrimitive.Title>

          <div className="flex items-center gap-2 border-b border-border px-3">
            {busy ? (
              <Loader2
                size={16}
                className="shrink-0 animate-spin text-muted-foreground"
              />
            ) : (
              <Search size={16} className="shrink-0 text-muted-foreground" />
            )}
            {mode !== 'root' && (
              <button
                type="button"
                onClick={() => step('root')}
                className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground hover:bg-muted/70"
              >
                {mode === 'create' ? t('Новое поручение') : t('Пространство')}
              </button>
            )}
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
                if (mode === 'root' && e.target.value.trim()) setLoading(true)
              }}
              onKeyDown={onKeyDown}
              placeholder={
                mode === 'create'
                  ? t('Название проекта…')
                  : mode === 'workspace'
                    ? t('Название пространства…')
                    : t('Задачи, проекты, люди, подразделения или команда…')
              }
              aria-label={t('Поиск')}
              role="combobox"
              aria-expanded
              aria-controls="command-palette-list"
              aria-activedescendant={
                flat[current] ? `cp-${flat[current].id}` : undefined
              }
              className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div
            ref={listRef}
            id="command-palette-list"
            role="listbox"
            className="flex-1 overflow-y-auto p-1.5"
          >
            {nothing && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                {t('Ничего не найдено по запросу «{{q}}»', { q })}
              </p>
            )}
            {mode === 'create' && projects === null && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t('Загружаем проекты…')}
              </p>
            )}
            {sections.map((section) =>
              section.items.length === 0 ? null : (
                <div
                  key={section.title}
                  className="mb-1"
                  role="group"
                  aria-label={section.title}
                >
                  <p className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                    {section.title}
                  </p>
                  {section.items.map((item) => {
                    index += 1
                    const i = index
                    return (
                      <div
                        key={item.id}
                        id={`cp-${item.id}`}
                        data-index={i}
                        role="option"
                        aria-selected={i === current}
                        onMouseMove={() => i !== current && setActive(i)}
                        onClick={() => item.run()}
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 text-sm',
                          i === current && 'bg-muted',
                        )}
                      >
                        <span className="mt-0.5 flex shrink-0">
                          {item.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-foreground">
                            {item.label}
                          </p>
                          {item.hint && (
                            <p className="truncate text-xs text-muted-foreground">
                              {item.hint}
                            </p>
                          )}
                          {item.extra && (
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {item.extra}
                            </p>
                          )}
                        </div>
                        {item.aside && (
                          <span className="mt-0.5 hidden shrink-0 sm:inline">
                            {item.aside}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ),
            )}
          </div>

          <div className="hidden items-center gap-4 border-t border-border px-3 py-2 text-xs text-muted-foreground sm:flex">
            <span>{t('↑↓ — выбрать')}</span>
            <span>{t('Enter — открыть')}</span>
            <span>{t('Esc — закрыть')}</span>
            <span className="ml-auto">{paletteShortcut()}</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
