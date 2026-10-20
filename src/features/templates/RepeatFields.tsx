import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/plural'
import type { Schedule } from '@/api/recurring'
import { FREQUENCIES, MONTHS, WEEKDAYS, describeSchedule } from './recurrence'

// The schedule of a recurring rule (Ф6 6.F4): frequency, interval, days, time and
// an optional end date — in the create form («Повторять») and in the rule editor.

const fieldCls =
  'h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring'

export function RepeatFields({
  value,
  onChange,
  next,
}: {
  value: Schedule
  onChange: (s: Schedule) => void
  /** The next run, already worded («следующая — 1 ноября 2026»). */
  next?: string
}) {
  const { t } = useTranslation()
  const set = (patch: Partial<Schedule>) => onChange({ ...value, ...patch })
  const monthly = value.frequency !== 'daily' && value.frequency !== 'weekly'
  // «Раз в 2 недели»: the unit after the number, in its case.
  const units: Record<Schedule['frequency'], [string, string, string]> = {
    daily: [t('день'), t('дня'), t('дней')],
    weekly: [t('неделю'), t('недели'), t('недель')],
    monthly: [t('месяц'), t('месяца'), t('месяцев')],
    quarterly: [t('квартал'), t('квартала'), t('кварталов')],
    yearly: [t('год'), t('года'), t('лет')],
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="flex flex-wrap gap-1"
        role="radiogroup"
        aria-label={t('Как часто')}
      >
        {FREQUENCIES.map((f) => (
          <button
            key={f.key}
            type="button"
            role="radio"
            aria-checked={value.frequency === f.key}
            onClick={() => set({ frequency: f.key })}
            className={cn(
              'rounded-md border px-2 py-1 text-xs transition-colors',
              value.frequency === f.key
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'border-border text-muted-foreground hover:bg-accent',
            )}
          >
            {f.label()}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <label className="flex items-center gap-1.5 text-muted-foreground">
          {t('Раз в')}
          <input
            type="number"
            min={1}
            max={52}
            value={value.interval}
            onChange={(e) =>
              set({
                interval: Math.min(
                  52,
                  Math.max(1, Number(e.target.value) || 1),
                ),
              })
            }
            className={cn(fieldCls, 'w-14')}
            aria-label={t('Интервал')}
          />
          {plural(value.interval, units[value.frequency])}
        </label>
        {monthly && (
          <label className="flex items-center gap-1.5 text-muted-foreground">
            {value.frequency === 'yearly' ? t('Дата') : t('Число месяца')}
            <input
              type="number"
              min={1}
              max={31}
              value={value.by_monthday ?? 1}
              onChange={(e) =>
                set({
                  by_monthday: Math.min(
                    31,
                    Math.max(1, Number(e.target.value) || 1),
                  ),
                })
              }
              className={cn(fieldCls, 'w-14')}
              aria-label={t('Число месяца')}
            />
          </label>
        )}
        {value.frequency === 'yearly' && (
          <select
            value={value.by_month ?? 1}
            onChange={(e) => set({ by_month: Number(e.target.value) })}
            className={cn(fieldCls, 'bg-background')}
            aria-label={t('Месяц')}
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>
                {m()}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-muted-foreground">
          {t('в')}
          <input
            type="time"
            value={value.time}
            onChange={(e) => e.target.value && set({ time: e.target.value })}
            className={fieldCls}
            aria-label={t('Время')}
          />
        </label>
        <label className="flex items-center gap-1.5 text-muted-foreground">
          {t('до')}
          <input
            type="date"
            value={value.until ?? ''}
            min={value.start_date}
            onChange={(e) => set({ until: e.target.value || null })}
            className={fieldCls}
            aria-label={t('Повторять до')}
          />
        </label>
      </div>

      {value.frequency === 'weekly' && (
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label={t('Дни недели')}
        >
          {WEEKDAYS.map((d) => {
            const on = value.by_weekday.includes(d.day)
            return (
              <button
                key={d.day}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const days = on
                    ? value.by_weekday.filter((x) => x !== d.day)
                    : [...value.by_weekday, d.day]
                  // At least one day stays chosen.
                  if (days.length) set({ by_weekday: days.sort() })
                }}
                className={cn(
                  'size-8 rounded-full border text-xs transition-colors',
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent',
                )}
              >
                {d.short()}
              </button>
            )
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {describeSchedule(value)}
        {next && ` · ${next}`}
      </p>
    </div>
  )
}
