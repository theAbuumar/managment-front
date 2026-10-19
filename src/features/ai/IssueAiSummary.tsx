import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, RefreshCw, X } from 'lucide-react'
import { errorText } from '@/lib/errorMessages'
import { ApiError } from '@/api/client'
import { summarizeIssue, type AiSummary } from '@/api/ai'
import { refreshAiStatus } from '@/stores/aiStore'
import { AiCheckNote, AiMark } from './AiBits'

// «Кратко» in the issue card (Ф11 11.F3): the gist, where it stands, what is in
// the way and what comes next, from what the card shows (backend 11.B3). Made on
// request, never stored; «Обновить» asks again after the task has changed.

export function IssueAiSummary({
  slug,
  projectId,
  issueId,
  onClose,
}: {
  slug: string
  projectId: string
  issueId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [attempt, setAttempt] = useState(0)
  // The answer for one (issue, attempt); anything else means a request in flight.
  const [result, setResult] = useState<{
    key: string
    summary?: AiSummary
    error?: string
  } | null>(null)
  const key = `${issueId}:${attempt}`

  useEffect(() => {
    let cancelled = false
    summarizeIssue(slug, projectId, issueId)
      .then((summary) => !cancelled && setResult({ key, summary }))
      .catch((err) => {
        if (cancelled) return
        setResult({
          key,
          error: errorText(err, t('Не удалось подготовить краткое содержание')),
        })
        if (err instanceof ApiError && err.code === 'AI_LIMIT_REACHED')
          refreshAiStatus()
      })
    return () => {
      cancelled = true
    }
  }, [slug, projectId, issueId, key, t])

  const current = result?.key === key ? result : null
  const summary = current?.summary ?? null
  const error = current?.error ?? null
  const loading = !current

  return (
    <div className="border-b border-border bg-violet-500/[0.04] px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <AiMark label={t('Кратко от AI')} />
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            disabled={loading}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
            title={t('Обновить')}
            aria-label={t('Обновить')}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent"
            title={t('Скрыть')}
            aria-label={t('Скрыть')}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          {t('AI читает задачу, комментарии и историю…')}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {summary && (
        <div className="space-y-2 text-sm">
          <p>
            <span className="font-medium">{t('Суть:')}</span> {summary.essence}
          </p>
          <p>
            <span className="font-medium">{t('Сейчас:')}</span> {summary.status}
          </p>
          {summary.blockers.length > 0 && (
            <div>
              <p className="font-medium">{t('Что мешает:')}</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {summary.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.next_steps.length > 0 && (
            <div>
              <p className="font-medium">{t('Следующие шаги:')}</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {summary.next_steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <AiCheckNote>
            {t(
              'Справка подготовлена AI по данным карточки — сверьте с историей задачи.',
            )}
          </AiCheckNote>
        </div>
      )}
    </div>
  )
}
