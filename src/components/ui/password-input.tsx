import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input, type InputProps } from './input'
import { cn } from '@/lib/utils'

/** A password field with «show / hide» (12.F6): typing on a phone is easier to check. */
const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<InputProps, 'type'>
>(({ className, ...props }, ref) => {
  const { t } = useTranslation()
  const [shown, setShown] = React.useState(false)
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={shown ? 'text' : 'password'}
        className={cn('pr-9', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t('Скрыть пароль') : t('Показать пароль')}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {shown ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
})
PasswordInput.displayName = 'PasswordInput'

export { PasswordInput }
