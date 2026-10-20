import { t } from '@/i18n'
import { longDate } from '@/lib/dates'

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
    case 'issue.updated':
      switch (a.field) {
        case 'state_id':
          return t('перевёл(а) в «{{state}}»', { state: stateName(a.new_value) })
        case 'priority':
          return t('изменил(а) приоритет')
        case 'title':
          return t('переименовал(а) задачу')
        case 'description':
          return t('изменил(а) описание')
        case 'due_date':
          return a.new_value
            ? t('установил(а) срок: {{date}}', { date: longDate(a.new_value) })
            : t('убрал(а) срок')
        case 'start_date':
          return t('изменил(а) дату начала')
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
      return a.action
  }
}
