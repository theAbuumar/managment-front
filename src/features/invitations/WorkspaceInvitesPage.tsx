import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mail, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { WorkspaceLogo } from '@/components/ui/workspace-logo'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { ROLE_LABELS } from '@/api/workspace'
import {
  getMyInvites,
  acceptInvite,
  declineInvite,
  type InviteInboxItem,
} from '@/api/invites'
import { errorText } from '@/lib/errorMessages'
import { pluralize } from '@/lib/plural'
import { shortName } from '@/lib/people'
import { t as translate } from '@/i18n'

function expiryLabel(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return translate('срок истёк')
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
  if (days === 1) return translate('действует до конца дня')
  return translate('действует ещё {{n}}', {
    n: pluralize(days, [translate('день'), translate('дня'), translate('дней')]),
  })
}

export function WorkspaceInvitesPage() {
  const { t } = useTranslation()
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace)
  const [invites, setInvites] = useState<InviteInboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await getMyInvites().catch(() => [])
      if (!cancelled) {
        setInvites(list)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function accept(item: InviteInboxItem) {
    setBusyId(item.id)
    try {
      await acceptInvite(item.id)
      addWorkspace(item.workspace)
      toast.success(t('Вы вступили в «{{name}}»', { name: item.workspace.name }))
      setInvites((list) => list.filter((i) => i.id !== item.id))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось принять приглашение')))
    } finally {
      setBusyId(null)
    }
  }

  async function decline(item: InviteInboxItem) {
    setBusyId(item.id)
    try {
      await declineInvite(item.id)
      toast.success(t('Приглашение в «{{name}}» отклонено', { name: item.workspace.name }))
      setInvites((list) => list.filter((i) => i.id !== item.id))
    } catch (err) {
      toast.error(errorText(err, t('Не удалось отклонить приглашение')))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {/* Top bar */}
      <div className="flex h-12 items-center gap-2 border-b border-border px-4 text-sm font-medium md:px-6">
        <Mail size={16} />
        {t('Приглашения')}
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6 md:px-6 md:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t('Приглашения в пространства')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Принятое приглашение добавляет пространство в переключатель пространств.')}
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : invites.length === 0 ? (
          <EmptyState
            icon={Mail}
            title={t('Новых приглашений нет')}
            description={t('Когда вас пригласят в пространство организации, приглашение появится здесь.')}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {invites.map((item) => {
              const busy = busyId === item.id
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4"
                >
                  <WorkspaceLogo workspace={item.workspace} size={40} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-foreground">{item.workspace.name}</p>
                      <Badge variant="secondary">{ROLE_LABELS[item.role]?.() ?? item.role}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {t('Пригласил(а): {{name}}', { name: shortName(item.inviter) })} ·{' '}
                      {expiryLabel(item.expires_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={busy}
                      onClick={() => decline(item)}
                    >
                      <X size={14} /> {t('Отклонить')}
                    </Button>
                    <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => accept(item)}>
                      <Check size={14} /> {busy ? t('Вступаем…') : t('Принять')}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
