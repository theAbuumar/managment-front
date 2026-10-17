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
  NETWORK_ERROR: () => t('Нет связи с сервером. Проверьте подключение.'),
  INVALID_CREDENTIALS: () => t('Неверный email или пароль.'),
  EMAIL_NOT_VERIFIED: () => t('Email ещё не подтверждён.'),
  ACCOUNT_DEACTIVATED: () => t('Аккаунт деактивирован.'),
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
