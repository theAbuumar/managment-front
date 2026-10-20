import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CornerDownRight, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { shortName } from '@/lib/people'
import { dateTime, timeAgo } from '@/lib/dates'
import { errorText } from '@/lib/errorMessages'
import { useDraft } from '@/lib/drafts'
import { Markdown } from '@/lib/markdown'
import {
  createComment,
  deleteComment,
  updateComment,
  type Comment,
} from '@/api/comment'
import type { WorkspaceMember } from '@/api/workspace'
import { MentionTextarea } from './MentionTextarea'
import { mentionHandle } from './mention'

// Comments of an issue (4.F8, ADR-031): threads one level deep (a reply to a
// reply joins the same thread), editing one's own with «изменено», @mentions
// with suggestions, safe markdown. A deleted comment with replies stays as a
// «Комментарий удалён» line so the thread keeps its context.

interface Props {
  slug: string
  projectId: string
  issueId: string
  comments: Comment[]
  onComments: (update: (prev: Comment[]) => Comment[]) => void
  members: WorkspaceMember[]
  loading: boolean
  currentUserId: string | undefined
  isAdmin: boolean
  readOnly: boolean
  /** Reload the history and counters after a change. */
  onChanged: () => void
}

export function CommentsSection({
  slug,
  projectId,
  issueId,
  comments,
  onComments,
  members,
  loading,
  currentUserId,
  isAdmin,
  readOnly,
  onChanged,
}: Props) {
  const { t } = useTranslation()
  // The comment being typed is a draft of this task (12.F5): kept through a lost
  // connection or a reload, and never carried over to another task.
  const [draft, setDraft, clearDraft] = useDraft(
    currentUserId ? `${currentUserId}:comment:${issueId}` : null,
  )
  const [sending, setSending] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Comment | null>(null)

  // «@ivanov» → «Иванов И. И.» for the members we know.
  const mention = useMemo(() => {
    const names = new Map<string, string>()
    for (const m of members) {
      const handle = mentionHandle(m)
      if (handle) names.set(handle, shortName(m.user))
    }
    return (handle: string) => names.get(handle) ?? null
  }, [members])

  const { heads, replies } = useMemo(() => {
    const byParent = new Map<string, Comment[]>()
    const top: Comment[] = []
    for (const c of comments) {
      if (c.parent_comment_id) {
        byParent.set(c.parent_comment_id, [
          ...(byParent.get(c.parent_comment_id) ?? []),
          c,
        ])
      } else {
        top.push(c)
      }
    }
    return { heads: top, replies: byParent }
  }, [comments])

  async function send(body: string, parentId: string | null): Promise<boolean> {
    const value = body.trim()
    if (!value) return false
    setSending(true)
    try {
      const created = await createComment(
        slug,
        projectId,
        issueId,
        value,
        parentId,
      )
      onComments((prev) => [...prev, created])
      onChanged()
      return true
    } catch (err) {
      toast.error(errorText(err, t('Не удалось отправить комментарий')))
      return false
    } finally {
      setSending(false)
    }
  }

  async function save(comment: Comment, body: string): Promise<boolean> {
    const value = body.trim()
    if (!value) return false
    if (value === comment.body) return true
    try {
      const updated = await updateComment(
        slug,
        projectId,
        issueId,
        comment.id,
        value,
      )
      onComments((prev) => prev.map((c) => (c.id === comment.id ? updated : c)))
      onChanged()
      return true
    } catch (err) {
      toast.error(errorText(err, t('Не удалось сохранить комментарий')))
      return false
    }
  }

  async function remove(comment: Comment) {
    const hasReplies = (replies.get(comment.id) ?? []).length > 0
    try {
      await deleteComment(slug, projectId, issueId, comment.id)
      // With replies it stays as «удалён» so the thread keeps its head.
      onComments((prev) =>
        hasReplies
          ? prev.map((c) =>
              c.id === comment.id
                ? { ...c, body: '', deleted_at: new Date().toISOString() }
                : c,
            )
          : prev.filter((c) => c.id !== comment.id),
      )
      onChanged()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить комментарий')))
    }
  }

  const item = (c: Comment, isReply: boolean) => (
    <CommentItem
      key={c.id}
      comment={c}
      isReply={isReply}
      members={members}
      mention={mention}
      canEdit={!readOnly && c.author_id === currentUserId}
      canDelete={!readOnly && (c.author_id === currentUserId || isAdmin)}
      canReply={!readOnly && !isReply && !c.deleted_at}
      editing={editing === c.id}
      onEdit={() => setEditing(c.id)}
      onCancelEdit={() => setEditing(null)}
      onSave={async (body) => {
        if (await save(c, body)) setEditing(null)
      }}
      onDelete={() => setRemoving(c)}
      onReply={() => setReplyTo(c.id)}
    />
  )

  return (
    <div>
      {!readOnly && (
        <div className="mb-5 flex flex-col gap-2">
          <MentionTextarea
            value={draft}
            onValueChange={setDraft}
            members={members}
            onSubmit={async () => {
              if (await send(draft, null)) clearDraft()
            }}
            rows={2}
            placeholder={t(
              'Напишите комментарий… @ — упомянуть, Ctrl+Enter — отправить',
            )}
            aria-label={t('Новый комментарий')}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="hidden text-[11px] text-muted-foreground sm:block">
              {t('**жирный**, *курсив*, `код`, списки через «-»')}
            </span>
            <Button
              size="sm"
              className="ml-auto"
              disabled={!draft.trim() || sending}
              onClick={async () => {
                if (await send(draft, null)) clearDraft()
              }}
            >
              {t('Отправить')}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-3/4" />
        </div>
      ) : heads.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('Комментариев пока нет.')}
        </p>
      ) : (
        <div className="space-y-4">
          {heads.map((head) => {
            const thread = replies.get(head.id) ?? []
            return (
              <div key={head.id} className="space-y-3">
                {item(head, false)}
                {(thread.length > 0 || replyTo === head.id) && (
                  <div className="ml-4 space-y-3 border-l border-border pl-3 sm:ml-9">
                    {thread.map((r) => item(r, true))}
                    {replyTo === head.id && (
                      <ReplyBox
                        members={members}
                        sending={sending}
                        onCancel={() => setReplyTo(null)}
                        onSend={async (body) => {
                          if (await send(body, head.id)) setReplyTo(null)
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('Удалить комментарий?')}
        description={
          removing && (replies.get(removing.id) ?? []).length > 0
            ? t(
                'Текст исчезнет, ответы останутся под строкой «Комментарий удалён».',
              )
            : t('Комментарий исчезнет из обсуждения.')
        }
        confirmLabel={t('Удалить')}
        onConfirm={() => removing && void remove(removing)}
      />
    </div>
  )
}

function CommentItem({
  comment: c,
  isReply,
  members,
  mention,
  canEdit,
  canDelete,
  canReply,
  editing,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onReply,
}: {
  comment: Comment
  isReply: boolean
  members: WorkspaceMember[]
  mention: (handle: string) => string | null
  canEdit: boolean
  canDelete: boolean
  canReply: boolean
  editing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSave: (body: string) => void
  onDelete: () => void
  onReply: () => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(c.body)

  if (c.deleted_at) {
    return (
      <p className="flex items-center gap-2 text-sm italic text-muted-foreground">
        <span className="size-7 shrink-0 rounded-full border border-dashed border-border" />
        {t('Комментарий удалён')}
      </p>
    )
  }

  return (
    <div className="group flex gap-2.5">
      <PersonAvatar
        person={c.author ? { ...c.author } : null}
        size={isReply ? 24 : 28}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium text-foreground">
            {shortName(c.author) || t('Пользователь')}
          </span>
          <span
            className="text-xs text-muted-foreground"
            title={dateTime(c.created_at)}
          >
            {timeAgo(c.created_at)}
          </span>
          {c.edited_at && (
            <span
              className="text-xs text-muted-foreground"
              title={t('Изменён {{when}}', { when: dateTime(c.edited_at) })}
            >
              · {t('изменено')}
            </span>
          )}
          {!editing && (canEdit || canDelete) && (
            <div className="ml-auto flex items-center gap-0.5 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
              {canEdit && (
                <button
                  onClick={() => {
                    setText(c.body)
                    onEdit()
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={t('Изменить')}
                  aria-label={t('Изменить комментарий')}
                >
                  <Pencil size={13} />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={onDelete}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title={t('Удалить')}
                  aria-label={t('Удалить комментарий')}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-1 space-y-2">
            <MentionTextarea
              autoFocus
              value={text}
              onValueChange={setText}
              members={members}
              onSubmit={() => onSave(text)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onCancelEdit()
              }}
              rows={3}
              aria-label={t('Текст комментария')}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={onCancelEdit}>
                {t('Отмена')}
              </Button>
              <Button
                size="sm"
                disabled={!text.trim()}
                onClick={() => onSave(text)}
              >
                {t('Сохранить')}
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'mt-0.5 rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground',
            )}
          >
            <Markdown text={c.body} mention={mention} />
          </div>
        )}

        {canReply && !editing && (
          <button
            onClick={onReply}
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <CornerDownRight size={12} />
            {t('Ответить')}
          </button>
        )}
      </div>
    </div>
  )
}

function ReplyBox({
  members,
  sending,
  onSend,
  onCancel,
}: {
  members: WorkspaceMember[]
  sending: boolean
  onSend: (body: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  return (
    <div className="space-y-2">
      <MentionTextarea
        autoFocus
        value={text}
        onValueChange={setText}
        members={members}
        onSubmit={() => onSend(text)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
        }}
        rows={2}
        placeholder={t('Ответ… Ctrl+Enter — отправить')}
        aria-label={t('Ответ')}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('Отмена')}
        </Button>
        <Button
          size="sm"
          disabled={!text.trim() || sending}
          onClick={() => onSend(text)}
        >
          {t('Ответить')}
        </Button>
      </div>
    </div>
  )
}
