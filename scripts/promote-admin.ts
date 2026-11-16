/**
 * Безопасный одноразовый скрипт для назначения роли ADMIN существующему пользователю.
 *
 * Использование:
 *   npx ts-node scripts/promote-admin.ts <email>
 *
 * Требования безопасности:
 *   - Не содержит захардкоженных паролей или секретов.
 *   - Требует явной передачи email в качестве аргумента командной строки.
 *   - Изменяет только роль существующего пользователя, не создавая новые публичные эндпоинты.
 */

import { PrismaClient, Role } from "@prisma/client";

async function main() {
  const targetEmail = process.argv[2]?.trim().toLowerCase();

  if (!targetEmail) {
    console.error("ОШИБКА: Необходимо указать email существующего пользователя.");
    console.error("Использование:");
    console.error("  npx ts-node scripts/promote-admin.ts <email>");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findUnique({
      where: { email: targetEmail },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      console.error(`ОШИБКА: Пользователь с email "${targetEmail}" не найден в базе данных.`);
      console.error("Убедитесь, что аккаунт предварительно зарегистрирован через форму регистрации.");
      process.exit(1);
    }

    if (user.role === Role.ADMIN) {
      console.log(`Пользователь "${targetEmail}" уже имеет роль ADMIN.`);
      return;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: Role.ADMIN },
      select: {
        id: true,
        email: true,
        role: true,
        updatedAt: true,
      },
    });

    console.log("==================================================================");
    console.log("УСПЕХ: Пользователю успешно назначена роль ADMIN!");
    console.log(`ID: ${updated.id}`);
    console.log(`Email: ${updated.email}`);
    console.log(`Новая роль: ${updated.role}`);
    console.log(`Дата обновления: ${updated.updatedAt.toISOString()}`);
    console.log("Теперь данный пользователь имеет полный доступ к панели /admin.");
    console.log("==================================================================");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Критическая ошибка выполнения скрипта:", err?.message || err);
  process.exit(1);
});
