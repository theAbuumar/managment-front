import * as React from 'react'
import {
  useFormContext,
  Controller,
  FormProvider,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form'
import { Slot } from '@radix-ui/react-slot'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const Form = FormProvider

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = { name: TName }

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue,
)

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ ...props }: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

function useFormField() {
  const fieldContext = React.useContext(FormFieldContext)
  const { getFieldState, formState } = useFormContext()
  const fieldState = getFieldState(fieldContext.name, formState)
  return { name: fieldContext.name, ...fieldState }
}

const FormItemContext = React.createContext<{ id: string }>({ id: '' })

function FormItem({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const id = React.useId()
  return (
    <FormItemContext.Provider value={{ id }}>
      <div className={cn('space-y-1.5', className)} {...props} />
    </FormItemContext.Provider>
  )
}

function FormLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Label>) {
  const { error } = useFormField()
  const { id } = React.useContext(FormItemContext)
  return <Label htmlFor={id} error={!!error} className={className} {...props} />
}

/**
 * Puts the id, `aria-invalid` and the error link on the field itself (a Slot, as in
 * shadcn), so FormLabel's `for` reaches the input and screen readers announce the
 * label and the error (12.F3). The child must be the input (or pass these props on).
 */
function FormControl({
  ...props
}: React.ComponentPropsWithoutRef<typeof Slot>) {
  const { error } = useFormField()
  const { id } = React.useContext(FormItemContext)
  return (
    <Slot
      id={id}
      aria-invalid={!!error}
      aria-describedby={error ? `${id}-error` : undefined}
      {...props}
    />
  )
}

function FormMessage({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const { error } = useFormField()
  const { id } = React.useContext(FormItemContext)
  const body = error ? String(error.message) : children
  if (!body) return null
  return (
    <p
      id={`${id}-error`}
      className={cn('text-xs font-medium text-destructive', className)}
      {...props}
    >
      {body}
    </p>
  )
}

export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  useFormField,
}
