import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Send, Undo2, CalendarClock } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import { errorText } from '@/lib/errorMessages'
import { dateInputToIso, isoToDateInput, longDate } from '@/lib/dates'
import { submitReview, returnReview, requestDeadlineChange } from '@/api/control'
import type { Issue } from '@/api/issue'

interface IssueRef {
  slug: string
  projectId: string
  issue: Issue
}

// Ф5: hand the work in for review — report text (files go to "Вложения").
export function SubmitReviewDialog({
  open,
  onOpenChange,
  slug,
  projectId,
  issue,
  requireReport,
  note,
  onDone,
}: IssueRef & {
  open: boolean
  onOpenChange: (v: boolean) => void
  requireReport?: boolean
  /** Extra hint, e.g. why the card did not move to "Готово". */
  note?: string
  onDone: (issue: Issue) => void
}) {
  const { t } = useTranslation()
  const [report, setReport] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const updated = await submitReview(slug, projectId, issue.id, { report: report.trim() || null })
      toast.success(t('Отправлено на проверку'))
      setReport('')
      onDone(updated)
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send size={18} className="text-primary" />
            {t('Отправить на проверку')}
          </DialogTitle>
          <DialogDescription>
            {issue.controller
              ? t('Результат примет или вернёт контролёр: {{name}}.', {
                  name: issue.controller.display_name,
                })
              : t('Результат проверит автор поручения.')}
          </DialogDescription>
        </DialogHeader>
        {note && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm">{note}</p>
        )}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            {t('Отчёт об исполнении')}
            {requireReport ? ' *' : ''}
          </label>
          <Textarea
            autoFocus
            rows={5}
            value={report}
            onChange={(e) => setReport(e.target.value)}
            placeholder={t('Что сделано, где результат, на что обратить внимание…')}
          />
          <p className="text-xs text-muted-foreground">
            {t('Файлы отчёта прикрепите в разделе «Вложения» задачи.')}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Отмена')}
          </Button>
          <Button onClick={submit} disabled={busy || (requireReport && !report.trim())}>
            {busy ? t('Отправляем…') : t('Отправить')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Ф5: controller returns the work with a mandatory remark.
export function ReturnReviewDialog({
  open,
  onOpenChange,
  slug,
  projectId,
  issue,
  onDone,
}: IssueRef & { open: boolean; onOpenChange: (v: boolean) => void; onDone: (issue: Issue) => void }) {
  const { t } = useTranslation()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const updated = await returnReview(slug, projectId, issue.id, comment.trim())
      toast.success(t('Возвращено на доработку'))
      setComment('')
      onDone(updated)
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 size={18} className="text-amber-600" />
            {t('Вернуть на доработку')}
          </DialogTitle>
          <DialogDescription>
            {t('Замечание увидит исполнитель — оно также попадёт в обсуждение задачи.')}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t('Что нужно исправить или дополнить?')}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Отмена')}
          </Button>
          <Button onClick={submit} disabled={busy || !comment.trim()}>
            {busy ? t('Отправляем…') : t('Вернуть')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Ф5: assignee asks the controller to move the deadline.
export function DeadlineRequestDialog({
  open,
  onOpenChange,
  slug,
  projectId,
  issue,
  timeZone,
  onDone,
}: IssueRef & {
  open: boolean
  onOpenChange: (v: boolean) => void
  timeZone: string
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [date, setDate] = useState(() => isoToDateInput(issue.due_date, timeZone))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const iso = dateInputToIso(date)

  async function submit() {
    if (!iso) return
    setBusy(true)
    try {
      await requestDeadlineChange(slug, projectId, issue.id, { new_due_date: iso, reason: reason.trim() })
      toast.success(t('Запрос на перенос срока отправлен контролёру'))
      setReason('')
      onDone()
      onOpenChange(false)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock size={18} className="text-primary" />
            {t('Запросить перенос срока')}
          </DialogTitle>
          <DialogDescription>
            {issue.due_date
              ? t('Текущий срок: {{date}}. Решение примет контролёр.', { date: longDate(issue.due_date) })
              : t('Решение примет контролёр.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('Новый срок')}</label>
            <DatePicker value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('Обоснование')}</label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('Почему нужен перенос?')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Отмена')}
          </Button>
          <Button onClick={submit} disabled={busy || !iso || reason.trim().length < 3}>
            {busy ? t('Отправляем…') : t('Отправить запрос')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
