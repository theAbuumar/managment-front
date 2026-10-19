import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  History,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/dates'
import { errorText } from '@/lib/errorMessages'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { refreshAiStatus } from '@/stores/aiStore'
import { getIssue, type Issue } from '@/api/issue'
import {
  askAi,
  deleteConversation,
  getConversation,
  getConversations,
  type AiConversation,
  type AiIssueRef,
  type AiMessage,
} from '@/api/ai'
import { ApiError } from '@/api/client'
import { WorkspaceIssuePanel } from '@/features/issues/WorkspaceIssuePanel'
import { AiCheckNote, AiMark, AiText } from './AiBits'
import { AiLayout } from './AiLayout'

// The AI panel (Ф11 11.F1): questions in plain words, answered from what the
// asker may see (backend 11.B5). Issue keys in an answer open the issue; only
// issues the assistant's tools returned are links. Dialogues are the asker's own.

const EXAMPLES = [
  'Что просрочено у факультета экономики и управления?',
  'Какие поручения ждут моей проверки?',
  'Как изменилась исполнительская дисциплина за месяц?',
  'У кого больше всего просроченных поручений?',
]

function Conversations({
  items,
  current,
  onPick,
  onNew,
  onDelete,
}: {
  items: AiConversation[] | null
  current: string | null
  onPick: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={onNew}
        >
          <MessageSquarePlus size={14} />
          {t('Новый диалог')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {items === null && (
          <div className="flex justify-center py-6">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {items?.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            {t('Диалогов пока нет.')}
          </p>
        )}
        {items?.map((c) => (
          <div
            key={c.id}
            className={cn(
              'group flex items-center gap-1 rounded-md pr-1 transition-colors',
              c.id === current ? 'bg-accent' : 'hover:bg-accent/60',
            )}
          >
            <button
              type="button"
              onClick={() => onPick(c.id)}
              className="min-w-0 flex-1 px-2 py-1.5 text-left"
            >
              <span className="block truncate text-sm">{c.title}</span>
              <span className="block text-[11px] text-muted-foreground">
                {timeAgo(c.updated_at)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(c.id)}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
              title={t('Удалить диалог')}
              aria-label={t('Удалить диалог')}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Message({
  message,
  onOpen,
}: {
  message: AiMessage
  onOpen: (ref: AiIssueRef) => void
}) {
  const { t } = useTranslation()
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary/10 px-3.5 py-2 text-sm">
          {message.content}
        </div>
      </div>
    )
  }
  const refs = new Map(message.issues.map((r) => [r.key, r]))
  const link = (key: string) => {
    const ref = refs.get(key)
    if (!ref) return null
    return (
      <button
        type="button"
        onClick={() => onOpen(ref)}
        className="whitespace-nowrap rounded bg-primary/10 px-1 font-mono text-[12px] font-medium text-primary hover:underline"
        title={ref.title}
      >
        {key}
      </button>
    )
  }
  return (
    <div className="max-w-[92%] space-y-2">
      <AiMark />
      <AiText text={message.content} link={link} />
      {message.issues.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('Задачи в ответе')}
          </p>
          <div className="flex flex-col gap-1">
            {message.issues.map((ref) => (
              <button
                key={ref.id}
                type="button"
                onClick={() => onOpen(ref)}
                className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              >
                <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {ref.key}
                </span>
                <span className="truncate">{ref.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function AiAssistantPage() {
  const { t } = useTranslation()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const [conversations, setConversations] = useState<AiConversation[] | null>(
    null,
  )
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [loadingDialog, setLoadingDialog] = useState(false)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [opened, setOpened] = useState<Issue | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    getConversations(slug)
      .then((r) => !cancelled && setConversations(r.data))
      .catch(() => !cancelled && setConversations([]))
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, asking])

  async function pick(id: string) {
    if (!slug) return
    setHistoryOpen(false)
    setCurrentId(id)
    setLoadingDialog(true)
    try {
      const c = await getConversation(slug, id)
      setMessages(c.messages)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось открыть диалог')))
      setCurrentId(null)
    } finally {
      setLoadingDialog(false)
    }
  }

  function startNew() {
    setHistoryOpen(false)
    setCurrentId(null)
    setMessages([])
  }

  async function remove(id: string) {
    if (!slug) return
    try {
      await deleteConversation(slug, id)
      setConversations((prev) => prev?.filter((c) => c.id !== id) ?? prev)
      if (id === currentId) startNew()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось удалить диалог')))
    }
  }

  async function send(text = question) {
    const value = text.trim()
    if (!slug || !value || asking) return
    setAsking(true)
    setQuestion('')
    const pending: AiMessage = {
      id: 'pending',
      role: 'user',
      content: value,
      issues: [],
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, pending])
    try {
      const answer = await askAi(slug, {
        question: value,
        ...(currentId && { conversation_id: currentId }),
      })
      setCurrentId(answer.conversation.id)
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== 'pending'),
        answer.question,
        answer.message,
      ])
      setConversations((prev) => [
        answer.conversation,
        ...(prev ?? []).filter((c) => c.id !== answer.conversation.id),
      ])
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== 'pending'))
      setQuestion(value)
      toast.error(errorText(err, t('AI не смог ответить')))
      if (err instanceof ApiError && err.code === 'AI_LIMIT_REACHED')
        refreshAiStatus()
    } finally {
      setAsking(false)
    }
  }

  async function openIssue(ref: AiIssueRef) {
    if (!slug) return
    try {
      setOpened(await getIssue(slug, ref.project_id, ref.id))
    } catch (err) {
      toast.error(errorText(err, t('Задача недоступна')))
    }
  }

  const list = (
    <Conversations
      items={conversations}
      current={currentId}
      onPick={pick}
      onNew={startNew}
      onDelete={remove}
    />
  )

  return (
    <AiLayout
      actions={
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden"
          onClick={() => setHistoryOpen(true)}
          aria-label={t('История диалогов')}
        >
          <History size={15} />
        </Button>
      }
    >
      <div className="flex h-full">
        <aside className="hidden w-64 shrink-0 border-r border-border md:block">
          {list}
        </aside>
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetContent side="left" className="w-72 p-0 pt-10">
            <SheetTitle className="sr-only">{t('История диалогов')}</SheetTitle>
            <SheetDescription className="sr-only">
              {t('Ваши диалоги с AI-помощником')}
            </SheetDescription>
            {list}
          </SheetContent>
        </Sheet>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
              {loadingDialog && (
                <div className="flex justify-center py-10">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loadingDialog && messages.length === 0 && (
                <div className="space-y-5 py-6 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-violet-500/10">
                    <Sparkles className="size-6 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-semibold">
                      {t('Спросите о поручениях своими словами')}
                    </p>
                    <p className="mx-auto max-w-md text-sm text-muted-foreground">
                      {t(
                        'Помощник ищет задачи, просрочки и показатели в пределах ваших прав и даёт ссылки на задачи.',
                      )}
                    </p>
                  </div>
                  <div className="mx-auto grid max-w-xl gap-2 sm:grid-cols-2">
                    {EXAMPLES.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => send(t(q))}
                        disabled={asking}
                        className="rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                      >
                        {t(q)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!loadingDialog &&
                messages.map((m) => (
                  <Message key={m.id} message={m} onOpen={openIssue} />
                ))}
              {asking && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t('AI ищет ответ в данных…')}
                </div>
              )}
              <div ref={bottom} />
            </div>
          </div>

          <div className="border-t border-border bg-background p-3 sm:p-4">
            <div className="mx-auto max-w-3xl space-y-2">
              <div className="flex items-end gap-2">
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  rows={2}
                  maxLength={2000}
                  placeholder={t(
                    'Например: что просрочено у ФЭУ на этой неделе?',
                  )}
                  className="min-h-0 resize-none"
                  aria-label={t('Вопрос AI-помощнику')}
                />
                <Button
                  onClick={() => send()}
                  disabled={asking || !question.trim()}
                  aria-label={t('Отправить')}
                >
                  {asking ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Send size={15} />
                  )}
                </Button>
              </div>
              <AiCheckNote>
                {t(
                  'Ответы готовит AI по данным системы — проверяйте важное по ссылкам на задачи.',
                )}
              </AiCheckNote>
            </div>
          </div>
        </section>
      </div>

      {slug && (
        <WorkspaceIssuePanel
          slug={slug}
          issue={opened}
          onClose={() => setOpened(null)}
          onUpdated={(updated) => setOpened(updated)}
          onDeleted={() => setOpened(null)}
        />
      )}
    </AiLayout>
  )
}
