import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Crown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getWorkspaceMembers,
  requestOwnershipCode,
  transferOwnership,
  ROLE_LABELS,
  type WorkspaceData,
  type WorkspaceMember,
} from '@/api/workspace'
import { errorText } from '@/lib/errorMessages'

// Settings → General → «Передать владение» (12.B3, ADR-034): the owner picks an
// active member who is not a guest, confirms with a code sent to them (email or
// Telegram) — and stays in the workspace as an admin.

export function TransferOwnershipDialog({
  open,
  onOpenChange,
  workspace,
  userId,
  onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspace: WorkspaceData
  userId: string
  onDone: (updated: WorkspaceData, newOwner: WorkspaceMember) => void
}) {
  const { t } = useTranslation()
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null)
  const [target, setTarget] = useState('')
  const [step, setStep] = useState<'pick' | 'code'>('pick')
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getWorkspaceMembers(workspace.slug)
      .then((list) => {
        if (!cancelled)
          setMembers(
            list.filter((m) => m.user_id !== userId && m.role !== 'guest'),
          )
      })
      .catch(() => !cancelled && setMembers([]))
    return () => {
      cancelled = true
    }
  }, [open, workspace.slug, userId])

  const chosen = members?.find((m) => m.user_id === target)

  function handleOpenChange(v: boolean) {
    if (!v) {
      setStep('pick')
      setTarget('')
      setCode('')
      setBusy(false)
    }
    onOpenChange(v)
  }

  async function sendCode() {
    if (!chosen) return
    setBusy(true)
    try {
      const sent = await requestOwnershipCode(workspace.slug)
      setSentTo(
        sent.channel === 'telegram'
          ? t('ваш Telegram')
          : (sent.email ?? t('вашу почту')),
      )
      setCode('')
      setStep('code')
    } catch (err) {
      toast.error(errorText(err, t('Не удалось отправить код')))
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!chosen || !/^\d{6}$/.test(code)) return
    setBusy(true)
    try {
      const result = await transferOwnership(
        workspace.slug,
        chosen.user_id,
        code,
      )
      toast.success(
        t('Владельцем стал(а) {{name}}. Вы остаётесь администратором.', {
          name: chosen.user.display_name,
        }),
      )
      onDone(result.workspace, result.new_owner)
      handleOpenChange(false)
    } catch (err) {
      setCode('')
      toast.error(errorText(err, t('Не удалось передать владение')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Crown size={18} aria-hidden />
          </div>
          <div className="min-w-0">
            <DialogTitle>{t('Передать владение пространством')}</DialogTitle>
            <DialogDescription className="mt-2">
              {step === 'pick'
                ? t(
                    'Новый владелец получит все права, в том числе удалить пространство. Вы останетесь администратором и сможете покинуть пространство. Подтвердим кодом.',
                  )
                : t(
                    'Введите 6-значный код, отправленный на {{to}}, чтобы передать «{{workspace}}» — {{name}}.',
                    {
                      to: sentTo,
                      workspace: workspace.name,
                      name: chosen?.user.display_name ?? '',
                    },
                  )}
            </DialogDescription>
          </div>
        </div>

        {step === 'pick' && (
          <div className="grid gap-1.5 sm:pl-14">
            <Label htmlFor="new-owner">{t('Новый владелец')}</Label>
            {members !== null && members.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  'Передать некому: нужен сотрудник пространства с ролью «Администратор» или «Участник».',
                )}
              </p>
            ) : (
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger id="new-owner" disabled={members === null}>
                  <SelectValue
                    placeholder={
                      members === null
                        ? t('Загрузка…')
                        : t('Выберите сотрудника')
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(members ?? []).map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.user.display_name}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {[m.position, ROLE_LABELS[m.role]?.()]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {step === 'code' && (
          <div className="sm:pl-14">
            <Input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirm()
              }}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              aria-label={t('Код подтверждения')}
              className="text-center tracking-[0.4em]"
            />
            <button
              type="button"
              onClick={sendCode}
              disabled={busy}
              className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            >
              {t('Отправить код ещё раз')}
            </button>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            {t('Отмена')}
          </Button>
          {step === 'pick' ? (
            <Button onClick={sendCode} disabled={busy || !chosen}>
              {busy ? t('Отправляем…') : t('Получить код')}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={confirm}
              disabled={busy || code.length !== 6}
            >
              {busy ? t('Передаём…') : t('Передать владение')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
