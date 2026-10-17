// Cyrillic → Latin (simplified passport-style) so Russian names produce readable
// URL slugs and project keys: «Учебный отдел» → "uchebnyy-otdel".
const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // Uzbek/Kazakh/Tajik letters that show up in university names.
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h', ә: 'a', ө: 'o', ү: 'u', ұ: 'u', ң: 'ng',
  һ: 'h', і: 'i', ӣ: 'i', ӯ: 'u', ҷ: 'j',
}

export function transliterate(text: string): string {
  return [...text.toLowerCase()].map((ch) => MAP[ch] ?? ch).join('')
}

/** «Ректорат НИУ» → "rektorat-niu" (lowercase, digits, single hyphens). */
export function toSlug(text: string, max = 50): string {
  return transliterate(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
}
