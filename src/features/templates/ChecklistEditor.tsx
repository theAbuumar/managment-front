import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'

// A checklist before the issue exists (Ф6): in the create form and in a template.
// Plain texts in order; at most 100.

export function ChecklistEditor({
  value,
  onChange,
}: {
  value: string[]
  onChange: (items: string[]) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const full = value.length >= 100

  function add() {
    const v = text.trim()
    if (!v || full) return
    onChange([...value, v])
    setText('')
  }

  return (
    <div className="flex flex-col gap-1">
      {value.length > 0 && (
        <ol className="space-y-0.5">
          {value.map((item, i) => (
            <li
              key={i}
              className="group flex items-start gap-2 rounded px-1 py-0.5 hover:bg-accent/50"
            >
              <span className="mt-0.5 w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              <span className="min-w-0 flex-1 break-words text-sm">{item}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={t('Удалить пункт «{{text}}»', { text: item })}
                title={t('Удалить пункт')}
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex items-center gap-2 px-1">
        <Plus size={13} className="shrink-0 text-muted-foreground" />
        <input
          value={text}
          maxLength={500}
          disabled={full}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
          placeholder={
            full ? t('В чек-листе не больше 100 пунктов') : t('Добавить пункт…')
          }
          aria-label={t('Новый пункт чек-листа')}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  )
}
