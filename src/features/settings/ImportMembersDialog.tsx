import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileWarning,
  Loader2,
  Mail,
  Minus,
  RefreshCw,
  Upload,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ApiError } from '@/api/client'
import {
  getImportTemplate,
  importMembers,
  ROLE_LABELS,
  type ImportErrorCode,
  type ImportField,
  type ImportReport,
  type ImportRow,
  type ImportRowResult,
  type ImportRowStatus,
} from '@/api/workspace'
import { fileToBase64 } from '@/features/ai/files'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { errorText, getFriendlyMessage } from '@/lib/errorMessages'
import { pluralize } from '@/lib/plural'
import { cn } from '@/lib/utils'
import { t as translate } from '@/i18n'

// Workspace settings → «Сотрудники» → «Импорт из Excel» (4.F12, backend 4.B1):
// a file → a check that changes nothing (what happens to each row) → the run →
// the per-row result. Nobody joins without an invitation; existing members only
// get their department and position updated.

const MAX_BYTES = 5 * 1024 * 1024
const EXTENSIONS = ['xlsx', 'csv']
const ACCEPT = '.xlsx,.csv'

type Step = 'file' | 'preview' | 'done'

interface PickedFile {
  name: string
  size: number
  contentBase64: string
}

interface FileProblem {
  title: string
  text: string
}

/** Russian wording of a row's problem (the backend sends only codes). */
const ROW_ERRORS: Record<ImportErrorCode, () => string> = {
  NAME_REQUIRED: () => translate('Не указано ФИО'),
  NAME_INCOMPLETE: () => translate('Укажите фамилию и имя (и отчество)'),
  NAME_TOO_LONG: () =>
    translate('Фамилия, имя или отчество длиннее 60 символов'),
  EMAIL_REQUIRED: () => translate('Не указан email'),
  EMAIL_INVALID: () => translate('Email записан с ошибкой'),
  EMAIL_DUPLICATE: () => translate('Этот email уже есть в файле выше'),
  ROLE_INVALID: () =>
    translate('Неизвестная роль: укажите Участник, Администратор или Гость'),
  DEPARTMENT_TOO_LONG: () =>
    translate('Название подразделения длиннее 200 символов'),
  POSITION_TOO_LONG: () => translate('Должность длиннее 150 символов'),
  ACCOUNT_INACTIVE: () => translate('Аккаунт заблокирован'),
}

/** Why the backend rejected the whole file (`details.reason` of IMPORT_FILE_INVALID). */
const FILE_REASONS: Record<string, () => string> = {
  FORMAT: () =>
    translate(
      'Подходят только файлы .xlsx и .csv. Файл старого формата .xls откройте в Excel и сохраните как .xlsx.',
    ),
  UNREADABLE: () =>
    translate(
      'Файл повреждён или это не таблица Excel. Откройте его в Excel и сохраните заново как .xlsx.',
    ),
  NO_HEADER: () =>
    translate(
      'Не найдена строка заголовков с колонками «ФИО» и «Email». Заполните шаблон или подпишите колонки в первой строке.',
    ),
  EMPTY: () =>
    translate('В файле нет ни одной строки с сотрудниками под заголовками.'),
  TOO_LARGE: () =>
    translate('Файл больше 5 МБ. Разделите список на несколько файлов.'),
}

const TONES = {
  blue: 'bg-primary/10 text-primary',
  violet:
    'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  muted: 'bg-muted text-muted-foreground',
  red: 'bg-destructive/10 text-destructive',
} as const

const STATUSES: Record<
  ImportRowStatus,
  {
    label: () => string
    hint: () => string
    tone: keyof typeof TONES
    icon: LucideIcon
  }
> = {
  invite_existing: {
    label: () => translate('Приглашение'),
    hint: () =>
      translate(
        'Уже зарегистрирован: приглашение придёт во входящие, на почту и в Telegram',
      ),
    tone: 'blue',
    icon: UserCheck,
  },
  invite_new: {
    label: () => translate('Письмо-приглашение'),
    hint: () =>
      translate('Аккаунта нет: на почту придёт ссылка для регистрации'),
    tone: 'violet',
    icon: Mail,
  },
  update: {
    label: () => translate('Обновление'),
    hint: () =>
      translate(
        'Уже в пространстве: обновим подразделение и должность, роль не меняется',
      ),
    tone: 'amber',
    icon: RefreshCw,
  },
  unchanged: {
    label: () => translate('Без изменений'),
    hint: () => translate('Уже в пространстве, данные совпадают'),
    tone: 'muted',
    icon: Minus,
  },
  error: {
    label: () => translate('Ошибка'),
    hint: () => translate('Строка будет пропущена'),
    tone: 'red',
    icon: AlertCircle,
  },
}

const RESULTS: Record<
  ImportRowResult,
  { label: () => string; tone: keyof typeof TONES }
> = {
  invited: { label: () => translate('Приглашён(а)'), tone: 'green' },
  updated: { label: () => translate('Обновлено'), tone: 'amber' },
  unchanged: { label: () => translate('Без изменений'), tone: 'muted' },
  skipped: { label: () => translate('Пропущено'), tone: 'muted' },
  failed: { label: () => translate('Не удалось'), tone: 'red' },
}

const CHANNELS: Record<string, () => string> = {
  email: () => translate('почта'),
  telegram: () => 'Telegram',
}

const ROWS_FORMS = (): [string, string, string] => [
  translate('строка'),
  translate('строки'),
  translate('строк'),
]

function fileProblem(name: string, err: unknown): FileProblem {
  const title = translate('Файл «{{name}}» не принят', { name })
  if (err instanceof ApiError) {
    if (err.code === 'IMPORT_FILE_INVALID') {
      const reason = (err.details as { reason?: string } | undefined)?.reason
      return {
        title,
        text: (reason && FILE_REASONS[reason]?.()) || err.message,
      }
    }
    if (err.code === 'IMPORT_TOO_MANY_ROWS') {
      const d = err.details as { limit?: number; rows?: number } | undefined
      return {
        title,
        text: d?.rows
          ? translate(
              'Строк в файле: {{rows}}, а за один раз можно загрузить не больше {{limit}}. Разделите список на несколько файлов.',
              { rows: d.rows, limit: d.limit ?? 500 },
            )
          : err.message,
      }
    }
    // The request body is over the server's limit.
    if (err.status === 413) return { title, text: FILE_REASONS.TOO_LARGE() }
  }
  return { title: translate('Не удалось проверить файл'), text: errorText(err) }
}

/** The same checks as the server, before the file is even read. */
function localProblem(file: File): FileProblem | null {
  const title = translate('Файл «{{name}}» не принят', { name: file.name })
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (!EXTENSIONS.includes(ext)) return { title, text: FILE_REASONS.FORMAT() }
  if (file.size === 0) return { title, text: translate('Файл пустой.') }
  if (file.size > MAX_BYTES) return { title, text: FILE_REASONS.TOO_LARGE() }
  return null
}

/** A failed row: the known code in Russian, otherwise the server's message. */
function failureText(
  failure: { code: string; message: string } | undefined,
): string {
  if (!failure) return translate('Строку не удалось обработать')
  const unknown = translate('Произошла ошибка ({{code}}).', {
    code: failure.code,
  })
  const friendly = getFriendlyMessage(failure.code)
  return friendly === unknown ? failure.message : friendly
}

function saveBlob(blob: Blob, name: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  // Keep the link until the browser has picked the file name up.
  setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(link.href)
  }, 10_000)
}

// Rows render as a table on wide screens and as cards on phones — only one of
// them, so a 500-row file does not build both.
const WIDE = '(min-width: 768px)'
function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => true,
  )
}

export function ImportMembersDialog({
  onImported,
}: {
  onImported: () => void
}) {
  const { t } = useTranslation()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('file')
  const [file, setFile] = useState<PickedFile | null>(null)
  const [preview, setPreview] = useState<ImportReport | null>(null)
  const [result, setResult] = useState<ImportReport | null>(null)
  /** Name of the file being checked. */
  const [checking, setChecking] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [problem, setProblem] = useState<FileProblem | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  // A check still in flight when the dialog is closed or reset must not land.
  const attempt = useRef(0)
  const body = useRef<HTMLDivElement>(null)

  // Each step starts at its top, not where the previous one was scrolled to.
  useLayoutEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [step])

  function reset() {
    attempt.current++
    setStep('file')
    setFile(null)
    setPreview(null)
    setResult(null)
    setChecking(null)
    setProblem(null)
    setRunError(null)
  }

  function close() {
    reset()
    setOpen(false)
  }

  async function downloadTemplate() {
    if (!workspace) return
    setDownloading(true)
    try {
      const blob = await getImportTemplate(workspace.slug)
      saveBlob(blob, `${t('Шаблон импорта сотрудников')}.xlsx`)
    } catch (err) {
      toast.error(errorText(err, t('Не удалось скачать шаблон')))
    } finally {
      setDownloading(false)
    }
  }

  async function check(picked: File | undefined) {
    if (!picked || !workspace || checking) return
    const local = localProblem(picked)
    setProblem(local)
    if (local) return
    const id = ++attempt.current
    setChecking(picked.name)
    try {
      const contentBase64 = await fileToBase64(picked)
      const next = { name: picked.name, size: picked.size, contentBase64 }
      const report = await importMembers(workspace.slug, next, true)
      if (id !== attempt.current) return
      setFile(next)
      setPreview(report)
      setRunError(null)
      setStep('preview')
    } catch (err) {
      if (id !== attempt.current) return
      setProblem(fileProblem(picked.name, err))
    } finally {
      if (id === attempt.current) setChecking(null)
    }
  }

  async function run() {
    if (!workspace || !file || running) return
    setRunning(true)
    setRunError(null)
    // The progress note is at the top of the check.
    body.current?.scrollTo({ top: 0, behavior: 'smooth' })
    try {
      const report = await importMembers(workspace.slug, file, false)
      setResult(report)
      setStep('done')
      // The page behind refreshes now: updated places and new departments show at once.
      onImported()
    } catch (err) {
      const fileLevel =
        err instanceof ApiError &&
        (err.code === 'IMPORT_FILE_INVALID' ||
          err.code === 'IMPORT_TOO_MANY_ROWS')
      setRunError(
        fileLevel
          ? fileProblem(file.name, err).text
          : errorText(err, t('Не удалось выполнить импорт')),
      )
    } finally {
      setRunning(false)
    }
  }

  function chooseAnother() {
    reset()
  }

  const busy = running || checking !== null

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // The run cannot be interrupted halfway: invitations are being sent.
        if (running) return
        if (v) setOpen(true)
        else close()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <FileSpreadsheet size={14} /> {t('Импорт из Excel')}
        </Button>
      </DialogTrigger>
      <DialogContent
        // Phones: the whole screen; wider: a large centred dialog.
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          'left-0 top-0 h-dvh max-w-none translate-x-0 translate-y-0 rounded-none border-0',
          'sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border',
          step === 'file' ? 'sm:max-w-2xl' : 'sm:max-w-5xl',
        )}
        onEscapeKeyDown={(e) => running && e.preventDefault()}
        // A stray click beside the dialog must not throw away a checked file.
        onInteractOutside={(e) =>
          (step !== 'file' || busy) && e.preventDefault()
        }
      >
        <div className="border-b border-border px-4 pb-4 pt-5 sm:px-6">
          <DialogHeader className="mb-0 pr-8">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet size={18} className="shrink-0 text-primary" />
              {t('Импорт сотрудников')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'Список из Excel или CSV — приглашения в пространство сразу с подразделением и должностью.',
              )}
            </DialogDescription>
          </DialogHeader>
          <Steps current={step} />
        </div>

        <div
          ref={body}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
        >
          {step === 'file' && (
            <FileStep
              checking={checking}
              problem={problem}
              downloading={downloading}
              onDownload={downloadTemplate}
              onFile={check}
            />
          )}
          {step === 'preview' && preview && file && (
            <PreviewStep
              fileName={file.name}
              report={preview}
              running={running}
              runError={runError}
            />
          )}
          {step === 'done' && result && <DoneStep report={result} />}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          {step === 'file' && (
            <>
              <span className="hidden text-xs text-muted-foreground sm:block">
                {t('Ничего не изменится, пока вы не подтвердите импорт.')}
              </span>
              <Button variant="outline" onClick={close}>
                {t('Отмена')}
              </Button>
            </>
          )}
          {step === 'preview' && preview && (
            <PreviewActions
              report={preview}
              running={running}
              onBack={chooseAnother}
              onRun={run}
            />
          )}
          {step === 'done' && (
            <>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={chooseAnother}
              >
                <Upload size={14} /> {t('Импортировать ещё')}
              </Button>
              <Button onClick={close}>{t('Закрыть')}</Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Steps({ current }: { current: Step }) {
  const { t } = useTranslation()
  const steps: { key: Step; label: string }[] = [
    { key: 'file', label: t('Файл') },
    { key: 'preview', label: t('Проверка') },
    { key: 'done', label: t('Готово') },
  ]
  // «Готово» is the end: every step shows as passed.
  const index =
    current === 'done'
      ? steps.length
      : steps.findIndex((s) => s.key === current)
  return (
    <ol
      className="mt-4 flex items-center gap-2 text-xs"
      aria-label={t('Шаги импорта')}
    >
      {steps.map((s, i) => (
        <li
          key={s.key}
          className="flex items-center gap-2"
          aria-current={s.key === current ? 'step' : undefined}
        >
          {i > 0 && (
            <span
              aria-hidden
              className={cn(
                'h-px w-5 sm:w-10',
                i <= index ? 'bg-primary' : 'bg-border',
              )}
            />
          )}
          <span
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
              i < index && 'border-primary bg-primary text-primary-foreground',
              i === index && 'border-primary text-primary',
              i > index && 'border-border text-muted-foreground',
            )}
          >
            {i < index ? <Check size={12} strokeWidth={3} /> : i + 1}
          </span>
          <span
            className={cn(
              s.key === current
                ? 'font-medium text-foreground'
                : 'text-muted-foreground',
            )}
          >
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

// ─── Step 1: the file ─────────────────────────────────────────────────────────

function FileStep({
  checking,
  problem,
  downloading,
  onDownload,
  onFile,
}: {
  checking: string | null
  problem: FileProblem | null
  downloading: boolean
  onDownload: () => void
  onFile: (file: File | undefined) => void
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const columns: { name: string; required?: boolean; hint: string }[] = [
    {
      name: t('ФИО'),
      required: true,
      hint: t('Фамилия, имя и отчество через пробел: Иванов Иван Иванович'),
    },
    {
      name: t('Email'),
      required: true,
      hint: t('Рабочая почта — на неё придёт приглашение'),
    },
    {
      name: t('Подразделение'),
      hint: t(
        'Путь через «/», например «Экономический факультет / Кафедра финансов». Готовые пути — на листе «Подразделения» шаблона',
      ),
    },
    {
      name: t('Должность'),
      hint: t('Например, доцент или заведующий кафедрой'),
    },
    {
      name: t('Роль'),
      hint: t('Участник, Администратор или Гость; пусто — Участник'),
    },
  ]

  const rules: { icon: LucideIcon; text: string }[] = [
    {
      icon: FileSpreadsheet,
      text: t(
        'До 500 строк и 5 МБ за раз: .xlsx или .csv (UTF-8 или Windows-1251).',
      ),
    },
    {
      icon: Building2,
      text: t(
        'Подразделения, которых ещё нет в оргструктуре, будут созданы по указанному пути.',
      ),
    },
    {
      icon: Mail,
      text: t(
        'Без приглашения никто не добавляется: зарегистрированные получат приглашение во входящие, остальные — письмо со ссылкой для регистрации.',
      ),
    },
    {
      icon: RefreshCw,
      text: t(
        'Тем, кто уже в пространстве, обновим подразделение и должность — роль не меняется.',
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          'Сначала файл проверяется: вы увидите, что произойдёт с каждой строкой, и только потом подтвердите импорт.',
        )}
      </p>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
            <FileSpreadsheet size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{t('Шаблон Excel')}</p>
            <p className="text-xs text-muted-foreground">
              {t(
                'Лист для заполнения, пример и список подразделений вашего пространства.',
              )}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={downloading}
          onClick={onDownload}
        >
          {downloading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {t('Скачать шаблон')}
        </Button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!checking) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          onFile(e.dataTransfer.files[0])
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-7 text-center transition-colors',
          over
            ? 'border-primary bg-primary/5'
            : problem
              ? 'border-destructive/40'
              : 'border-border',
        )}
      >
        {checking ? (
          <>
            <Loader2 className="size-7 animate-spin text-primary" />
            <p className="text-sm font-medium break-all">
              {t('Проверяем «{{name}}»…', { name: checking })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                'Ничего не меняем — только смотрим, что произойдёт с каждой строкой.',
              )}
            </p>
          </>
        ) : (
          <>
            <Upload className="size-7 text-muted-foreground" />
            <p className="text-sm">
              <span className="hidden sm:inline">
                {t('Перетащите файл .xlsx или .csv сюда или')}
              </span>
              <span className="sm:hidden">{t('Файл .xlsx или .csv')}</span>
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => input.current?.click()}
            >
              <FileSpreadsheet size={14} />
              {problem ? t('Выбрать другой файл') : t('Выбрать файл')}
            </Button>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="hidden"
          data-testid="import-file"
          onChange={(e) => {
            onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>

      {problem && !checking && (
        <div
          role="alert"
          className="flex gap-2.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          <FileWarning size={16} className="mt-0.5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="font-medium text-destructive break-all">
              {problem.title}
            </p>
            <p className="text-foreground/80">{problem.text}</p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border">
        <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground sm:px-4">
          {t('Колонки файла')}
        </p>
        <dl className="divide-y divide-border text-sm">
          {columns.map((c) => (
            <div
              key={c.name}
              className="grid gap-0.5 px-3 py-2 sm:grid-cols-[140px_1fr] sm:gap-3 sm:px-4"
            >
              <dt className="font-medium">
                {c.name}
                {c.required && (
                  <span className="text-destructive" title={t('Обязательно')}>
                    {' *'}
                  </span>
                )}
              </dt>
              <dd className="text-muted-foreground">{c.hint}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ul className="space-y-2 text-sm text-muted-foreground">
        {rules.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-2.5">
            <Icon size={15} className="mt-0.5 shrink-0" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Step 2: the check ────────────────────────────────────────────────────────

/** Rows the run will act on: invitations and updates (unchanged rows do nothing). */
const toRun = (r: ImportReport) =>
  r.summary.invite_existing + r.summary.invite_new + r.summary.update

function PreviewActions({
  report,
  running,
  onBack,
  onRun,
}: {
  report: ImportReport
  running: boolean
  onBack: () => void
  onRun: () => void
}) {
  const { t } = useTranslation()
  const n = toRun(report)
  const invites = report.summary.invite_existing + report.summary.invite_new
  return (
    <>
      <Button
        variant="outline"
        className="gap-1.5"
        disabled={running}
        onClick={onBack}
      >
        <Upload size={14} /> {t('Выбрать другой файл')}
      </Button>
      <Button className="gap-1.5" disabled={running || n === 0} onClick={onRun}>
        {running ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            {invites > 0
              ? t('Отправляем приглашения…')
              : t('Обновляем данные…')}
          </>
        ) : (
          t('Импортировать {{n}}', { n })
        )}
      </Button>
    </>
  )
}

function PreviewStep({
  fileName,
  report,
  running,
  runError,
}: {
  fileName: string
  report: ImportReport
  running: boolean
  runError: string | null
}) {
  const { t } = useTranslation()
  const wide = useWide()
  const [onlyErrors, setOnlyErrors] = useState(false)
  const s = report.summary
  const n = toRun(report)
  const rows = useMemo(
    () =>
      onlyErrors
        ? report.rows.filter((r) => r.status === 'error')
        : report.rows,
    [report, onlyErrors],
  )

  const chips: { status: ImportRowStatus; label: string; n: number }[] = [
    {
      status: 'invite_existing',
      label: t('Пригласим зарегистрированных'),
      n: s.invite_existing,
    },
    {
      status: 'invite_new',
      label: t('Отправим письма-приглашения'),
      n: s.invite_new,
    },
    {
      status: 'update',
      label: t('Обновим подразделение и должность'),
      n: s.update,
    },
    { status: 'unchanged', label: t('Без изменений'), n: s.unchanged },
    { status: 'error', label: t('С ошибками'), n: s.errors },
  ]

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <FileSpreadsheet size={15} className="shrink-0 text-primary" />
        <span className="font-medium break-all">{fileName}</span>
        <span className="text-muted-foreground">
          · {pluralize(s.total, ROWS_FORMS())}
        </span>
      </p>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const { icon: Icon, tone } = STATUSES[c.status]
          return (
            <span
              key={c.status}
              title={STATUSES[c.status].hint()}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
                c.n > 0
                  ? TONES[tone]
                  : 'bg-muted/60 text-muted-foreground opacity-70',
              )}
            >
              <Icon size={13} className="shrink-0" />
              {c.label}:{' '}
              <span className="tabular-nums font-semibold">{c.n}</span>
            </span>
          )
        })}
      </div>

      {running && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"
        >
          <Loader2 size={16} className="shrink-0 animate-spin text-primary" />
          <span>
            {t(
              'Отправляем приглашения и обновляем данные. Это может занять до минуты — не закрывайте окно.',
            )}
          </span>
        </div>
      )}

      {runError && (
        <div
          role="alert"
          className="flex gap-2.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">
              {t('Импорт не выполнен')}
            </p>
            <p className="text-foreground/80">{runError}</p>
          </div>
        </div>
      )}

      {s.departments_to_create.length > 0 && (
        <NewDepartments paths={s.departments_to_create} />
      )}

      {s.errors > 0 && (
        <div className="flex gap-2.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>
            {n > 0
              ? t(
                  'Строки с ошибками ({{errors}}) будут пропущены, остальные импортируем. Чтобы загрузить и их, исправьте файл и проверьте его снова.',
                  { errors: s.errors },
                )
              : t(
                  'Во всех строках есть ошибки — импортировать нечего. Исправьте файл и проверьте его снова.',
                )}
          </p>
        </div>
      )}
      {s.errors === 0 && n === 0 && (
        <div className="flex gap-2.5 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <p>
            {t(
              'Все сотрудники из файла уже в пространстве с теми же данными — импортировать нечего.',
            )}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <h3 className="text-sm font-semibold">{t('Строки файла')}</h3>
        {s.errors > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={onlyErrors} onCheckedChange={setOnlyErrors} />
            {t('Только ошибки')}
          </label>
        )}
      </div>

      {wide ? <PreviewTable rows={rows} /> : <PreviewCards rows={rows} />}
    </div>
  )
}

function NewDepartments({ paths }: { paths: string[] }) {
  const { t } = useTranslation()
  const [all, setAll] = useState(false)
  const LIMIT = 8
  const shown = all ? paths : paths.slice(0, LIMIT)
  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <p className="mb-2 flex items-center gap-2 font-medium">
        <Building2 size={15} className="shrink-0 text-primary" />
        {t('Будут созданы подразделения: {{n}}', { n: paths.length })}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((p) => (
          <li
            key={p}
            className="rounded bg-muted px-2 py-0.5 text-xs break-words"
          >
            {p}
          </li>
        ))}
        {paths.length > LIMIT && (
          <li>
            <button
              type="button"
              className="rounded px-2 py-0.5 text-xs font-medium text-primary hover:underline"
              onClick={() => setAll((v) => !v)}
            >
              {all
                ? t('Свернуть')
                : t('и ещё {{n}}', { n: paths.length - LIMIT })}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

function StatusChip({ status }: { status: ImportRowStatus }) {
  const { label, hint, tone, icon: Icon } = STATUSES[status]
  return (
    <span
      title={hint()}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
      )}
    >
      <Icon size={12} />
      {label()}
    </span>
  )
}

function RowErrors({ row, className }: { row: ImportRow; className?: string }) {
  if (row.errors.length === 0) return null
  return (
    <ul className={cn('space-y-0.5 text-xs text-destructive', className)}>
      {row.errors.map((e, i) => (
        <li key={i} className="flex gap-1.5">
          <span aria-hidden>•</span>
          <span>{ROW_ERRORS[e.code]?.() ?? e.code}</span>
        </li>
      ))}
    </ul>
  )
}

const bad = (row: ImportRow, field: ImportField) =>
  row.errors.some((e) => e.field === field)

function RoleText({ row }: { row: ImportRow }) {
  const { t } = useTranslation()
  if (bad(row, 'role'))
    return <span className="text-destructive">{t('не распознана')}</span>
  return <>{ROLE_LABELS[row.role]()}</>
}

function DepartmentText({ row }: { row: ImportRow }) {
  const { t } = useTranslation()
  if (!row.department) return <span className="text-muted-foreground">—</span>
  // The last part of the path is the department itself; its parents go small below.
  const parents = row.department.split(' / ')
  const name = parents.pop()
  return (
    <div
      className={cn('min-w-0', bad(row, 'department') && 'text-destructive')}
    >
      <p className="break-words">
        {name}
        {row.new_departments.length > 0 && (
          <span
            title={t('Будет создано: {{list}}', {
              list: row.new_departments.join('; '),
            })}
            className="ml-1.5 inline-flex rounded bg-primary/10 px-1.5 py-px align-[1px] text-[10px] font-semibold uppercase tracking-wide text-primary"
          >
            {t('новое')}
          </span>
        )}
      </p>
      {parents.length > 0 && (
        <p className="text-xs break-words text-muted-foreground">
          {parents.join(' / ')}
        </p>
      )}
    </div>
  )
}

function PreviewTable({ rows }: { rows: ImportRow[] }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md border border-border">
      <table className="w-full table-fixed text-sm">
        <thead className="sticky -top-4 z-10 bg-background shadow-[inset_0_-1px_0_var(--border)]">
          <tr className="text-left text-xs text-muted-foreground">
            <th className="w-16 py-2 pl-3 pr-2 font-medium">{t('Строка')}</th>
            <th className="w-[23%] py-2 pr-3 font-medium">{t('Сотрудник')}</th>
            <th className="w-[24%] py-2 pr-3 font-medium">
              {t('Подразделение')}
            </th>
            <th className="w-[15%] py-2 pr-3 font-medium">{t('Должность')}</th>
            <th className="w-28 py-2 pr-3 font-medium">{t('Роль')}</th>
            <th className="py-2 pr-3 font-medium">{t('Что произойдёт')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.row}
              className={cn(
                'border-t border-border align-top',
                r.status === 'error' && 'bg-destructive/5',
              )}
            >
              <td className="py-2.5 pl-3 pr-2 tabular-nums text-muted-foreground">
                {r.row}
              </td>
              <td className="py-2.5 pr-3">
                <p
                  className={cn(
                    'font-medium break-words',
                    bad(r, 'full_name') && 'text-destructive',
                  )}
                >
                  {r.full_name || '—'}
                </p>
                <p
                  className={cn(
                    'text-xs break-all',
                    bad(r, 'email')
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                  )}
                >
                  {r.email || '—'}
                </p>
              </td>
              <td className="py-2.5 pr-3 break-words">
                <DepartmentText row={r} />
              </td>
              <td
                className={cn(
                  'py-2.5 pr-3 break-words',
                  bad(r, 'position') && 'text-destructive',
                )}
              >
                {r.position || <span className="text-muted-foreground">—</span>}
              </td>
              <td className="py-2.5 pr-3">
                <RoleText row={r} />
              </td>
              <td className="py-2.5 pr-3">
                <StatusChip status={r.status} />
                <RowErrors row={r} className="mt-1.5" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PreviewCards({ rows }: { rows: ImportRow[] }) {
  const { t } = useTranslation()
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.row}
          className={cn(
            'rounded-lg border p-3',
            r.status === 'error'
              ? 'border-destructive/40 bg-destructive/5'
              : 'border-border',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p
                className={cn(
                  'font-medium break-words',
                  bad(r, 'full_name') && 'text-destructive',
                )}
              >
                {r.full_name || '—'}
              </p>
              <p
                className={cn(
                  'text-xs break-all',
                  bad(r, 'email')
                    ? 'text-destructive'
                    : 'text-muted-foreground',
                )}
              >
                {r.email || '—'}
              </p>
            </div>
            <StatusChip status={r.status} />
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">{t('Строка')}</dt>
            <dd className="tabular-nums">{r.row}</dd>
            <dt className="text-muted-foreground">{t('Подразделение')}</dt>
            <dd className="min-w-0 break-words">
              <DepartmentText row={r} />
            </dd>
            <dt className="text-muted-foreground">{t('Должность')}</dt>
            <dd
              className={cn(
                'min-w-0 break-words',
                bad(r, 'position') && 'text-destructive',
              )}
            >
              {r.position || '—'}
            </dd>
            <dt className="text-muted-foreground">{t('Роль')}</dt>
            <dd>
              <RoleText row={r} />
            </dd>
          </dl>
          <RowErrors row={r} className="mt-2" />
        </li>
      ))}
    </ul>
  )
}

// ─── Step 3: the result ───────────────────────────────────────────────────────

function DoneStep({ report }: { report: ImportReport }) {
  const { t } = useTranslation()
  const [onlyProblems, setOnlyProblems] = useState(false)
  const s = report.summary
  const count = (result: ImportRowResult) =>
    report.rows.filter((r) => r.result === result).length
  const invited = s.invited ?? count('invited')
  const updated = s.updated ?? count('updated')
  const failed = s.failed ?? count('failed')
  const skipped = count('skipped')
  const unchanged = count('unchanged')
  const problems = failed + skipped
  const rows = useMemo(
    () =>
      onlyProblems
        ? report.rows.filter(
            (r) => r.result === 'failed' || r.result === 'skipped',
          )
        : report.rows,
    [report, onlyProblems],
  )

  const tiles: { label: string; n: number; tone: string }[] = [
    {
      label: t('Приглашено'),
      n: invited,
      tone: 'text-green-700 dark:text-green-400',
    },
    {
      label: t('Обновлено'),
      n: updated,
      tone: 'text-amber-700 dark:text-amber-400',
    },
    { label: t('Пропущено'), n: skipped, tone: 'text-muted-foreground' },
    { label: t('Не удалось'), n: failed, tone: 'text-destructive' },
  ]

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'flex items-start gap-3 rounded-lg border p-4',
          failed > 0
            ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
            : 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30',
        )}
      >
        {failed > 0 ? (
          <AlertCircle className="size-6 shrink-0 text-amber-600 dark:text-amber-400" />
        ) : (
          <CheckCircle2 className="size-6 shrink-0 text-green-600 dark:text-green-400" />
        )}
        <div className="min-w-0">
          <p className="font-semibold">
            {failed > 0
              ? t('Импорт завершён, но часть строк обработать не удалось')
              : t('Импорт завершён')}
          </p>
          <p className="text-sm text-muted-foreground">
            {invited > 0
              ? t('Приглашённые появятся в списке, когда примут приглашение.')
              : t('Список сотрудников уже обновлён.')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg border border-border px-3 py-2.5"
          >
            <p
              className={cn(
                'text-2xl font-semibold tabular-nums',
                tile.n > 0 ? tile.tone : 'text-muted-foreground',
              )}
            >
              {tile.n}
            </p>
            <p className="text-xs text-muted-foreground">{tile.label}</p>
          </div>
        ))}
      </div>

      {unchanged > 0 && (
        <p className="flex gap-2 text-sm text-muted-foreground">
          <Minus size={15} className="mt-0.5 shrink-0" />
          <span>
            {t('Без изменений: {{n}} — данные в пространстве уже совпадали.', {
              n: unchanged,
            })}
          </span>
        </p>
      )}

      {s.departments_to_create.length > 0 && (
        <p className="flex gap-2 text-sm text-muted-foreground">
          <Building2 size={15} className="mt-0.5 shrink-0 text-primary" />
          <span>
            {t('Созданы подразделения: {{list}}', {
              list: s.departments_to_create.join(', '),
            })}
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <h3 className="text-sm font-semibold">{t('Результат по строкам')}</h3>
        {problems > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={onlyProblems} onCheckedChange={setOnlyProblems} />
            {t('Только пропущенные и с ошибкой')}
          </label>
        )}
      </div>

      <ul className="divide-y divide-border rounded-md border border-border">
        {rows.map((r) => (
          <ResultItem key={r.row} row={r} />
        ))}
      </ul>
    </div>
  )
}

function ResultItem({ row }: { row: ImportRow }) {
  const { t } = useTranslation()
  const result = row.result ?? 'skipped'
  const { label, tone } = RESULTS[result]

  let detail: React.ReactNode = null
  if (result === 'invited') {
    detail =
      row.status === 'invite_new'
        ? t('Письмо со ссылкой для регистрации')
        : row.delivered_to?.length
          ? t('Во входящие приглашения, продублировано: {{via}}', {
              via: row.delivered_to.map((c) => CHANNELS[c]?.() ?? c).join(', '),
            })
          : t('Во входящие приглашения')
  } else if (result === 'updated') {
    detail = t('Подразделение и должность обновлены')
  } else if (result === 'unchanged') {
    detail = t('Данные уже совпадали')
  } else if (result === 'failed') {
    detail = (
      <span className="text-destructive">{failureText(row.failure)}</span>
    )
  } else if (row.errors.length > 0) {
    detail = <RowErrors row={row} />
  }

  return (
    <li
      className={cn(
        'flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3',
        result === 'failed' && 'bg-destructive/5',
      )}
    >
      <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground sm:pt-0.5">
        {t('Строка {{n}}', { n: row.row })}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-words">
          {row.full_name || '—'}
        </p>
        <p className="text-xs text-muted-foreground break-all">
          {row.email || '—'}
        </p>
        {row.department && (
          <p
            className="truncate text-xs text-muted-foreground"
            title={row.department}
          >
            {row.department.split(' / ').pop()}
          </p>
        )}
      </div>
      <div className="min-w-0 sm:w-80 sm:shrink-0">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
            TONES[tone],
          )}
        >
          {result === 'invited' && <Check size={12} />}
          {label()}
        </span>
        {detail && (
          <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
        )}
      </div>
    </li>
  )
}
