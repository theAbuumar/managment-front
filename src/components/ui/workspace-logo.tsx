import { cn } from '@/lib/utils'

interface WorkspaceLogoProps {
  workspace:
    { name?: string | null; logo_url?: string | null } | null | undefined
  /** Side in px. */
  size?: number
  className?: string
}

/** Workspace logo (Ф3 3.F2): the uploaded image, or the first letter of the name. */
export function WorkspaceLogo({
  workspace,
  size = 24,
  className,
}: WorkspaceLogoProps) {
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.42)),
  }
  const radius = size >= 32 ? 'rounded-lg' : 'rounded-md'
  if (workspace?.logo_url) {
    return (
      <img
        src={workspace.logo_url}
        alt=""
        style={style}
        className={cn('shrink-0 object-contain', radius, className)}
      />
    )
  }
  return (
    <span
      style={style}
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-primary font-bold leading-none text-primary-foreground',
        radius,
        className,
      )}
    >
      {workspace?.name?.trim()[0]?.toUpperCase() ?? '•'}
    </span>
  )
}
