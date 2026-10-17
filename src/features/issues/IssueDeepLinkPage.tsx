import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, SearchX, ShieldOff } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { getIssueByKey } from '@/api/issue'
import { getWorkspaces } from '@/api/workspace'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

type Failure = 'no-workspace' | 'not-found'

/**
 * Deep link `/w/:workspaceSlug/browse/:issueKey` (ADR-006, 2.F5) — the address
 * the backend puts in emails and Telegram messages and «Скопировать ссылку»
 * copies. Switches to the link's workspace and opens the issue on its project
 * board. Signed-out visitors log in first and come back here.
 */
export function IssueDeepLinkPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { workspaceSlug = '', issueKey = '' } = useParams()
  const token = useAuthStore((s) => s.token)
  const [failure, setFailure] = useState<Failure | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      const store = useWorkspaceStore.getState()
      // The cached list may predate an invitation accepted elsewhere.
      let target = store.workspaces.find((w) => w.slug === workspaceSlug)
      if (!target) {
        const list = await getWorkspaces().catch(() => [])
        if (cancelled) return
        if (list.length) store.setWorkspaces(list)
        target = list.find((w) => w.slug === workspaceSlug)
      }
      if (!target) {
        setFailure('no-workspace')
        return
      }
      try {
        const issue = await getIssueByKey(workspaceSlug, issueKey)
        if (cancelled) return
        if (store.workspace?.id !== target.id) store.setWorkspace(target)
        navigate(`/projects/${issue.project_id}/work-items?issue=${issue.id}`, {
          replace: true,
        })
      } catch (err) {
        if (cancelled) return
        if (
          err instanceof ApiError &&
          (err.status === 403 || err.status === 401)
        ) {
          setFailure('no-workspace')
        } else {
          setFailure('not-found')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, workspaceSlug, issueKey, navigate])

  if (!token) {
    const here = `/w/${workspaceSlug}/browse/${issueKey}`
    return <Navigate to={`/login?next=${encodeURIComponent(here)}`} replace />
  }

  const home = {
    label: t('На главную'),
    onClick: () => navigate('/', { replace: true }),
  }
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      {failure === 'no-workspace' ? (
        <EmptyState
          icon={ShieldOff}
          title={t('Нет доступа к пространству')}
          description={t(
            'Задача {{key}} находится в пространстве, участником которого вы не являетесь. Попросите администратора добавить вас.',
            { key: issueKey },
          )}
          action={home}
        />
      ) : failure === 'not-found' ? (
        <EmptyState
          icon={SearchX}
          title={t('Задача {{key}} не найдена', { key: issueKey })}
          description={t(
            'Возможно, задачу удалили или она в закрытом проекте, к которому у вас нет доступа.',
          )}
          action={home}
        />
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('Открываем задачу {{key}}…', { key: issueKey })}
        </div>
      )}
    </div>
  )
}
