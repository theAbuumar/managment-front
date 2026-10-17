import {
  AlarmClock,
  AtSign,
  Bell,
  CalendarClock,
  CircleCheck,
  Eye,
  FileBarChart,
  Flame,
  Hourglass,
  Mail,
  MessageSquare,
  RefreshCw,
  Siren,
  Undo2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import type { AppNotification, NotificationType } from '@/api/notification'
import { shortDate } from '@/lib/dates'
import { t as translate } from '@/i18n'

// How each notification type of ADR-020 reads in Russian, with its icon and
// colour (the notifications page and the home page share it).

export type Tone = 'blue' | 'violet' | 'green' | 'amber' | 'red' | 'gray'

export interface TypeMeta {
  icon: LucideIcon
  tone: Tone
  /** System events (reminders) have a stand-in actor, so no name is shown. */
  system?: boolean
  text: (n: AppNotification, name: string) => string
}

export const TONES: Record<Tone, string> = {
  blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  red: 'bg-red-500/15 text-red-600 dark:text-red-400',
  gray: 'bg-muted text-muted-foreground',
}

const isAssignment = (n: AppNotification) => n.issue?.kind === 'assignment'

export const TYPE_META: Record<NotificationType, TypeMeta> = {
  issue_assigned: {
    icon: UserPlus,
    tone: 'blue',
    text: (n, name) =>
      isAssignment(n)
        ? translate('{{name}} поручил(а) вам', { name })
        : translate('{{name}} назначил(а) вам задачу', { name }),
  },
  comment_added: {
    icon: MessageSquare,
    tone: 'gray',
    text: (_, name) => translate('{{name}} оставил(а) комментарий', { name }),
  },
  mentioned: {
    icon: AtSign,
    tone: 'blue',
    text: (_, name) =>
      translate('{{name}} упомянул(а) вас в комментарии', { name }),
  },
  state_changed: {
    icon: RefreshCw,
    tone: 'gray',
    text: (_, name) => translate('{{name}} изменил(а) статус', { name }),
  },
  review_requested: {
    icon: Hourglass,
    tone: 'violet',
    text: (_, name) =>
      translate('{{name}} сдал(а) работу на проверку', { name }),
  },
  review_approved: {
    icon: CircleCheck,
    tone: 'green',
    text: (_, name) => translate('{{name}} принял(а) вашу работу', { name }),
  },
  review_returned: {
    icon: Undo2,
    tone: 'amber',
    text: (_, name) =>
      translate('{{name}} вернул(а) работу на доработку', { name }),
  },
  acknowledged: {
    icon: Eye,
    tone: 'green',
    text: (_, name) =>
      translate('{{name}} ознакомился(-ась) с поручением', { name }),
  },
  due_soon: {
    icon: AlarmClock,
    tone: 'amber',
    system: true,
    text: (n) =>
      n.issue?.due_date
        ? translate('Приближается срок — {{date}}', {
            date: shortDate(n.issue.due_date),
          })
        : translate('Приближается срок'),
  },
  overdue: {
    icon: Flame,
    tone: 'red',
    system: true,
    text: () => translate('Срок истёк — задача просрочена'),
  },
  escalated: {
    icon: Siren,
    tone: 'red',
    system: true,
    text: () => translate('Эскалация: поручение долго остаётся просроченным'),
  },
  deadline_change_requested: {
    icon: CalendarClock,
    tone: 'violet',
    text: (_, name) => translate('{{name}} просит перенести срок', { name }),
  },
  deadline_change_decided: {
    icon: CalendarClock,
    tone: 'blue',
    text: (n, name) =>
      !n.details
        ? translate('{{name}} рассмотрел(а) запрос на перенос срока', { name })
        : n.details.approved
          ? translate('{{name}} одобрил(а) перенос срока на {{date}}', {
              name,
              date: shortDate(n.details.new_due_date),
            })
          : translate('{{name}} отклонил(а) перенос срока', { name }),
  },
  invite_received: {
    icon: Mail,
    tone: 'blue',
    text: (_, name) =>
      translate('{{name}} пригласил(а) вас в пространство', { name }),
  },
  report_ready: {
    icon: FileBarChart,
    tone: 'green',
    system: true,
    text: () => translate('Отчёт сформирован'),
  },
  digest: {
    icon: Bell,
    tone: 'gray',
    system: true,
    text: () => translate('Сводка по вашим задачам'),
  },
}
