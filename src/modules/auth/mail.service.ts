/**
 * Интерфейс сервиса отправки электронных писем
 */
export interface IMailService {
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
}

/**
 * Локальный сервис отправки писем для режима разработки и тестирования.
 * Безопасен: в production-окружении маскирует email и не выводит секретные токены/ссылки.
 */
export class ConsoleMailService implements IMailService {
  // Для тестирования сценариев сохраняем последнюю отправленную ссылку в памяти
  private lastSentLinks = new Map<string, string>();

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    this.lastSentLinks.set(to.toLowerCase(), resetUrl);

    if (process.env.NODE_ENV === "production") {
      console.log(`[MAIL] Password reset email queued for ${this.maskEmail(to)}`);
    } else {
      console.log(`[MAIL DEV] Password reset link for ${to}: ${resetUrl}`);
    }
  }

  /**
   * Получение последней сгенерированной ссылки (для верификации в E2E-тестах)
   */
  getLastResetUrl(to: string): string | undefined {
    return this.lastSentLinks.get(to.toLowerCase());
  }

  /**
   * Маскирование адреса электронной почты для защиты приватности
   */
  private maskEmail(email: string): string {
    const [name, domain] = email.split("@");
    if (!name || !domain) return "***@***";
    const maskedName = name.length > 2 ? `${name[0]}***${name.slice(-1)}` : `${name[0]}***`;
    return `${maskedName}@${domain}`;
  }
}
