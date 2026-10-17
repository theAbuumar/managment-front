import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Bell,
  ChevronDown,
  Menu,
  User,
  LogOut,
  Sun,
  Moon,
  Plus,
  Check,
  Settings,
  UserPlus,
  Mail,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { WorkspaceLogo } from '@/components/ui/workspace-logo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuthStore } from '@/stores/authStore'
import { signOut } from '@/lib/session'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useNotificationStore } from '@/stores/notificationStore'
import {
  getWorkspaces,
  getWorkspaceMembers,
  type WorkspaceData,
} from '@/api/workspace'
import { getNotifications } from '@/api/notification'
import { pluralize } from '@/lib/plural'
import { fullName } from '@/lib/people'
import { t as translate } from '@/i18n'

// How often the bell re-checks the unread count while the app is open.
const NOTIFICATION_POLL_MS = 45_000

interface TopbarProps {
  onMenuClick: () => void
}

// Per-workspace member count + the current user's role, loaded lazily when the
// switcher opens.
interface WsMeta {
  count: number
  role: string
}

const ROLE_LABEL: Record<string, () => string> = {
  owner: () => translate('Владелец'),
  admin: () => translate('Администратор'),
  member: () => translate('Участник'),
  guest: () => translate('Гость'),
}
const memberLabel = (n: number) =>
  pluralize(n, [translate('участник'), translate('участника'), translate('участников')])

export function Topbar({ onMenuClick }: TopbarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const user = useAuthStore((s) => s.user)
  const workspace = useWorkspaceStore((s) => s.workspace)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount)

  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [meta, setMeta] = useState<Record<string, WsMeta>>({})

  const wsName = workspace?.name ?? t('Пространство')
  const otherWorkspaces = workspaces.filter((w) => w.id !== workspace?.id)

  // Refresh the workspace list and each workspace's member count / my role
  // whenever the switcher is opened.
  useEffect(() => {
    if (!switcherOpen) return
    let cancelled = false
    ;(async () => {
      const list = await getWorkspaces().catch(() => workspaces)
      if (cancelled) return
      if (list.length) setWorkspaces(list)
      const entries = await Promise.all(
        list.map(async (w) => {
          const members = await getWorkspaceMembers(w.slug).catch(() => [])
          const mine = members.find((m) => m.user_id === user?.id)
          return [
            w.slug,
            { count: members.length, role: mine?.role ?? '' },
          ] as const
        }),
      )
      if (!cancelled) setMeta(Object.fromEntries(entries))
    })()
    return () => {
      cancelled = true
    }
  }, [switcherOpen, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the bell's unread badge fresh: poll the count on mount and on an
  // interval while a workspace is selected. The NotificationsPage keeps the same
  // store value in sync as the user reads items, so the badge updates instantly.
  const slug = workspace?.slug
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    const refresh = async () => {
      const res = await getNotifications(slug, { read: false, limit: 1 }).catch(
        () => null,
      )
      if (!cancelled && res) setUnreadCount(res.unread_count)
    }
    void refresh()
    const id = setInterval(refresh, NOTIFICATION_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [slug, setUnreadCount])

  function switchWorkspace(ws: WorkspaceData) {
    setWorkspace(ws)
    setSwitcherOpen(false)
    navigate('/')
  }

  function go(path: string) {
    setSwitcherOpen(false)
    navigate(path)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const currentMeta = workspace ? meta[workspace.slug] : undefined
  const currentSub = [
    currentMeta?.role ? (ROLE_LABEL[currentMeta.role]?.() ?? currentMeta.role) : null,
    currentMeta ? memberLabel(currentMeta.count) : null,
  ]
    .filter(Boolean)
    .join(' • ')

  return (
    <header className="flex h-[46px] shrink-0 items-center border-b border-border bg-card px-3 gap-2">
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden h-8 w-8 shrink-0"
        onClick={onMenuClick}
      >
        <Menu size={18} />
      </Button>

      {/* Workspace switcher */}
      <DropdownMenu open={switcherOpen} onOpenChange={setSwitcherOpen}>
        <DropdownMenuTrigger asChild>
          <button className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-muted transition-colors">
            <WorkspaceLogo workspace={workspace} size={24} />
            <span className="hidden text-sm font-medium md:block">
              {wsName}
            </span>
            <ChevronDown
              size={13}
              className="hidden text-muted-foreground md:block"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {/* Signed-in email */}
          <p className="truncate px-2 pb-1 pt-1.5 text-xs text-muted-foreground">
            {user?.email ?? ''}
          </p>

          {/* Current workspace */}
          <div className="flex items-center gap-2.5 px-2 py-2">
            <WorkspaceLogo workspace={workspace} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {wsName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {currentSub || ' '}
              </p>
            </div>
            <Check size={16} className="shrink-0 text-primary" />
          </div>

          {/* Settings + Invite members */}
          <div className="grid grid-cols-2 gap-2 px-2 pb-2">
            <button
              onClick={() => go('/settings/general')}
              className="flex items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Settings size={13} />
              {t('Настройки')}
            </button>
            <button
              onClick={() => go('/settings/members')}
              className="flex items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <UserPlus size={13} />
              {t('Пригласить')}
            </button>
          </div>

          {/* Other workspaces */}
          {otherWorkspaces.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {otherWorkspaces.map((ws) => {
                const m = meta[ws.slug]
                return (
                  <button
                    key={ws.id}
                    onClick={() => switchWorkspace(ws)}
                    className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left hover:bg-muted transition-colors"
                  >
                    <WorkspaceLogo workspace={ws} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {ws.name}
                      </p>
                      {m && (
                        <p className="truncate text-xs text-muted-foreground">
                          {memberLabel(m.count)}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => go('/onboarding/workspace')}>
            <Plus size={14} className="mr-2 text-muted-foreground" />
            {t('Создать пространство')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => go('/invitations')}>
            <Mail size={14} className="mr-2 text-muted-foreground" />
            {t('Мои приглашения')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={handleSignOut}
          >
            <LogOut size={14} className="mr-2" />
            {t('Выйти')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={toggle}
          aria-label={t('Сменить тему')}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <button
          onClick={() => navigate('/notifications')}
          aria-label={
            unreadCount > 0
              ? t('Уведомления, непрочитанных: {{count}}', { count: unreadCount })
              : t('Уведомления')
          }
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
        >
          <Bell size={15} />
          {unreadCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t('Меню профиля')}
              className="ml-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PersonAvatar person={user} size={28} title={false} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium text-foreground">
                {fullName(user)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.email ?? ''}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/profile')}>
              <User size={14} className="mr-2" />
              {t('Профиль')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={handleSignOut}
            >
              <LogOut size={14} className="mr-2" />
              {t('Выйти')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
