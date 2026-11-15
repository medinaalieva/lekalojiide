import { TooManyRequestsError } from "./errors";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

/**
 * Локальный легковесный Rate Limiter для защиты от подбора паролей и brute-force атак
 * без необходимости подключения Redis на этапе MVP.
 * Защищен от утечек памяти, DoS-атак переполнения карты и попыток сброса блокировки:
 * - Максимальная емкость жестко ограничена (Bounded Capacity);
 * - Активно заблокированные записи защищены от вытеснения, что исключает обход бана через спам новыми ключами.
 */
export class InMemoryRateLimiter {
  private records = new Map<string, RateLimitRecord>();

  constructor(
    private readonly windowMs: number = 15 * 60 * 1000, // 15 минут
    private readonly maxAttempts: number = 5,            // максимум 5 попыток
    private readonly maxEntries: number = 10_000,        // жесткий лимит записей для предотвращения утечек памяти
    private readonly errorCode: string = "BRUTE_FORCE_PROTECTION",
    private readonly customMessage?: string
  ) {}

  /**
   * Текущее количество активных записей в памяти
   */
  get size(): number {
    return this.records.size;
  }

  /**
   * Проверка лимита перед выполнением действия
   */
  check(key: string): void {
    const now = Date.now();
    const record = this.records.get(key);

    if (!record) {
      return;
    }

    if (now > record.resetAt) {
      this.records.delete(key);
      return;
    }

    if (record.count >= this.maxAttempts) {
      const waitMinutes = Math.ceil((record.resetAt - now) / 60000);
      throw new TooManyRequestsError(
        this.errorCode,
        this.customMessage || `Превышен лимит попыток входа. Повторите попытку через ${waitMinutes} мин.`
      );
    }
  }

  /**
   * Учет неудачной попытки входа с защитой от обхода блокировки через переполнение
   */
  increment(key: string): void {
    const now = Date.now();
    const record = this.records.get(key);

    if (!record || now > record.resetAt) {
      if (this.records.size >= this.maxEntries) {
        this.cleanup();

        if (this.records.size >= this.maxEntries) {
          const evicted = this.evictOne(now);
          if (!evicted) {
            // Все слоты заняты действующими блокировками: защищенные записи не вытесняются
            return;
          }
        }
      }

      this.records.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      record.count += 1;
    }
  }

  /**
   * Сброс счетчика при успешной авторизации
   */
  reset(key: string): void {
    this.records.delete(key);
  }

  /**
   * Очистка устаревших записей (для предотвращения утечек памяти)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now > record.resetAt) {
        this.records.delete(key);
      }
    }
  }

  /**
   * Защищенное вытеснение одной записи:
   * 1. Сначала удаляются устаревшие записи.
   * 2. Если таковых нет, вытесняются незаблокированные записи (count < maxAttempts).
   * 3. Действующие блокировки (count >= maxAttempts) защищены от вытеснения.
   */
  private evictOne(now: number): boolean {
    // 1. Поиск устаревшей записи
    for (const [k, r] of this.records.entries()) {
      if (now > r.resetAt) {
        this.records.delete(k);
        return true;
      }
    }

    // 2. Поиск незаблокированной записи
    for (const [k, r] of this.records.entries()) {
      if (r.count < this.maxAttempts) {
        this.records.delete(k);
        return true;
      }
    }

    // 3. Все записи заблокированы — защита от обхода
    return false;
  }
}
