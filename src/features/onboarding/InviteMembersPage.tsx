import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form } from '@/components/ui/form'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { inviteMember, ROLE_LABELS, type AssignableRole } from '@/api/workspace'
import { errorText } from '@/lib/errorMessages'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { toast } from 'sonner'

interface FormValues {
  members: { email: string; role: string }[]
}

const EMPTY = { email: '', role: 'member' }
const ROLES: AssignableRole[] = ['admin', 'member', 'guest']

export function InviteMembersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useWorkspaceStore((s) => s.workspace)

  const form = useForm<FormValues>({
    defaultValues: { members: [EMPTY, EMPTY, EMPTY] },
  })
  const { fields, append } = useFieldArray({
    control: form.control,
    name: 'members',
  })

  async function onSubmit({ members }: FormValues) {
    if (!workspace) return
    const filled = members.filter((m) => m.email.trim() && m.role)
    if (filled.length === 0) {
      navigate('/')
      return
    }
    try {
      await Promise.all(
        filled.map((m) => inviteMember(workspace.slug, m.email.trim(), m.role)),
      )
      toast.success(t('Приглашения отправлены'))
      navigate('/')
    } catch (err) {
      toast.error(errorText(err, t('Не удалось отправить приглашения')))
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">
            {t('Пригласите коллег')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              'Поручения работают, когда в системе есть исполнители и контролёры. Пригласите сотрудников сейчас или позже из настроек пространства.',
            )}
          </p>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-3"
          >
            <div className="grid grid-cols-[1fr_140px] gap-3 sm:grid-cols-[1fr_160px]">
              <span className="text-sm font-medium text-foreground">{t('Email')}</span>
              <span className="text-sm font-medium text-foreground">{t('Роль')}</span>
            </div>

            {fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[1fr_140px] gap-3 sm:grid-cols-[1fr_160px]">
                <Input
                  type="email"
                  aria-label={t('Email')}
                  placeholder="ivanov@university.edu"
                  {...form.register(`members.${i}.email`)}
                />
                <Controller
                  control={form.control}
                  name={`members.${i}.role`}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('Выберите роль')} />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            ))}

            <button
              type="button"
              onClick={() => append(EMPTY)}
              className="flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Plus size={14} />
              {t('Добавить ещё')}
            </button>

            <div className="mt-4 flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? t('Отправляем…') : t('Продолжить')}
              </Button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="text-center text-sm font-medium text-foreground hover:underline"
              >
                {t('Сделаю позже')}
              </button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  )
}
