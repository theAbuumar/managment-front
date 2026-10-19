import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import {
  Trash2,
  Check,
  Search,
  Plus,
  CalendarRange,
  UserPlus,
  X,
  Eye,
  EyeOff,
  Link2,
  ShieldCheck,
  Star,
  UserCheck,
  FileText,
  Paperclip,
  Send,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { toastIssueTrashed } from '@/features/trash/trashToast'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { DeadlineBadge } from '@/components/ui/deadline-badge'
import { PRIORITY_CONFIG } from '@/components/ui/status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { shortName, fullName } from '@/lib/people'
import { timeAgo, dateTime, longDate, dateInputToIso, isoToDateInput } from '@/lib/dates'
import { errorText } from '@/lib/errorMessages'
import { issueLink } from '@/lib/links'
import { useAuthStore } from '@/stores/authStore'
import { useDraft } from '@/lib/drafts'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import {
  getIssue,
  updateIssue,
  deleteIssue,
  addAssignee,
  removeAssignee,
  addLabel,
  removeLabel,
  type Issue,
  type IssuePriorityValue,
} from '@/api/issue'
import type { State } from '@/api/state'
import type { Project } from '@/api/project'
import { getLabels, type Label } from '@/api/label'
import { getComments, createComment, deleteComment, type Comment } from '@/api/comment'
import { getActivity, type Activity } from '@/api/activity'
import { getWorkspaceMembers, type WorkspaceMember } from '@/api/workspace'
import { getAttachments, type Attachment } from '@/api/attachment'
import { AttachmentsSection } from '@/features/work-items/attachments/AttachmentsSection'
import {
  getReviews,
  getDeadlineRequests,
  getWatchers,
  watchIssue,
  unwatchIssue,
  type IssueReview,
  type DeadlineRequest,
} from '@/api/control'
import { ControlBlock } from './control/ControlBlock'
import { isOwnEcho, useRealtime } from '@/lib/realtime'
import { DistributionBlock } from './control/DistributionBlock'
import { IssueAiSummary } from '@/features/ai/IssueAiSummary'
import { AiMark } from '@/features/ai/AiBits'
import { useAiEnabled } from '@/stores/aiStore'

const PRIORITIES: IssuePriorityValue[] = ['urgent', 'high', 'medium', 'low', 'none']

const popCls =
  'z-50 w-64 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95'
const optionCls =
  'flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
const triggerCls =
  'flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm text-foreground transition-colors hover:border-border hover:bg-accent disabled:pointer-events-none'

function PopContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align="end" sideOffset={6} className={cn(popCls, className)}>
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="mb-1 flex items-center gap-2 border-b border-border px-2 pb-2">
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="mt-1.5 w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function IssueDetailPanel({
  issue,
  project,
  slug,
  projectId,
  states,
  onOpenChange,
  onUpdated,
  onDeleted,
  onOpenIssue,
}: {
  issue: Issue | null
  project: Project | null
  slug: string
  projectId: string
  states: State[]
  onOpenChange: (open: boolean) => void
  onUpdated: (issue: Issue) => void
  onDeleted: (issueId: string) => void
  /** Open another issue of the same project (a distribution's child). */
  onOpenIssue?: (issueId: string) => void
}) {
  const { t } = useTranslation()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const timeZone =
    useWorkspaceStore((s) => s.workspace?.timezone) ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [reviews, setReviews] = useState<IssueReview[]>([])
  const [deadlineRequests, setDeadlineRequests] = useState<DeadlineRequest[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [watching, setWatching] = useState(false)
  const [feedLoading, setFeedLoading] = useState(true)
  // «Кратко» (Ф11 11.F3): shown for the issue it was asked for only.
  const aiEnabled = useAiEnabled()
  const [summaryFor, setSummaryFor] = useState<string | null>(null)

  const [titleDraft, setTitleDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [basisDraft, setBasisDraft] = useState('')
  const issueId = issue?.id
  // The comment being typed is a draft of this task (12.F5): kept through a lost
  // connection or a reload, and never carried over to another task.
  const [newComment, setNewComment, clearNewComment] = useDraft(
    currentUserId && issueId ? `${currentUserId}:comment:${issueId}` : null,
  )

  async function loadControl(id: string) {
    const [rv, dr, ws, att] = await Promise.all([
      getReviews(slug, projectId, id).catch(() => []),
      getDeadlineRequests(slug, projectId, id).catch(() => []),
      getWatchers(slug, projectId, id).catch(() => []),
      getAttachments(slug, projectId, id).catch(() => []),
    ])
    setReviews(rv)
    setDeadlineRequests(dr)
    setWatching(ws.some((w) => w.user_id === currentUserId))
    setAttachments(att)
  }

  // (Re)load everything whenever a different issue is opened.
  useEffect(() => {
    if (!issueId || !issue) return
    let cancelled = false
    ;(async () => {
      setTitleDraft(issue.title)
      setDescDraft(issue.description ?? '')
      setBasisDraft(issue.basis ?? '')
      setFeedLoading(true)
      const [cs, act, mem, lbl] = await Promise.all([
        getComments(slug, projectId, issueId).catch(() => []),
        getActivity(slug, projectId, issueId).catch(() => ({ data: [], next_cursor: null })),
        getWorkspaceMembers(slug).catch(() => []),
        getLabels(slug, projectId).catch(() => []),
      ])
      if (cancelled) return
      setComments(cs)
      setActivity(act.data)
      setMembers(mem)
      setLabels(lbl)
      await loadControl(issueId)
      if (!cancelled) setFeedLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // Only re-run when the opened issue changes, not on every prop update.
  }, [issueId, slug, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const member = (id: string | null) => members.find((m) => m.user_id === id)
  const memberName = (id: string | null) => shortName(member(id)?.user) || t('участник')
  const labelName = (id: string | null) => labels.find((l) => l.id === id)?.name ?? t('метка')
  const stateName = (id: string | null) => states.find((s) => s.id === id)?.name ?? '—'

  // After any change: reload history, comments, control data — and the issue
  // itself, since control actions (approved deadline moves…) change it server-side.
  // Live events skip the issue: the board re-reads it and passes it down.
  async function refreshFeed({ withIssue = true }: { withIssue?: boolean } = {}) {
    if (!issueId) return
    const [act, cs, fresh] = await Promise.all([
      getActivity(slug, projectId, issueId).catch(() => null),
      getComments(slug, projectId, issueId).catch(() => null),
      withIssue ? getIssue(slug, projectId, issueId).catch(() => null) : null,
    ])
    if (act) setActivity(act.data)
    if (cs) setComments(cs)
    if (fresh) onUpdated(fresh)
    await loadControl(issueId)
  }

  // Live panel (8.F1): someone else commented, handed in, accepted… — reload
  // the feed and the control block of the open issue.
  const feedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => clearTimeout(feedTimer.current ?? undefined), [])
  useRealtime((message) => {
    if (message.type === 'resync' || message.issue_id !== issueId || isOwnEcho(message)) return
    clearTimeout(feedTimer.current ?? undefined)
    feedTimer.current = setTimeout(() => void refreshFeed({ withIssue: false }), 300)
  })

  // Text fields follow edits made elsewhere unless the user is typing in them.
  const synced = useRef({ title: '', description: '', basis: '' })
  useEffect(() => {
    if (!issue) return
    const prev = synced.current
    const next = {
      title: issue.title,
      description: issue.description ?? '',
      basis: issue.basis ?? '',
    }
    setTitleDraft((d) => (d === prev.title ? next.title : d))
    setDescDraft((d) => (d === prev.description ? next.description : d))
    setBasisDraft((d) => (d === prev.basis ? next.basis : d))
    synced.current = next
  }, [issue?.title, issue?.description, issue?.basis]) // eslint-disable-line react-hooks/exhaustive-deps

  // Any issue mutation funnels through here: push the fresh issue to the board
  // and refresh the history.
  async function apply(promise: Promise<Issue>, failMsg: string) {
    try {
      const updated = await promise
      onUpdated(updated)
      refreshFeed()
    } catch (err) {
      toast.error(errorText(err, failMsg))
    }
  }

  if (!issue) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent />
      </Sheet>
    )
  }

  const identifier = project ? `${project.identifier}-${issue.sequence_id}` : `#${issue.sequence_id}`
  const currentState = states.find((s) => s.id === issue.state_id)
  const group = currentState?.group ?? issue.state?.group
  const priorityMeta = PRIORITY_CONFIG[issue.priority]
  const PriorityIcon = priorityMeta.icon
  const assignedIds = issue.assignees.map((a) => a.user_id)
  const attachedLabelIds = issue.labels.map((l) => l.label_id)
  const isAssignment = issue.kind === 'assignment'
  const myRole = member(currentUserId ?? null)?.role
  // A guest only reads (12.B4); the backend refuses their edits anyway.
  const readOnly = myRole === 'guest'
  const isReviewer =
    myRole === 'owner' || myRole === 'admin' || (issue.controller_id ?? issue.created_by_id) === currentUserId
  // Assignments' deadlines move through the controller (Ф5 5.B5).
  const canEditDeadline = !isAssignment || isReviewer
  // Controller, review flag and type of controlled work are the controller's call
  // (the API answers CONTROL_CHANGE_FORBIDDEN otherwise, 13.P5).
  const canChangeControl = !(isAssignment || issue.requires_review) || isReviewer
  const controlHint = canChangeControl ? undefined : t('Меняет контролёр или администратор')

  function saveTitle() {
    const value = titleDraft.trim()
    if (!value || value === issue!.title) {
      setTitleDraft(issue!.title)
      return
    }
    apply(updateIssue(slug, projectId, issue!.id, { title: value }), t('Не удалось переименовать задачу'))
  }

  function saveDesc() {
    const value = descDraft.trim()
    if (value === (issue!.description ?? '')) return
    apply(updateIssue(slug, projectId, issue!.id, { description: value || null }), t('Не удалось сохранить описание'))
  }

  function saveBasis() {
    const value = basisDraft.trim()
    if (value === (issue!.basis ?? '')) return
    apply(updateIssue(slug, projectId, issue!.id, { basis: value || null }), t('Не удалось сохранить основание'))
  }

  async function handleDelete() {
    try {
      await deleteIssue(slug, projectId, issue!.id)
      toastIssueTrashed(slug, issue!.id)
      onDeleted(issue!.id)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить задачу')))
    }
  }

  async function toggleWatch() {
    try {
      const list = watching
        ? await unwatchIssue(slug, projectId, issue!.id)
        : await watchIssue(slug, projectId, issue!.id)
      const now = list.some((w) => w.user_id === currentUserId)
      setWatching(now)
      toast.success(now ? t('Вы наблюдаете за задачей') : t('Вы больше не наблюдаете'))
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  async function copyLink() {
    if (!project) return
    try {
      await navigator.clipboard.writeText(issueLink(project.identifier, issue!.sequence_id))
      toast.success(t('Ссылка скопирована'))
    } catch {
      toast.error(t('Не удалось скопировать ссылку'))
    }
  }

  async function addNewComment() {
    const value = newComment.trim()
    if (!value || !issueId) return
    try {
      const created = await createComment(slug, projectId, issueId, value)
      setComments((prev) => [...prev, created])
      clearNewComment()
      refreshFeed()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось отправить комментарий')))
    }
  }

  async function removeComment(commentId: string) {
    if (!issueId) return
    const snapshot = comments
    setComments((prev) => prev.filter((c) => c.id !== commentId))
    try {
      await deleteComment(slug, projectId, issueId, commentId)
    } catch (err) {
      setComments(snapshot)
      toast.error(errorText(err, t('Не удалось удалить комментарий')))
    }
  }

  function describeActivity(a: Activity): string {
    switch (a.action) {
      case 'issue.created':
        return t('создал(а) задачу')
      case 'issue.deleted':
        return t('удалил(а) задачу')
      case 'issue.restored':
        return t('восстановил(а) задачу из корзины')
      case 'issue.assignee_added':
        return t('назначил(а) исполнителя: {{name}}', { name: memberName(a.new_value) })
      case 'issue.assignee_removed':
        return t('снял(а) исполнителя: {{name}}', { name: memberName(a.old_value) })
      case 'issue.label_added':
        return t('добавил(а) метку «{{name}}»', { name: labelName(a.new_value) })
      case 'issue.label_removed':
        return t('убрал(а) метку «{{name}}»', { name: labelName(a.old_value) })
      case 'comment.created':
        return t('оставил(а) комментарий')
      case 'comment.updated':
        return t('изменил(а) комментарий')
      case 'comment.deleted':
        return t('удалил(а) комментарий')
      case 'issue.attachment_added':
        return t('приложил(а) файл')
      case 'issue.attachment_removed':
        return t('удалил(а) файл')
      case 'issue.review_submitted':
        return t('отправил(а) на проверку')
      case 'issue.review_approved':
        return t('принял(а) результат')
      case 'issue.review_returned':
        return t('вернул(а) на доработку')
      case 'issue.acknowledged':
        return t('ознакомился(ась) с поручением')
      case 'issue.deadline_requested':
        return t('запросил(а) перенос срока на {{date}}', {
          date: a.new_value ? longDate(a.new_value) : '—',
        })
      case 'issue.deadline_approved':
        return t('одобрил(а) перенос срока')
      case 'issue.deadline_rejected':
        return t('отклонил(а) перенос срока')
      case 'issue.updated':
        switch (a.field) {
          case 'state_id':
            return t('перевёл(а) в «{{state}}»', { state: stateName(a.new_value) })
          case 'priority':
            return t('изменил(а) приоритет')
          case 'title':
            return t('переименовал(а) задачу')
          case 'description':
            return t('изменил(а) описание')
          case 'due_date':
            return a.new_value
              ? t('установил(а) срок: {{date}}', { date: longDate(a.new_value) })
              : t('убрал(а) срок')
          case 'start_date':
            return t('изменил(а) дату начала')
          case 'kind':
            return a.new_value === 'assignment' ? t('сделал(а) поручением') : t('сделал(а) обычной задачей')
          case 'controller_id':
            return t('назначил(а) контролёра: {{name}}', { name: memberName(a.new_value) })
          case 'requires_review':
            return a.new_value === 'true' ? t('включил(а) проверку результата') : t('отключил(а) проверку результата')
          case 'basis':
            return t('изменил(а) основание')
          default:
            return t('изменил(а) задачу')
        }
      default:
        return a.action
    }
  }

  const dueValue = isoToDateInput(issue.due_date, timeZone)
  const pendingReviews = reviews.filter((r) => r.decision !== 'pending').length

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full max-w-full flex-col gap-0 p-0 sm:max-w-4xl">
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pl-4 pr-12">
          {/* The chips give way on a phone so the buttons on the right stay reachable. */}
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">{identifier}</span>
          {isAssignment && (
            <span className="hidden items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary sm:inline-flex">
              <ShieldCheck size={12} />
              {t('Поручение')}
            </span>
          )}
          <span
            className="ml-1 flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs"
            style={{
              background: `${currentState?.color ?? '#94a3b8'}22`,
              color: currentState?.color ?? undefined,
            }}
          >
            <span className="size-2 rounded-full" style={{ background: currentState?.color ?? '#94a3b8' }} />
            {currentState?.name ?? '—'}
          </span>
          <DeadlineBadge dueDate={issue.due_date} group={group} completedAt={issue.completed_at} variant="full" />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {aiEnabled && (
              <button
                onClick={() => setSummaryFor(summaryFor === issue.id ? null : issue.id)}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-1.5 text-xs transition-colors hover:bg-accent',
                  summaryFor === issue.id ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground',
                )}
                title={t('Краткое содержание задачи от AI')}
              >
                <Sparkles size={15} />
                <span className="hidden sm:inline">{t('Кратко')}</span>
              </button>
            )}
            <button
              onClick={toggleWatch}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1.5 text-xs transition-colors hover:bg-accent',
                watching ? 'text-primary' : 'text-muted-foreground',
              )}
              title={watching ? t('Перестать наблюдать') : t('Наблюдать: получать уведомления об изменениях')}
            >
              {watching ? <Eye size={15} /> : <EyeOff size={15} />}
              <span className="hidden sm:inline">{watching ? t('Наблюдаю') : t('Наблюдать')}</span>
            </button>
            <button
              onClick={copyLink}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent"
              title={t('Скопировать ссылку')}
            >
              <Link2 size={16} />
            </button>
            {!readOnly && (
              <button
                onClick={handleDelete}
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title={t('Удалить задачу')}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        <SheetTitle className="sr-only">{issue.title}</SheetTitle>
        <SheetDescription className="sr-only">{t('Карточка задачи {{key}}', { key: identifier })}</SheetDescription>

        {/* Body: main + properties */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          {/* Main column */}
          <div className="flex min-w-0 flex-1 flex-col md:overflow-y-auto">
            {aiEnabled && summaryFor === issue.id && (
              <IssueAiSummary
                slug={slug}
                projectId={projectId}
                issueId={issue.id}
                onClose={() => setSummaryFor(null)}
              />
            )}
            <div className="border-b border-border p-4">
              <Textarea
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    e.currentTarget.blur()
                  }
                }}
                rows={1}
                className="min-h-0 resize-none border-none bg-transparent p-0 text-lg font-semibold shadow-none focus-visible:ring-0"
                placeholder={t('Название задачи')}
              />
              {isAssignment && (
                <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <FileText size={14} className="shrink-0" />
                  <input
                    value={basisDraft}
                    onChange={(e) => setBasisDraft(e.target.value)}
                    onBlur={saveBasis}
                    placeholder={t('Основание (приказ, протокол)…')}
                    className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70"
                  />
                </div>
              )}

              {issue.ai_assisted && (
                <div className="mt-1.5">
                  <AiMark label={t('Подготовлено с помощью AI, проверено автором')} />
                </div>
              )}

              {issue.parent_id && issue.department && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  <Send size={14} className="shrink-0" />
                  <span>{t('Подразделение: {{name}}', { name: issue.department.name })}</span>
                  {onOpenIssue && (
                    <button
                      type="button"
                      onClick={() => onOpenIssue(issue.parent_id!)}
                      className="text-primary hover:underline"
                    >
                      {t('открыть сводное поручение')}
                    </button>
                  )}
                </div>
              )}

              <Textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={saveDesc}
                rows={3}
                className="mt-2 border-none bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                placeholder={t('Добавьте описание…')}
              />
            </div>

            {/* A distribution's parent shows the departments instead of its own control block. */}
            {issue.is_distribution && (
              <DistributionBlock
                slug={slug}
                projectId={projectId}
                issue={issue}
                states={states}
                canClose={isReviewer}
                onOpenIssue={onOpenIssue}
                onIssue={(updated) => {
                  onUpdated(updated)
                  refreshFeed()
                }}
              />
            )}

            {/* Execution control */}
            {!issue.is_distribution && (isAssignment || issue.assignees.length > 0) && (
              <ControlBlock
                slug={slug}
                projectId={projectId}
                issue={issue}
                group={group}
                currentUserId={currentUserId}
                isReviewer={isReviewer}
                reviews={reviews}
                deadlineRequests={deadlineRequests}
                timeZone={timeZone}
                onIssue={(updated) => {
                  onUpdated(updated)
                  refreshFeed()
                }}
                onRefresh={refreshFeed}
              />
            )}

            <AttachmentsSection
              slug={slug}
              projectId={projectId}
              issueId={issue.id}
              attachments={attachments}
              loading={feedLoading}
              currentUserId={currentUserId}
              isAdmin={myRole === 'owner' || myRole === 'admin'}
              readOnly={readOnly}
              onChanged={refreshFeed}
            />

            {/* Comments · history · reviews · deadline changes */}
            <div className="flex-1 p-4">
              <Tabs defaultValue="comments">
                <TabsList className="flex-wrap">
                  <TabsTrigger value="comments">
                    {t('Комментарии')}
                    {comments.length > 0 ? ` ${comments.length}` : ''}
                  </TabsTrigger>
                  <TabsTrigger value="activity">{t('История')}</TabsTrigger>
                  {reviews.length > 0 && (
                    <TabsTrigger value="reviews">
                      {t('Проверки')} {reviews.length}
                    </TabsTrigger>
                  )}
                  {deadlineRequests.length > 0 && (
                    <TabsTrigger value="deadlines">
                      {t('Переносы')} {deadlineRequests.length}
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="comments" className="mt-4">
                  {!readOnly && (
                  <div className="mb-5 flex flex-col gap-2">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNewComment()
                      }}
                      rows={2}
                      placeholder={t('Напишите комментарий… (Ctrl+Enter — отправить)')}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={addNewComment} disabled={!newComment.trim()}>
                        {t('Отправить')}
                      </Button>
                    </div>
                  </div>
                  )}

                  {feedLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-3/4" />
                    </div>
                  ) : comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('Комментариев пока нет.')}</p>
                  ) : (
                    <div className="space-y-4">
                      {comments.map((c) => (
                        <div key={c.id} className="group flex gap-2.5">
                          <PersonAvatar person={c.author ? { ...c.author } : null} size={28} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {shortName(c.author) || t('Пользователь')}
                              </span>
                              <span className="text-xs text-muted-foreground" title={dateTime(c.created_at)}>
                                {timeAgo(c.created_at)}
                              </span>
                              {c.author_id === currentUserId && (
                                <button
                                  onClick={() => removeComment(c.id)}
                                  className="ml-auto rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                  title={t('Удалить комментарий')}
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </div>
                            <p className="mt-0.5 whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground">
                              {c.body.replace(/\*\*(.+?)\*\*/g, '$1')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="activity" className="mt-4">
                  {feedLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-2/3" />
                    </div>
                  ) : activity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('Событий пока нет.')}</p>
                  ) : (
                    <div className="space-y-3">
                      {activity.map((a) => (
                        <div key={a.id} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                          <PersonAvatar person={a.actor ? { ...a.actor } : null} size={20} />
                          <span>
                            <span className="font-medium text-foreground">{shortName(a.actor) || t('Кто-то')}</span>{' '}
                            {describeActivity(a)}
                          </span>
                          <span className="ml-auto shrink-0" title={dateTime(a.created_at)}>
                            {timeAgo(a.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="reviews" className="mt-4">
                  <div className="space-y-3">
                    {reviews.map((r) => (
                      <div key={r.id} className="rounded-lg border border-border p-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <PersonAvatar person={r.submitted_by} size={20} />
                          <span className="font-medium">{shortName(r.submitted_by)}</span>
                          <span className="text-muted-foreground">
                            {t('сдал(а) на проверку')} · {dateTime(r.submitted_at)}
                          </span>
                          <span
                            className={cn(
                              'ml-auto rounded-full px-2 py-0.5 text-xs font-medium',
                              r.decision === 'approved' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
                              r.decision === 'returned' && 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
                              r.decision === 'pending' && 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
                            )}
                          >
                            {r.decision === 'approved' ? t('Принято') : r.decision === 'returned' ? t('Возвращено') : t('Ждёт решения')}
                          </span>
                        </div>
                        {r.report && <p className="mt-2 whitespace-pre-wrap text-sm">{r.report}</p>}
                        {r.attachments.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-1.5">
                            {r.attachments.map((f) => {
                              const url = attachments.find((a) => a.id === f.id)?.download_url
                              return (
                                <li key={f.id}>
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex max-w-[16rem] items-center gap-1 rounded border border-border px-2 py-0.5 text-xs hover:bg-muted"
                                  >
                                    <Paperclip size={11} className="shrink-0" />
                                    <span className="truncate">{f.file_name}</span>
                                  </a>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                        {r.decided_by && (
                          <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                            {shortName(r.decided_by)} · {r.decided_at ? dateTime(r.decided_at) : ''}
                            {r.decision_comment && <span className="block text-sm text-foreground">{r.decision_comment}</span>}
                          </p>
                        )}
                      </div>
                    ))}
                    {pendingReviews > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {t('Решений по сдачам: {{n}}', { n: pendingReviews })}
                      </p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="deadlines" className="mt-4">
                  <div className="space-y-3">
                    {deadlineRequests.map((d) => (
                      <div key={d.id} className="rounded-lg border border-border p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{shortName(d.requested_by)}</span>
                          <span className="text-muted-foreground">
                            {d.old_due_date ? longDate(d.old_due_date) : '—'} → {longDate(d.new_due_date)}
                          </span>
                          <span
                            className={cn(
                              'ml-auto rounded-full px-2 py-0.5 text-xs font-medium',
                              d.status === 'approved' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
                              d.status === 'rejected' && 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
                              d.status === 'pending' && 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
                            )}
                          >
                            {d.status === 'approved' ? t('Одобрен') : d.status === 'rejected' ? t('Отклонён') : t('Ждёт решения')}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{d.reason}</p>
                        {d.decision_comment && <p className="mt-1">{d.decision_comment}</p>}
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* Properties sidebar */}
          <div className="shrink-0 border-t border-border p-4 md:w-72 md:overflow-y-auto md:border-l md:border-t-0">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Свойства')}</h3>

            <PropRow label={t('Состояние')}>
              <PopoverPrimitive.Root>
                <PopoverPrimitive.Trigger asChild>
                  <button className={triggerCls}>
                    <span className="size-3 shrink-0 rounded-full" style={{ background: currentState?.color ?? '#94a3b8' }} />
                    <span className="flex-1 truncate text-left">{currentState?.name ?? t('Выберите состояние')}</span>
                  </button>
                </PopoverPrimitive.Trigger>
                <PopContent>
                  {states.map((s) => (
                    <PopoverPrimitive.Close asChild key={s.id}>
                      <button
                        className={optionCls}
                        onClick={() =>
                          s.id !== issue.state_id &&
                          apply(updateIssue(slug, projectId, issue.id, { state_id: s.id }), t('Не удалось изменить состояние'))
                        }
                      >
                        <span className="size-3 rounded-full" style={{ background: s.color }} />
                        <span className="flex-1 text-left">{s.name}</span>
                        {s.id === issue.state_id && <Check className="size-3.5" />}
                      </button>
                    </PopoverPrimitive.Close>
                  ))}
                </PopContent>
              </PopoverPrimitive.Root>
            </PropRow>

            <PropRow label={t('Приоритет')}>
              <PopoverPrimitive.Root>
                <PopoverPrimitive.Trigger asChild>
                  <button className={triggerCls}>
                    <PriorityIcon size={15} className={cn('shrink-0', priorityMeta.iconColor)} />
                    <span className="flex-1 text-left">{priorityMeta.label}</span>
                  </button>
                </PopoverPrimitive.Trigger>
                <PopContent>
                  {PRIORITIES.map((p) => {
                    const meta = PRIORITY_CONFIG[p]
                    const Icon = meta.icon
                    return (
                      <PopoverPrimitive.Close asChild key={p}>
                        <button
                          className={optionCls}
                          onClick={() =>
                            p !== issue.priority &&
                            apply(updateIssue(slug, projectId, issue.id, { priority: p }), t('Не удалось изменить приоритет'))
                          }
                        >
                          <Icon size={15} className={meta.iconColor} />
                          <span className="flex-1 text-left">{meta.label}</span>
                          {p === issue.priority && <Check className="size-3.5" />}
                        </button>
                      </PopoverPrimitive.Close>
                    )
                  })}
                </PopContent>
              </PopoverPrimitive.Root>
            </PropRow>

            <PropRow label={t('Тип')}>
              <div className="flex gap-1 rounded-md bg-muted p-0.5 text-xs">
                {(
                  [
                    { k: 'task', label: t('Задача') },
                    { k: 'assignment', label: t('Поручение') },
                  ] as const
                ).map(({ k, label }) => (
                  <button
                    key={k}
                    disabled={!canChangeControl}
                    title={controlHint}
                    onClick={() =>
                      issue.kind !== k &&
                      apply(
                        updateIssue(slug, projectId, issue.id, {
                          kind: k,
                          ...(k === 'assignment' && !issue.controller_id && currentUserId
                            ? { controller_id: currentUserId, requires_review: true }
                            : {}),
                        }),
                        t('Не удалось изменить тип'),
                      )
                    }
                    className={cn(
                      'flex-1 rounded px-2 py-1 font-medium transition-colors disabled:cursor-not-allowed',
                      issue.kind === k ? 'bg-card shadow-sm' : 'text-muted-foreground enabled:hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </PropRow>

            {isAssignment && (
              <PropRow label={t('Контролёр')}>
                <PopoverPrimitive.Root>
                  <PopoverPrimitive.Trigger asChild disabled={!canChangeControl}>
                    <button className={cn(triggerCls, 'disabled:cursor-default')} title={controlHint}>
                      {issue.controller ? (
                        <>
                          <PersonAvatar person={issue.controller} size={20} />
                          <span className="flex-1 truncate text-left">{shortName(issue.controller)}</span>
                        </>
                      ) : (
                        <>
                          <UserCheck size={15} className="shrink-0 text-muted-foreground" />
                          <span className="flex-1 text-left text-muted-foreground">{t('Не назначен')}</span>
                        </>
                      )}
                    </button>
                  </PopoverPrimitive.Trigger>
                  <PopContent>
                    <MemberPicker
                      members={members}
                      selectedIds={issue.controller_id ? [issue.controller_id] : []}
                      closeOnPick
                      onToggle={(userId) =>
                        apply(updateIssue(slug, projectId, issue.id, { controller_id: userId }), t('Не удалось назначить контролёра'))
                      }
                    />
                  </PopContent>
                </PopoverPrimitive.Root>
              </PropRow>
            )}

            <PropRow label={t('Исполнители')}>
              <div className="space-y-1">
                {issue.assignees.map((a) => (
                  <div key={a.user_id} className="group flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent">
                    <PersonAvatar person={a.user ? { ...a.user, id: a.user_id } : null} size={20} />
                    <span className="min-w-0 flex-1 truncate" title={fullName(a.user)}>
                      {shortName(a.user)}
                    </span>
                    <button
                      title={a.is_primary ? t('Ответственный исполнитель') : t('Сделать ответственным')}
                      onClick={() =>
                        !a.is_primary &&
                        apply(
                          updateIssue(slug, projectId, issue.id, { primary_assignee_id: a.user_id }),
                          t('Не удалось назначить ответственного'),
                        )
                      }
                      className={cn(a.is_primary ? 'text-amber-500' : 'text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-amber-500')}
                    >
                      <Star size={13} fill={a.is_primary ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      title={t('Снять исполнителя')}
                      onClick={() =>
                        apply(removeAssignee(slug, projectId, issue.id, a.user_id), t('Не удалось изменить исполнителей'))
                      }
                      className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                {!readOnly && (
<PopoverPrimitive.Root>
                  <PopoverPrimitive.Trigger asChild>
                    <button className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent">
                      <UserPlus size={13} /> {t('Добавить исполнителя')}
                    </button>
                  </PopoverPrimitive.Trigger>
                  <PopContent>
                    <MemberPicker
                      members={members}
                      selectedIds={assignedIds}
                      onToggle={(userId, selected) =>
                        apply(
                          selected
                            ? removeAssignee(slug, projectId, issue.id, userId)
                            : addAssignee(slug, projectId, issue.id, userId),
                          t('Не удалось изменить исполнителей'),
                        )
                      }
                    />
                  </PopContent>
                </PopoverPrimitive.Root>
                )}
              </div>
            </PropRow>

            <PropRow label={t('Метки')}>
              <div className="space-y-1.5">
                {issue.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {issue.labels.map((l) => (
                      <span
                        key={l.label_id}
                        className="flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[11px] text-foreground"
                      >
                        <span className="size-2 rounded-full" style={{ background: l.label?.color }} />
                        {l.label?.name}
                        <button
                          onClick={() =>
                            apply(removeLabel(slug, projectId, issue.id, l.label_id), t('Не удалось убрать метку'))
                          }
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {!readOnly && (
<PopoverPrimitive.Root>
                  <PopoverPrimitive.Trigger asChild>
                    <button className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent">
                      <Plus size={13} /> {t('Добавить метку')}
                    </button>
                  </PopoverPrimitive.Trigger>
                  <PopContent>
                    <LabelPicker
                      labels={labels}
                      selectedIds={attachedLabelIds}
                      onToggle={(labelId, selected) =>
                        apply(
                          selected
                            ? removeLabel(slug, projectId, issue.id, labelId)
                            : addLabel(slug, projectId, issue.id, labelId),
                          t('Не удалось изменить метки'),
                        )
                      }
                    />
                  </PopContent>
                </PopoverPrimitive.Root>
                )}
              </div>
            </PropRow>

            <PropRow label={t('Срок')}>
              <PopoverPrimitive.Root>
                <PopoverPrimitive.Trigger asChild disabled={!canEditDeadline}>
                  <button className={triggerCls} title={canEditDeadline ? undefined : t('Срок поручения меняет контролёр — запросите перенос')}>
                    <CalendarRange size={15} className="shrink-0 text-muted-foreground" />
                    <span className={cn('flex-1 text-left', !dueValue && 'text-muted-foreground')}>
                      {issue.due_date ? longDate(issue.due_date) : t('Без срока')}
                    </span>
                  </button>
                </PopoverPrimitive.Trigger>
                <PopContent className="w-56 p-3">
                  <input
                    type="date"
                    value={dueValue}
                    onChange={(e) =>
                      apply(
                        updateIssue(slug, projectId, issue.id, { due_date: dateInputToIso(e.target.value) }),
                        t('Не удалось изменить срок'),
                      )
                    }
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                  {dueValue && (
                    <button
                      onClick={() => apply(updateIssue(slug, projectId, issue.id, { due_date: null }), t('Не удалось убрать срок'))}
                      className="mt-2 text-xs text-destructive hover:underline"
                    >
                      {t('Убрать срок')}
                    </button>
                  )}
                </PopContent>
              </PopoverPrimitive.Root>
              {(issue._count?.deadline_requests ?? 0) > 0 && (
                <p className="mt-0.5 px-2 text-[11px] text-muted-foreground">
                  {t('Переносов срока: {{n}}', { n: issue._count?.deadline_requests ?? 0 })}
                </p>
              )}
            </PropRow>

            {isAssignment && (
              <PropRow label={t('Проверка')}>
                <label className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                  <span className="text-muted-foreground">{t('Требует проверки')}</span>
                  <Switch
                    checked={issue.requires_review}
                    disabled={!isReviewer}
                    onCheckedChange={(v) =>
                      apply(updateIssue(slug, projectId, issue.id, { requires_review: v }), t('Не удалось изменить настройку'))
                    }
                  />
                </label>
              </PropRow>
            )}

            <div className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
              <p>
                {t('Создана')}: {dateTime(issue.created_at)}
              </p>
              <p>
                {t('Изменена')}: {dateTime(issue.updated_at)}
              </p>
              {issue.completed_at && (
                <p>
                  {t('Выполнена')}: {dateTime(issue.completed_at)}
                </p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MemberPicker({
  members,
  selectedIds,
  onToggle,
  closeOnPick,
}: {
  members: WorkspaceMember[]
  selectedIds: string[]
  onToggle: (userId: string, alreadySelected: boolean) => void
  closeOnPick?: boolean
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const filtered = members.filter((m) =>
    [fullName(m.user), m.user.display_name, m.position ?? ''].join(' ').toLowerCase().includes(needle),
  )
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder={t('Поиск по ФИО или должности…')} />
      <div className="max-h-64 overflow-y-auto">
        {filtered.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">{t('Никого не найдено.')}</p>}
        {filtered.map((m) => {
          const selected = selectedIds.includes(m.user_id)
          const row = (
            <button key={m.user_id} className={optionCls} onClick={() => onToggle(m.user_id, selected)}>
              <PersonAvatar person={{ ...m.user, id: m.user_id }} size={22} />
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate">{shortName(m.user)}</span>
                {m.position && <span className="block truncate text-xs text-muted-foreground">{m.position}</span>}
              </span>
              {selected && <Check className="size-3.5" />}
            </button>
          )
          return closeOnPick ? (
            <PopoverPrimitive.Close asChild key={m.user_id}>
              {row}
            </PopoverPrimitive.Close>
          ) : (
            row
          )
        })}
      </div>
    </>
  )
}

function LabelPicker({
  labels,
  selectedIds,
  onToggle,
}: {
  labels: Label[]
  selectedIds: string[]
  onToggle: (labelId: string, alreadySelected: boolean) => void
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const filtered = labels.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder={t('Поиск меток…')} />
      {labels.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">{t('В проекте нет меток.')}</p>}
      {filtered.map((l) => {
        const selected = selectedIds.includes(l.id)
        return (
          <button key={l.id} className={optionCls} onClick={() => onToggle(l.id, selected)}>
            <span className="size-3 rounded-full" style={{ background: l.color }} />
            <span className="flex-1 text-left">{l.name}</span>
            {selected && <Check className="size-3.5" />}
          </button>
        )
      })}
    </>
  )
}
