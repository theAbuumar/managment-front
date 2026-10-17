import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { createWorkspace } from '@/api/workspace'
import { ApiError } from '@/api/client'
import { toSlug } from '@/lib/translit'
import { errorText } from '@/lib/errorMessages'
import { t as translate } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { toast } from 'sonner'

// Short random base36 tail used to make a slug globally unique on collision.
const randomTail = () => Math.random().toString(36).slice(2, 6)

const schema = z.object({
  name: z.string().trim().min(1, translate('Укажите название')).max(100),
  slug: z
    .string()
    .min(2, translate('Слишком короткий идентификатор'))
    .max(50)
    .regex(/^[a-z0-9-]+$/, translate('Только латиница, цифры и дефис')),
})

export function CreateWorkspacePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace)
  const workspace = useWorkspaceStore((s) => s.workspace)
  const email = useAuthStore((s) => s.user?.email)

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '' },
  })

  async function onSubmit({ name, slug }: z.infer<typeof schema>) {
    // Slugs are globally unique on the backend (they are the workspace URL), so a
    // common name can collide with another user's workspace. Prefix a short random
    // tail so the slug is unique from the start — `a3f2-my-work` — letting any user
    // name a workspace "My Work" no matter who else already has one. Retry with a
    // fresh prefix on the vanishingly rare collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `${randomTail()}-${slug.slice(0, 45)}`
      try {
        const created = await createWorkspace(name, candidate)
        addWorkspace(created)
        setWorkspace(created)
        // Jump straight into the new workspace — no invite-members detour.
        navigate('/')
        return
      } catch (err) {
        // Only a slug collision is worth retrying; surface anything else as-is.
        const isConflict = err instanceof ApiError && err.code === 'CONFLICT'
        if (isConflict && attempt < 4) continue
        form.setValue('slug', candidate)
        toast.error(errorText(err, t('Не удалось создать пространство')))
        return
      }
    }
  }

  // Only offer "Go back" when there's already a workspace to return to.
  function goBack() {
    if (workspace) navigate('/')
    else navigate('/login')
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center bg-background px-4">
      {email && (
        <span className="absolute right-6 top-5 text-sm text-muted-foreground">
          {email}
        </span>
      )}
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">
            {t('Создайте рабочее пространство')}
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            {t('Например, «Ректорат» или «Экономический факультет».')}
          </p>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-5"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('Название пространства')}{' '}
                    <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('Ректорат университета')}
                      {...field}
                      onChange={(e) => {
                        field.onChange(e)
                        form.setValue('slug', toSlug(e.target.value), {
                          shouldValidate: true,
                        })
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('Идентификатор для адресов')}{' '}
                    <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <div className="flex items-center overflow-hidden rounded-md border border-border focus-within:ring-1 focus-within:ring-ring">
                      <input
                        placeholder="rektorat"
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, ''),
                          )
                        }
                        className="flex-1 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t('Латиница, цифры и дефис. Заполняется из названия автоматически.')}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? t('Создаём…')
                  : t('Создать пространство')}
              </Button>
              <Button type="button" variant="secondary" onClick={goBack}>
                {t('Назад')}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  )
}
