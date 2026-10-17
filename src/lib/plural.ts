// Russian plural forms: 1 задача, 2 задачи, 5 задач (21 задача, 11 задач…).
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last === 1) return forms[0]
  if (last >= 2 && last <= 4) return forms[1]
  return forms[2]
}

/** "5 задач" */
export function pluralize(n: number, forms: [string, string, string]): string {
  return `${n} ${plural(n, forms)}`
}
