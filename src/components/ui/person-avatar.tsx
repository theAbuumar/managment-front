import { cn } from '@/lib/utils'
import { avatarColor, fullName, initials, type PersonLike } from '@/lib/people'

interface PersonAvatarProps {
  person: (PersonLike & { id?: string | null; avatar_url?: string | null }) | null | undefined
  size?: number
  className?: string
  /** Show the full name as a native tooltip. */
  title?: boolean
  /** Decorative next to a name or inside a labelled button (12.F3). */
  'aria-hidden'?: boolean
}

/** Round avatar: the uploaded photo, or coloured initials (Ф3). */
export function PersonAvatar({
  person,
  size = 24,
  className,
  title = true,
  'aria-hidden': hidden,
}: PersonAvatarProps) {
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) }
  const name = fullName(person)
  if (person?.avatar_url) {
    return (
      <img
        src={person.avatar_url}
        alt={hidden ? '' : name}
        aria-hidden={hidden || undefined}
        title={title ? name : undefined}
        style={style}
        className={cn('shrink-0 rounded-full object-cover', className)}
      />
    )
  }
  return (
    <span
      title={title ? name : undefined}
      aria-hidden={hidden || undefined}
      style={{ ...style, backgroundColor: avatarColor(person?.id) }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none text-white',
        className,
      )}
    >
      {initials(person)}
    </span>
  )
}
