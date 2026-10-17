import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  updateMe,
  requestAccountDeletion,
  confirmAccountDeletion,
  type DeleteChallenge,
} from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { clearLocalSession } from '@/lib/session'

export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const user = useAuthStore((s) => s.user)

  // ponytail: first/last name aren't in the API — seeded from display_name,
  // not persisted. Only display_name is saved. (Mounted per-open, so these
  // initializers reseed each time the dialog opens.)
  const parts = (user?.display_name ?? '').split(' ')
  const [first, setFirst] = useState(parts[0] ?? '')
  const [last, setLast] = useState(parts.slice(1).join(' '))
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [busy, setBusy] = useState(false)
  const [imgOpen, setImgOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)

  const initial = (displayName || user?.email || 'U')[0]?.toUpperCase()

  async function save() {
    if (!displayName.trim()) return
    setBusy(true)
    try {
      const updated = await updateMe({ display_name: displayName.trim() })
      useAuthStore.setState({ user: updated })
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-3xl gap-0 overflow-hidden p-0"
          // Close only via the X. A sub-dialog (deactivate/image) portals as a
          // sibling, so closing it emits a focus/pointer-outside event here —
          // and it fires *after* our open flags reset, so a conditional guard
          // loses the race. Ignoring outside interaction unconditionally is the
          // only race-free fix, and it also stops mis-clicks losing edits.
          onInteractOutside={(e) => e.preventDefault()}
        >
          {/* Cover */}
          <div className="relative h-32 bg-muted">
            <span className="absolute right-3 bottom-3 rounded border border-border bg-background/80 px-2 py-1 text-xs">
              Change cover
            </span>
            <button
              onClick={() => setImgOpen(true)}
              className="absolute -bottom-6 left-6 flex h-16 w-16 items-center justify-center rounded-md bg-purple-500 text-3xl font-bold text-white"
            >
              {initial}
            </button>
          </div>

          <div className="px-6 pb-6 pt-9">
            <p className="text-lg font-semibold">{user?.display_name}</p>
            <p className="mb-6 text-sm text-muted-foreground">{user?.email}</p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="First name" required>
                <Input
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                />
              </Field>
              <Field label="Last name">
                <Input value={last} onChange={(e) => setLast(e.target.value)} />
              </Field>
              <Field label="Display name" required>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </Field>
            </div>

            <div className="mt-4 max-w-sm">
              <Field label="Email" required>
                {/* Disabled — no change-email endpoint. */}
                <Input disabled value={user?.email ?? ''} />
              </Field>
              <button className="mt-1 text-xs text-foreground underline underline-offset-2 hover:text-primary">
                Change email
              </button>
            </div>

            <Button
              className="mt-5"
              onClick={save}
              disabled={busy || !displayName.trim()}
            >
              {busy ? 'Saving…' : 'Save changes'}
            </Button>

            {/* Deactivate */}
            <div className="mt-8 flex items-center justify-between gap-4 rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-semibold">Deactivate account</p>
                <p className="text-xs text-muted-foreground">
                  When deactivating an account, all of the data and resources
                  within that account will be permanently removed and cannot be
                  recovered.
                </p>
              </div>
              <Button
                variant="outline"
                className="shrink-0 border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => setDeactivateOpen(true)}
              >
                Deactivate account
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ImageUploadDialog
        open={imgOpen}
        onOpenChange={setImgOpen}
        initial={initial}
      />

      <DeactivateAccountDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
      />
    </>
  )
}

// Two-step, code-confirmed account deletion, wired to the backend:
//   1) POST /auth/account/delete/request → emails (or Telegram-DMs) a 6-digit code
//   2) POST /auth/account/delete/confirm { code } → 204, account anonymized + all
//      sessions revoked server-side, so we drop local auth and bounce to /login.
function DeactivateAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const navigate = useNavigate()

  const [step, setStep] = useState<'intro' | 'code'>('intro')
  const [challenge, setChallenge] = useState<DeleteChallenge | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const codeValid = /^\d{6}$/.test(code)

  // Reset to the intro step whenever the dialog closes, so a reopen starts clean.
  function handleOpenChange(v: boolean) {
    if (!v) {
      setStep('intro')
      setChallenge(null)
      setCode('')
      setBusy(false)
    }
    onOpenChange(v)
  }

  async function requestCode() {
    setBusy(true)
    try {
      const res = await requestAccountDeletion()
      setChallenge(res)
      setCode('')
      setStep('code')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not start account deletion',
      )
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!codeValid) return
    setBusy(true)
    try {
      await confirmAccountDeletion(code)
      // The account is gone server-side (sessions revoked) — clear local session +
      // workspace state before leaving so protected routes don't flash cached data.
      clearLocalSession()
      toast.success('Your account has been deleted')
      navigate('/login')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setBusy(false)
    }
  }

  const sentTo =
    challenge?.channel === 'telegram'
      ? 'your Telegram'
      : (challenge?.email ?? 'your email')

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <Trash2 size={18} />
          </div>
          <div>
            <DialogTitle>Deactivate your account</DialogTitle>
            {step === 'intro' ? (
              <p className="mt-2 text-sm text-muted-foreground">
                This permanently deletes your account and can't be undone.
                Workspaces you solely own are transferred to another member or
                removed. We'll send a confirmation code to verify it's you.
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Enter the 6-digit code we sent to{' '}
                <span className="font-medium text-foreground">{sentTo}</span> to
                permanently delete your account.
              </p>
            )}
          </div>
        </div>

        {step === 'code' && (
          <div className="pl-14">
            <Input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmDelete()
              }}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              className="text-center tracking-[0.4em]"
            />
            <button
              type="button"
              onClick={requestCode}
              disabled={busy}
              className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            >
              Resend code
            </button>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          {step === 'intro' ? (
            <Button variant="destructive" onClick={requestCode} disabled={busy}>
              {busy ? 'Sending…' : 'Continue'}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={busy || !codeValid}
            >
              {busy ? 'Deleting…' : 'Delete account'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm text-muted-foreground">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

// ponytail: mirrors the workspace logo dialog — no avatar-upload endpoint, so
// preview only, save is a stub.
function ImageUploadDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: string
}) {
  const [preview, setPreview] = useState<string | null>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Image</DialogTitle>
        </DialogHeader>

        <label className="mx-auto flex aspect-square w-64 cursor-pointer items-center justify-center overflow-hidden rounded-md bg-purple-500 text-7xl font-bold text-white">
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
          <input
            type="file"
            accept=".jpeg,.jpg,.png,.webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setPreview(URL.createObjectURL(f))
            }}
          />
        </label>

        <p className="text-xs text-muted-foreground">
          File formats supported- .jpeg, .jpg, .png, .webp
        </p>

        <DialogFooter className="sm:justify-between">
          <Button variant="destructive" onClick={() => setPreview(null)}>
            Remove
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!preview}
              onClick={() => {
                toast.info('Avatar upload isn’t supported by the backend yet')
                onOpenChange(false)
              }}
            >
              Upload &amp; Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
