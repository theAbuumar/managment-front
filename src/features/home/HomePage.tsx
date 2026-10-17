import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getProjects } from '@/api/project'
import { getIssues } from '@/api/issue'
import { timeAgo } from '@/lib/dates'
import { t as translate } from '@/i18n'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 5) return translate('Доброй ночи')
  if (h < 12) return translate('Доброе утро')
  if (h < 18) return translate('Добрый день')
  return translate('Добрый вечер')
}

function formatToday() {
  return new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

const PALETTE = ['#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#3b82f6']
const colorFor = (s: string) =>
  PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]

interface HistoryItem {
  key: string
  projectId: string
  code: string
  short: string
  title: string
  ago: string
  assignee: string
  assigneeColor: string
}

export function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const workspace = useWorkspaceStore((s) => s.workspace)

  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  // Recently updated work items across the workspace's projects, newest first.
  // One request per project for now; the workspace-level issues endpoint (Ф7)
  // replaces this fan-out.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      if (!workspace) return
      const projects = await getProjects(workspace.slug).catch(() => [])
      const perProject = await Promise.all(
        projects.map((p) =>
          getIssues(workspace.slug, p.id, {
            sort_by: 'updated_at',
            order: 'desc',
            limit: 5,
          })
            .then((r) => r.data.map((iss) => ({ iss, ident: p.identifier })))
            .catch(() => []),
        ),
      )
      const items: HistoryItem[] = perProject
        .flat()
        .sort(
          (a, b) =>
            new Date(b.iss.updated_at).getTime() -
            new Date(a.iss.updated_at).getTime(),
        )
        .slice(0, 8)
        .map(({ iss, ident }) => {
          const name = iss.assignees[0]?.user?.display_name ?? ''
          return {
            key: iss.id,
            projectId: iss.project_id,
            code: `${ident}-${iss.sequence_id}`,
            short: ident.slice(0, 2).toUpperCase(),
            title: iss.title,
            ago: timeAgo(iss.updated_at),
            assignee: name[0]?.toUpperCase() ?? '—',
            assigneeColor: colorFor(iss.assignees[0]?.user_id ?? iss.id),
          }
        })
      if (!cancelled) setHistory(items)
    })().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [workspace?.slug]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col">
      {/* Page top bar */}
      <div className="flex h-10 shrink-0 items-center border-b border-border px-4">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Home size={14} />
          <span>{t('Главная')}</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-10">
          {/* Greeting */}
          <div className="mb-8 text-center">
            <h1 className="mb-1 text-2xl font-bold text-foreground">
              {getGreeting()}, {user?.display_name ?? ''}
            </h1>
            <p className="text-sm font-medium text-primary first-letter:uppercase">
              {formatToday()}
            </p>
          </div>

          {/* Recently updated work items */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                {t('Недавние задачи')}
              </h2>
              <button
                onClick={() => navigate('/your-work')}
                className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {t('Все мои задачи')}
                <ArrowRight size={14} />
              </button>
            </div>

            {loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t('Загрузка…')}
              </p>
            ) : history.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t('Пока пусто — здесь появятся задачи, с которыми вы работаете.')}
              </p>
            ) : (
              <div className="space-y-2">
                {history.map((item) => (
                  <button
                    key={item.key}
                    onClick={() =>
                      navigate(
                        `/projects/${item.projectId}/work-items?issue=${item.key}`,
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-500 text-[11px] font-bold text-white">
                      {item.short}
                    </div>
                    <div className="flex flex-1 items-center gap-2 overflow-hidden">
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">
                        {item.code}
                      </span>
                      <span className="truncate text-sm text-foreground">
                        {item.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {item.ago}
                      </span>
                    </div>
                    <div
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: item.assigneeColor }}
                    >
                      {item.assignee}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
