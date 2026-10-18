import { t } from '@/i18n'

// Backend error codes (task-management-backend/src/lib/errors.ts → ERROR_CODES)
// mapped to user-facing text. Specific codes get a precise message; generic ones
// fall back to a message per category.
const ERROR_MESSAGES: Record<string, () => string> = {
  UNAUTHORIZED: () => t('Нужно войти в систему.'),
  FORBIDDEN: () => t('Недостаточно прав для этого действия.'),
  NOT_FOUND: () => t('Объект не найден или недоступен.'),
  VALIDATION_ERROR: () => t('Проверьте введённые данные.'),
  BAD_REQUEST: () => t('Запрос не может быть выполнен.'),
  CONFLICT: () => t('Конфликт с текущими данными. Обновите страницу.'),
  GONE: () => t('Объект больше недоступен.'),
  RATE_LIMITED: () => t('Слишком много запросов. Подождите немного.'),
  INTERNAL_ERROR: () => t('Ошибка на сервере. Попробуйте позже.'),
  NETWORK_ERROR: () =>
    t(
      'Нет связи с сервером — не сохранено. Отправьте ещё раз, когда связь вернётся.',
    ),
  INVALID_CREDENTIALS: () => t('Неверный email или пароль.'),
  EMAIL_NOT_VERIFIED: () => t('Email ещё не подтверждён.'),
  ACCOUNT_DEACTIVATED: () => t('Аккаунт деактивирован.'),
  SESSION_REVOKED: () =>
    t(
      'Сеанс завершён на другом устройстве или администратором. Войдите снова.',
    ),
  NO_PASSWORD: () =>
    t('У аккаунта нет пароля — войдите через Google, GitHub или код на почту.'),
  OTP_NOT_FOUND: () => t('Код не найден. Запросите новый.'),
  OTP_INVALID: () => t('Неверный код.'),
  OTP_EXPIRED: () => t('Срок действия кода истёк. Запросите новый.'),
  OTP_TOO_MANY_ATTEMPTS: () =>
    t('Слишком много неверных попыток. Запросите новый код.'),
  OWNER_CANNOT_LEAVE: () =>
    t('Владелец не может покинуть пространство. Сначала передайте владение.'),
  ALREADY_MEMBER: () => t('Пользователь уже состоит в пространстве.'),
  INVITE_EXPIRED: () => t('Срок действия приглашения истёк.'),
  INVITE_ALREADY_ACCEPTED: () => t('Приглашение уже принято.'),
  INVITE_EMAIL_MISMATCH: () =>
    t('Приглашение отправлено на другой адрес электронной почты.'),
  DEPARTMENT_CYCLE: () =>
    t(
      'Подразделение нельзя перенести внутрь самого себя или своего дочернего подразделения.',
    ),
  // Execution control (Ф5).
  REVIEW_REQUIRED: () =>
    t(
      'Поручение нужно сдать на проверку — закрыть его может только контролёр.',
    ),
  REVIEW_PENDING: () => t('Работа уже ждёт проверки.'),
  NO_PENDING_REVIEW: () => t('Нет работы, ожидающей проверки.'),
  NO_REVIEW_STATE: () => t('В проекте нет состояния «На проверке».'),
  REPORT_REQUIRED: () => t('Для сдачи на проверку нужен текст отчёта.'),
  NOT_REVIEWER: () =>
    t(
      'Принять или вернуть работу может только контролёр (или автор поручения).',
    ),
  NOT_ASSIGNEE: () => t('Это действие доступно только исполнителю задачи.'),
  DEADLINE_CHANGE_FORBIDDEN: () =>
    t('Срок поручения меняет только контролёр — отправьте запрос на перенос.'),
  DEADLINE_REQUEST_PENDING: () =>
    t('Запрос на перенос срока уже ожидает решения.'),
  CONTROL_CHANGE_FORBIDDEN: () =>
    t(
      'Контролёра, проверку и тип поручения меняет только контролёр или администратор.',
    ),
  TELEGRAM_NOT_CONFIRMED: () => t('Подключение не подтверждено в Telegram.'),
  MEMBER_DEACTIVATED: () =>
    t(
      'Администратор отключил ваш доступ к пространству. Если это ошибка, обратитесь к администратору.',
    ),
  GUEST_READ_ONLY: () =>
    t('У вас роль «Гость»: задачи и отчёты можно только просматривать.'),
  GUEST_NOT_ASSIGNABLE: () =>
    t(
      'Гостя нельзя назначить исполнителем или контролёром — сначала смените ему роль.',
    ),
  INVALID_IMAGE: () =>
    t(
      'Файл не похож на изображение PNG, JPEG или WebP до 2 МБ. Выберите другой.',
    ),
  FILE_TYPE_NOT_ALLOWED: () =>
    t(
      'Программы и скрипты прикладывать нельзя. Приложите документ, таблицу или изображение.',
    ),
  FILE_CONTENT_MISMATCH: () =>
    t(
      'Содержимое файла не совпадает с его расширением. Приложите исходный документ.',
    ),
}

export function getFriendlyMessage(code?: string): string {
  if (!code) return t('Произошла непредвиденная ошибка.')
  return ERROR_MESSAGES[code]?.() ?? t('Произошла ошибка ({{code}}).', { code })
}

/** The message to show for any thrown value (ApiError, Error or unknown). */
export function errorText(err: unknown, fallback?: string): string {
  if (err instanceof Error && err.message) return err.message
  return fallback ?? getFriendlyMessage()
}
