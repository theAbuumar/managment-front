import { useEffect, useState } from 'react'
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
import { submitReview, returnReview, requestDeadlineChange, getControlSettings } from '@/api/control'
import { getAttachments, formatBytes, type Attachment } from '@/api/attachment'
import type { Issue } from '@/api/issue'
import { cn } from '@/lib/utils'
import { shortName } from '@/lib/people'
import { FileDropzone } from '@/features/work-items/attachments/FileDropzone'
import { useUploads } from '@/features/work-items/attachments/useUploads'
import { useAuthStore } from '@/stores/authStore'
import { useDraft } from '@/lib/drafts'

interface IssueRef {
  slug: string
  projectId: string
  issue: Issue
}

// Ф5: hand the work in for review — report text plus files (Ф4 4.F5): new
// uploads, or files already attached to the task that are not in a report yet.
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
  // The report is a draft of this task (12.F5): closing the dialog, a reload or a
  // lost connection keeps it; it is cleared once handed in.
  const me = useAuthStore((s) => s.user?.id)
  const [report, setReport, clearReport] = useDraft(me ? `${me}:report:${issue.id}` : null)
  const [busy, setBusy] = useState(false)
  // Files of the task not handed in yet; `picked` are the ones going with this report.
  const [available, setAvailable] = useState<Attachment[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [settingsRequire, setSettingsRequire] = useState(false)
  const uploads = useUploads(slug, projectId, issue.id)
  const mustWrite = requireReport || settingsRequire

  // On open: the workspace rule for a mandatory report and the task's free files.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    Promise.all([
      getControlSettings(slug).catch(() => null),
      getAttachments(slug, projectId, issue.id).catch(() => [] as Attachment[]),
    ]).then(([settings, files]) => {
      if (cancelled) return
      setSettingsRequire(!!settings?.require_report)
      setAvailable(files.filter((f) => !f.review_id))
    })
    return () => {
      cancelled = true
    }
  }, [open, slug, projectId, issue.id])

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function addFiles(files: File[]) {
    const done = await uploads.upload(files)
    if (done.length) {
      setAvailable((prev) => [...done, ...prev])
      setPicked((prev) => new Set([...prev, ...done.map((d) => d.id)]))
    }
  }

  function close(v: boolean) {
    if (!v) setPicked(new Set())
    onOpenChange(v)
  }

  async function submit() {
    setBusy(true)
    try {
      const updated = await submitReview(slug, projectId, issue.id, {
        report: report.trim() || null,
        attachment_ids: [...picked],
      })
      toast.success(t('Отправлено на проверку'))
      clearReport()
      onDone(updated)
      close(false)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send size={18} className="text-primary" />
            {t('Отправить на проверку')}
          </DialogTitle>
          <DialogDescription>
            {issue.controller
              ? t('Результат примет или вернёт контролёр: {{name}}', {
                  name: shortName(issue.controller),
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
            {mustWrite ? ' *' : ''}
          </label>
          <Textarea
            autoFocus
            rows={5}
            value={report}
            onChange={(e) => setReport(e.target.value)}
            placeholder={t('Что сделано, где результат, на что обратить внимание…')}
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t('Файлы отчёта')}</p>
          {available.length > 0 && (
            <ul className="space-y-1">
              {available.map((f) => (
                <li key={f.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                      picked.has(f.id) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={picked.has(f.id)}
                      onChange={() => toggle(f.id)}
                      className="accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate">{f.file_name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatBytes(f.file_size)} · {shortName(f.uploaded_by)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <FileDropzone
            onFiles={addFiles}
            uploads={uploads.items}
            compact
            hint={t('Добавить файлы: перетащите или нажмите')}
          />
          <p className="text-xs text-muted-foreground">
            {t('Новые файлы сразу попадают во вложения задачи и отмечаются как часть отчёта.')}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {t('Отмена')}
          </Button>
          <Button onClick={submit} disabled={busy || uploads.busy || (mustWrite && !report.trim())}>
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
  const me = useAuthStore((s) => s.user?.id)
  const [comment, setComment, clearComment] = useDraft(me ? `${me}:return:${issue.id}` : null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const updated = await returnReview(slug, projectId, issue.id, comment.trim())
      toast.success(t('Возвращено на доработку'))
      clearComment()
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
  const me = useAuthStore((s) => s.user?.id)
  const [reason, setReason, clearReason] = useDraft(me ? `${me}:deadline:${issue.id}` : null)
  const [busy, setBusy] = useState(false)
  const iso = dateInputToIso(date)

  async function submit() {
    if (!iso) return
    setBusy(true)
    try {
      await requestDeadlineChange(slug, projectId, issue.id, { new_due_date: iso, reason: reason.trim() })
      toast.success(t('Запрос на перенос срока отправлен контролёру'))
      clearReason()
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
