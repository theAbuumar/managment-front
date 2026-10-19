import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { FileDown, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { errorText } from '@/lib/errorMessages'
import { ApiError } from '@/api/client'
import type { AnalyticsFilters } from '@/api/analytics'
import { downloadMemo, generateMemo, type AiMemo } from '@/api/ai'
import { refreshAiStatus } from '@/stores/aiStore'
import { AiCheckNote, AiMark, AiText } from './AiBits'

// «Сформировать записку» on the analytics page (Ф11 11.F4): AI writes an
// analytical memo from the metrics of the current filters (backend 11.B4); the
// person reads it, edits it and downloads the edited text as DOCX or PDF.

export function AiMemoDialog({
  open,
  onOpenChange,
  slug,
  filters,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  filters: AnalyticsFilters
}) {
  const { t } = useTranslation()
  const [focus, setFocus] = useState('')
  const [memo, setMemo] = useState<AiMemo | null>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState<'pdf' | 'docx' | null>(null)

  async function generate() {
    setBusy(true)
    try {
      const m = await generateMemo(slug, {
        ...filters,
        ...(focus.trim() && { focus: focus.trim() }),
      })
      setMemo(m)
      setTitle(m.title)
      setText(m.text)
      setMode('view')
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сформировать записку')))
      if (err instanceof ApiError && err.code === 'AI_LIMIT_REACHED')
        refreshAiStatus()
    } finally {
      setBusy(false)
    }
  }

  async function save(format: 'pdf' | 'docx') {
    if (!title.trim() || !text.trim()) return
    setSaving(format)
    try {
      await downloadMemo(
        slug,
        { format, title: title.trim(), text },
        `${title.trim()}.${format}`,
      )
    } catch (err) {
      toast.error(errorText(err, t('Не удалось скачать записку')))
    } finally {
      setSaving(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles
              size={16}
              className="text-violet-600 dark:text-violet-400"
            />
            {t('Аналитическая записка')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'AI напишет записку по показателям выбранного периода и фильтров. Вы проверите и поправите текст перед скачиванием.',
            )}
          </DialogDescription>
        </DialogHeader>

        {!memo && (
          <div className="space-y-3">
            <Input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              maxLength={1000}
              placeholder={t(
                'На что обратить внимание (необязательно): например, просрочки факультетов',
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'Период: {{from}} — {{to}}. В AI уходят только готовые показатели, без текстов задач.',
                {
                  from: filters.from,
                  to: filters.to,
                },
              )}
            </p>
          </div>
        )}

        {memo && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <AiMark />
              <div className="ml-auto flex gap-1 rounded-lg bg-muted p-1">
                {(['view', 'edit'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium',
                      mode === m
                        ? 'bg-card shadow-sm'
                        : 'text-muted-foreground',
                    )}
                  >
                    {m === 'view' ? t('Просмотр') : t('Правка')}
                  </button>
                ))}
              </div>
            </div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="font-semibold"
              aria-label={t('Заголовок записки')}
            />
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border p-3">
              {mode === 'view' ? (
                <AiText text={text} />
              ) : (
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={18}
                  className="min-h-[40vh] border-none p-0 font-mono text-xs shadow-none focus-visible:ring-0"
                  aria-label={t('Текст записки')}
                />
              )}
            </div>
            <AiCheckNote>
              {t(
                'Проверьте цифры и выводы перед отправкой руководству. В «Правке»: «## » — заголовок, «- » — пункт списка, **текст** — жирный.',
              )}
            </AiCheckNote>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {memo ? (
            <>
              <Button variant="ghost" onClick={generate} disabled={busy}>
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {t('Заново')}
              </Button>
              <Button
                variant="outline"
                onClick={() => save('docx')}
                disabled={!!saving || !text.trim()}
              >
                {saving === 'docx' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileDown size={14} />
                )}
                {t('Скачать DOCX')}
              </Button>
              <Button
                onClick={() => save('pdf')}
                disabled={!!saving || !text.trim()}
              >
                {saving === 'pdf' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileDown size={14} />
                )}
                {t('Скачать PDF')}
              </Button>
            </>
          ) : (
            <Button onClick={generate} disabled={busy}>
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {busy ? t('AI пишет записку…') : t('Сформировать')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
