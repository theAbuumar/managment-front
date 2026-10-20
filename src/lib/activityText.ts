import { t } from '@/i18n'
import { longDate, shortDate } from '@/lib/dates'
import { PRIORITY_CONFIG } from '@/components/ui/status-badge'
import type { IssuePriorityValue } from '@/api/issue'

// One phrase per history entry — the same words in a task's history and in the
// workspace feed (7.F9): «перевёл(а) в «На проверке»», «назначил(а) исполнителя:
// Иванов И. И.». Ids in old/new values are turned into names by the caller: the
// card knows its project's states and labels, the feed gets names from the API.

export interface ActivityLike {
  action: string
  field: string | null
  old_value: string | null
  new_value: string | null
}

export interface ActivityNames {
  member: (id: string | null) => string
  label: (id: string | null) => string
  state: (id: string | null) => string
  /** Cycle and module names (4.F3, 4.F4); null when unknown (deleted). */
  cycle?: (id: string | null) => string | null
  module?: (id: string | null) => string | null
  /** Another issue as «ABC-12 Название» (relations 4.F6); null when it is not visible. */
  issue?: (id: string | null) => string | null
}

const priorityName = (v: string | null) =>
  (v && PRIORITY_CONFIG[v as IssuePriorityValue]?.label) || t('Без приоритета')

/** «10 окт. → 15 окт.» for a moved date. */
const dateMove = (from: string, to: string) => `${shortDate(from)} → ${shortDate(to)}`

// How a relation reads from the issue whose history it is in (field = its type
// there). The other issue is named when the reader can see it.
function relationText(a: ActivityLike, other: string | null): string {
  if (a.action !== 'issue.relation_added') {
    return other ? t('убрал(а) связь с задачей {{issue}}', { issue: other }) : t('убрал(а) связь с другой задачей')
  }
  switch (a.field) {
    case 'blocks':
      return other
        ? t('отметил(а), что задача блокирует {{issue}}', { issue: other })
        : t('отметил(а), что задача блокирует другую')
    case 'blocked_by':
      return other
        ? t('отметил(а), что задача ждёт {{issue}}', { issue: other })
        : t('отметил(а), что задача ждёт другую')
    case 'duplicates':
      return other ? t('отметил(а) дубликат: {{issue}}', { issue: other }) : t('отметил(а) дубликат')
    default:
      return other ? t('связал(а) с задачей {{issue}}', { issue: other }) : t('связал(а) с другой задачей')
  }
}

export function activityText(a: ActivityLike, names: ActivityNames): string {
  const { member: memberName, label: labelName, state: stateName } = names
  switch (a.action) {
    case 'issue.created':
      return t('создал(а) задачу')
    case 'issue.deleted':
      return t('удалил(а) задачу')
    case 'issue.restored':
      return t('восстановил(а) задачу из корзины')
    case 'issue.assignee_added':
      return t('назначил(а) исполнителя: {{name}}', { name: memberName(a.new_value) })
    case 'issue.assignee_removed':
      return t('снял(а) исполнителя: {{name}}', { name: memberName(a.old_value) })
    case 'issue.label_added':
      return t('добавил(а) метку «{{name}}»', { name: labelName(a.new_value) })
    case 'issue.label_removed':
      return t('убрал(а) метку «{{name}}»', { name: labelName(a.old_value) })
    case 'comment.created':
      return t('оставил(а) комментарий')
    case 'comment.updated':
      return t('изменил(а) комментарий')
    case 'comment.deleted':
      return t('удалил(а) комментарий')
    case 'issue.attachment_added':
      return t('приложил(а) файл')
    case 'issue.attachment_removed':
      return t('удалил(а) файл')
    case 'issue.review_submitted':
      return t('отправил(а) на проверку')
    case 'issue.review_approved':
      return t('принял(а) результат')
    case 'issue.review_returned':
      return t('вернул(а) на доработку')
    case 'issue.acknowledged':
      return t('ознакомился(ась) с поручением')
    case 'issue.deadline_requested':
      return t('запросил(а) перенос срока на {{date}}', {
        date: a.new_value ? longDate(a.new_value) : '—',
      })
    case 'issue.deadline_approved':
      return t('одобрил(а) перенос срока')
    case 'issue.deadline_rejected':
      return t('отклонил(а) перенос срока')
    // Checklist (6.B5): the item's text is in the value.
    case 'issue.checklist_added':
      return t('добавил(а) пункт чек-листа «{{text}}»', { text: a.new_value ?? '' })
    case 'issue.checklist_checked':
      return t('отметил(а) пункт «{{text}}»', { text: a.new_value ?? '' })
    case 'issue.checklist_unchecked':
      return t('снял(а) отметку с пункта «{{text}}»', { text: a.new_value ?? '' })
    case 'issue.checklist_updated':
      return t('переименовал(а) пункт «{{old}}» в «{{text}}»', { old: a.old_value ?? '', text: a.new_value ?? '' })
    case 'issue.checklist_removed':
      return t('удалил(а) пункт чек-листа «{{text}}»', { text: a.old_value ?? '' })
    case 'issue.module_added': {
      const name = names.module?.(a.new_value)
      return name ? t('добавил(а) в модуль «{{name}}»', { name }) : t('добавил(а) в модуль')
    }
    case 'issue.module_removed': {
      const name = names.module?.(a.old_value)
      return name ? t('убрал(а) из модуля «{{name}}»', { name }) : t('убрал(а) из модуля')
    }
    case 'issue.relation_added':
      return relationText(a, names.issue?.(a.new_value) ?? null)
    case 'issue.relation_removed':
      return relationText(a, names.issue?.(a.old_value) ?? null)
    case 'issue.updated':
      switch (a.field) {
        case 'state_id':
          return t('перевёл(а) в «{{state}}»', { state: stateName(a.new_value) })
        case 'priority':
          return t('изменил(а) приоритет: {{from}} → {{to}}', {
            from: priorityName(a.old_value),
            to: priorityName(a.new_value),
          })
        case 'title':
          return a.new_value
            ? t('переименовал(а) задачу в «{{title}}»', { title: a.new_value })
            : t('переименовал(а) задачу')
        case 'description':
          return t('изменил(а) описание')
        case 'due_date':
          if (a.new_value && a.old_value)
            return t('изменил(а) срок: {{move}}', { move: dateMove(a.old_value, a.new_value) })
          return a.new_value
            ? t('установил(а) срок: {{date}}', { date: longDate(a.new_value) })
            : t('убрал(а) срок')
        case 'start_date':
          if (a.new_value && a.old_value)
            return t('изменил(а) дату начала: {{move}}', { move: dateMove(a.old_value, a.new_value) })
          return a.new_value
            ? t('установил(а) дату начала: {{date}}', { date: longDate(a.new_value) })
            : t('убрал(а) дату начала')
        case 'cycle_id': {
          const name = names.cycle?.(a.new_value ?? a.old_value)
          if (a.new_value) return name ? t('добавил(а) в этап «{{name}}»', { name }) : t('добавил(а) в этап')
          return name ? t('убрал(а) из этапа «{{name}}»', { name }) : t('убрал(а) из этапа')
        }
        case 'parent_id': {
          const parent = names.issue?.(a.new_value)
          if (!a.new_value) return t('вынес(ла) из подзадач')
          return parent ? t('сделал(а) подзадачей {{issue}}', { issue: parent }) : t('сделал(а) подзадачей')
        }
        case 'estimate_points':
          return t('изменил(а) оценку')
        case 'kind':
          return a.new_value === 'assignment' ? t('сделал(а) поручением') : t('сделал(а) обычной задачей')
        case 'controller_id':
          return t('назначил(а) контролёра: {{name}}', { name: memberName(a.new_value) })
        case 'requires_review':
          return a.new_value === 'true' ? t('включил(а) проверку результата') : t('отключил(а) проверку результата')
        case 'basis':
          return t('изменил(а) основание')
        default:
          return t('изменил(а) задачу')
      }
    default:
      // An action this client does not know yet: still a sentence, not a code.
      return t('изменил(а) задачу')
  }
}
