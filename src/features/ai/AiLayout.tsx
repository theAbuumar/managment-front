import { useEffect, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAiStatus } from '@/stores/aiStore'

// The AI section (Ф11): questions and drafts from a document, one header with
// the requests left today. With AI off for this workspace (or for a guest) the
// section does not exist: a direct link goes home (ADR-028, ADR-019).

export function AiLayout({
  children,
  actions,
}: {
  children: ReactNode
  actions?: ReactNode
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const status = useAiStatus()

  useEffect(() => {
    if (status && !status.enabled) navigate('/', { replace: true })
  }, [status, navigate])

  if (!status?.enabled) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const tab = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
      isActive
        ? 'bg-card text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 sm:px-6">
        <Sparkles size={16} className="text-violet-600 dark:text-violet-400" />
        <h1 className="hidden text-sm font-semibold sm:block">
          {t('AI-помощник')}
        </h1>
        <nav className="flex gap-1 rounded-lg bg-muted p-1 sm:ml-2">
          <NavLink to="/ai" end className={tab}>
            {t('Вопросы')}
          </NavLink>
          <NavLink to="/ai/drafts" className={tab}>
            {t('Из протокола')}
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {actions}
          {status.daily_limit !== undefined && (
            <span
              className="hidden text-xs text-muted-foreground md:inline"
              title={t('Счётчик обнуляется в полночь')}
            >
              {t('Осталось сегодня: {{left}} из {{limit}}', {
                left: status.remaining_today,
                limit: status.daily_limit,
              })}
            </span>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
