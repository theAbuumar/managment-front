import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { getAudit, type AuditEntry, type AuditGroup } from '@/api/audit'
import { ApiError } from '@/api/client'
import { ROLE_LABELS, type MemberRole } from '@/api/workspace'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuthStore } from '@/stores/authStore'
import { errorText } from '@/lib/errorMessages'
import { shortName } from '@/lib/people'
import { cn } from '@/lib/utils'
import { t as translate } from '@/i18n'

// Workspace settings → «Журнал аудита» (Ф12 12.F1, part): who did what and when —
// sign-ins, role and department changes, invitations, deletions, report exports,
// settings. Read-only by design: entries cannot be changed or deleted (12.B1).

const PAGE = 50

const GROUPS: { key: AuditGroup | 'all'; label: () => string }[] = [
  { key: 'all', label: () => translate('Все') },
  { key: 'auth', label: () => translate('Входы') },
  { key: 'members', label: () => translate('Сотрудники и роли') },
  { key: 'structure', label: () => translate('Оргструктура и проекты') },
  { key: 'deletions', label: () => translate('Удаления') },
  { key: 'exports', label: () => translate('Отчёты') },
  { key: 'settings', label: () => translate('Настройки') },
]

const ACTIONS: Record<string, () => string> = {
  'auth.login': () => translate('Вход в систему'),
  'auth.logout': () => translate('Выход из системы'),
  'auth.session_revoked': () => translate('Завершён сеанс'),
  'auth.sessions_revoked': () => translate('Выход на всех других устройствах'),
  'auth.identity_linked': () => translate('Привязан способ входа'),
  'auth.identity_unlinked': () => translate('Отвязан способ входа'),
  'member.added': () => translate('Добавлен сотрудник'),
  'member.updated': () => translate('Изменены роль или должность'),
  'member.removed': () => translate('Сотрудник исключён'),
  'member.left': () => translate('Сотрудник покинул пространство'),
  'member.deactivated': () => translate('Доступ сотрудника отключён'),
  'member.activated': () => translate('Доступ сотрудника восстановлен'),
  'member.identity_reset': () => translate('Сброшена привязка входа сотрудника'),
  'invite.sent': () => translate('Отправлено приглашение'),
  'project.member_added': () => translate('Добавлен участник проекта'),
  'project.member_removed': () => translate('Исключён участник проекта'),
  'department.created': () => translate('Создано подразделение'),
  'department.updated': () => translate('Изменено подразделение'),
  'department.deleted': () => translate('Удалено подразделение'),
  'project.created': () => translate('Создан проект'),
  'project.updated': () => translate('Изменён проект'),
  'project.deleted': () => translate('Удалён проект'),
  'issue.deleted': () => translate('Удалена задача'),
  'attachment.deleted': () => translate('Удалён файл'),
  'report.exported': () => translate('Выгружен отчёт'),
  'workspace.updated': () => translate('Изменены настройки пространства'),
  'workspace.deleted': () => translate('Пространство удалено'),
  'settings.control_updated': () =>
    translate('Изменены настройки контроля исполнения'),
}

const DANGER = new Set([
  'member.removed',
  'member.deactivated',
  'department.deleted',
  'project.deleted',
  'issue.deleted',
  'attachment.deleted',
  'workspace.deleted',
])

const LOGIN_METHODS: Record<string, () => string> = {
  password: () => translate('по паролю'),
  email_code: () => translate('по коду на почту'),
  email: () => translate('почта'),
  google: () => 'Google',
  github: () => 'GitHub',
  telegram: () => 'Telegram',
  demo: () => translate('демо-вход'),
}

const REPORTS: Record<string, () => string> = {
  'assignments.xlsx': () => translate('Реестр поручений (Excel)'),
  'discipline.pdf': () =>
    translate('Справка об исполнительской дисциплине (PDF)'),
}

/** Human details of an entry: the new role, the login method, the report… */
function details(e: AuditEntry): string {
  const meta = e.meta ?? {}
  const parts: string[] = []
  if (e.action === 'auth.login' && typeof meta.method === 'string') {
    parts.push(LOGIN_METHODS[meta.method]?.() ?? meta.method)
  }
  if (
    (e.action.startsWith('auth.identity_') ||
      e.action === 'member.identity_reset') &&
    typeof meta.provider === 'string'
  ) {
    parts.push(LOGIN_METHODS[meta.provider]?.() ?? meta.provider)
  }
  if (e.action === 'auth.session_revoked' && meta.current === true) {
    parts.push(translate('на этом устройстве'))
  }
  if (e.action === 'auth.sessions_revoked' && typeof meta.count === 'number') {
    parts.push(translate('сеансов: {{count}}', { count: meta.count }))
  }
  if (typeof meta.role === 'string') {
    const role = ROLE_LABELS[meta.role as MemberRole]?.() ?? meta.role
    parts.push(translate('роль: {{role}}', { role }))
  }
  if (typeof meta.position === 'string' && meta.position) {
    parts.push(translate('должность: {{p}}', { p: meta.position }))
  }
  if (typeof meta.email === 'string') parts.push(meta.email)
  if (e.action === 'report.exported' && typeof meta.report === 'string') {
    const name = REPORTS[meta.report]?.() ?? meta.report
    parts.push(name)
  }
  return parts.join(' · ')
}

function when(iso: string): string {
  const zone = useAuthStore.getState().user?.timezone || undefined
  return new Date(iso).toLocaleString('ru-RU', {
    timeZone: zone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AuditLogPage() {
  const { t } = useTranslation()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const [group, setGroup] = useState<AuditGroup | 'all'>('all')
  const [rows, setRows] = useState<AuditEntry[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      setRows(null)
      try {
        const page = await getAudit(slug, {
          group: group === 'all' ? undefined : group,
          limit: PAGE,
        })
        if (cancelled) return
        setRows(page.data)
        setCursor(page.next_cursor)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 403) setForbidden(true)
        else toast.error(errorText(err, t('Не удалось загрузить журнал')))
        setRows([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, group, t])

  async function loadMore() {
    if (!slug || !cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await getAudit(slug, {
        group: group === 'all' ? undefined : group,
        cursor,
        limit: PAGE,
      })
      setRows((prev) => [...(prev ?? []), ...page.data])
      setCursor(page.next_cursor)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось загрузить журнал')))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div>
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <History size={16} />
        {t('Журнал аудита')}
      </div>

      <div className="max-w-5xl space-y-4 px-4 py-6 md:px-8">
        <p className="text-sm text-muted-foreground">
          {t(
            'Кто, когда и что менял: входы, роли и подразделения, приглашения, удаления, выгрузка отчётов и настройки. Записи нельзя изменить или удалить — даже администратору.',
          )}
        </p>

        {forbidden ? (
          <EmptyState
            icon={Lock}
            title={t('Журнал доступен владельцу и администраторам')}
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {GROUPS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGroup(g.key)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    group === g.key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-foreground hover:bg-muted',
                  )}
                >
                  {g.label()}
                </button>
              ))}
            </div>

            {rows === null ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState icon={History} title={t('Записей пока нет')} />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {rows.map((e) => {
                  const extra = details(e)
                  return (
                    <li
                      key={e.id}
                      className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-4 sm:px-4"
                    >
                      <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground sm:pt-0.5">
                        {when(e.created_at)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">
                          <span className="font-medium">
                            {e.actor ? shortName(e.actor) : t('Система')}
                          </span>
                          {' — '}
                          <span
                            className={cn(
                              DANGER.has(e.action) &&
                                'text-red-600 dark:text-red-400',
                            )}
                          >
                            {ACTIONS[e.action]?.() ?? e.action}
                          </span>
                          {e.target?.name && !e.action.startsWith('auth.') && (
                            <span className="text-muted-foreground">
                              {': '}
                              {e.target.name}
                            </span>
                          )}
                        </p>
                        {extra && (
                          <p className="truncate text-xs text-muted-foreground">
                            {extra}
                          </p>
                        )}
                      </div>
                      {e.ip && (
                        <span
                          className="shrink-0 text-xs tabular-nums text-muted-foreground"
                          title={e.user_agent ?? undefined}
                        >
                          IP {e.ip}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {cursor && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {t('Показать ещё')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
