import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ApiError } from '@/api/client'
import { inviteExistingUser, inviteMember, ROLE_LABELS, type AssignableRole } from '@/api/workspace'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { errorText } from '@/lib/errorMessages'

const CHANNELS: Record<string, () => string> = {
  email: () => 'email',
  telegram: () => 'Telegram',
}

export function AddMemberDialog({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AssignableRole>('member')
  const [busy, setBusy] = useState(false)

  function reset() {
    setEmail('')
    setRole('member')
  }

  async function submit() {
    const trimmed = email.trim()
    if (!workspace || !trimmed) return
    setBusy(true)
    try {
      try {
        // Already registered → an invitation in their inbox (+ email / Telegram).
        const { delivered_to } = await inviteExistingUser(workspace.slug, { email: trimmed, role })
        const via = delivered_to.map((c) => CHANNELS[c]?.() ?? c).join(', ')
        toast.success(t('Приглашение отправлено: {{email}}', { email: trimmed }), {
          description: via
            ? t('Появится во входящих приглашениях, продублировано: {{via}}.', { via })
            : t('Появится во входящих приглашениях сотрудника.'),
        })
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err
        // No account yet → an email with a sign-up link.
        await inviteMember(workspace.slug, trimmed, role)
        toast.success(t('Приглашение отправлено на {{email}}', { email: trimmed }), {
          description: t('Сотрудник ещё не зарегистрирован — по ссылке из письма он создаст аккаунт и войдёт в пространство.'),
        })
      }
      reset()
      setOpen(false)
      onAdded()
    } catch (err) {
      toast.error(errorText(err, t('Не удалось отправить приглашение')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        setOpen(v)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <UserPlus size={14} /> {t('Пригласить сотрудника')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Пригласить сотрудника')}</DialogTitle>
          <DialogDescription>
            {t(
              'Если у сотрудника уже есть аккаунт, приглашение придёт во входящие (и в Telegram, если он привязан). Если нет — на почту придёт ссылка для регистрации.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">{t('Email')}</Label>
            <Input
              id="invite-email"
              type="email"
              autoFocus
              placeholder="ivanov@university.tj"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">{t('Роль доступа')}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AssignableRole)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['admin', 'member', 'guest'] as AssignableRole[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('Подразделение и должность назначаются в списке сотрудников после вступления.')}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('Отмена')}
          </Button>
          <Button onClick={submit} disabled={busy || !email.trim()}>
            {busy ? t('Отправляем…') : t('Отправить приглашение')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
