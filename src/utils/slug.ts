/**
 * Утилита транслитерации и генерации URL-безопасных слагов (slug)
 * с поддержкой русского и кыргызского алфавитов.
 */

const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  // Специфические символы кыргызского алфавита
  ө: "o",
  ү: "u",
  ң: "n",
};

/**
 * Преобразует произвольную строку в URL-friendly slug
 */
export function slugify(text: string): string {
  if (!text) return "";

  const lower = text.trim().toLowerCase();
  let transliterated = "";

  for (const char of lower) {
    if (char in CYRILLIC_TO_LATIN_MAP) {
      transliterated += CYRILLIC_TO_LATIN_MAP[char];
    } else {
      transliterated += char;
    }
  }

  return transliterated
    .replace(/[^a-z0-9\s-]/g, "") // Удаляем все спецсимволы кроме пробелов и дефисов
    .replace(/[\s_]+/g, "-") // Пробелы и подчёркивания заменяем на дефис
    .replace(/-+/g, "-") // Схлопываем повторяющиеся дефисы
    .replace(/^-+|-+$/g, ""); // Убираем дефисы в начале и конце
}
