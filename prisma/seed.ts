import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Начальное наполнение базовых справочников системы LEKALO ZHIIDE.
 * Данные строго соответствуют документации DATABASE_SCHEMA.md и OPEN_QUESTIONS.md.
 */
async function main() {
  console.log("--- Наполнение справочников LEKALO ZHIIDE ---");

  // 1. Справочник размеров (Sizes)
  const sizes = [
    { code: "40", label: "40 (ОГ 80, ОБ 86)", displayOrder: 1 },
    { code: "42", label: "42 (ОГ 84, ОБ 90)", displayOrder: 2 },
    { code: "44", label: "44 (ОГ 88, ОБ 94)", displayOrder: 3 },
    { code: "46", label: "46 (ОГ 92, ОБ 98)", displayOrder: 4 },
    { code: "48", label: "48 (ОГ 96, ОБ 102)", displayOrder: 5 },
    { code: "50", label: "50 (ОГ 100, ОБ 106)", displayOrder: 6 },
    { code: "52", label: "52 (ОГ 104, ОБ 110)", displayOrder: 7 },
    { code: "54", label: "54 (ОГ 108, ОБ 114)", displayOrder: 8 },
  ];

  console.log(`Наполнение Sizes: ${sizes.length} позиций...`);
  for (const s of sizes) {
    await prisma.size.upsert({
      where: { code: s.code },
      update: { label: s.label, displayOrder: s.displayOrder },
      create: { code: s.code, label: s.label, displayOrder: s.displayOrder },
    });
  }

  // 2. Справочник ростовок (Heights)
  const heights = [
    { code: "158-164", label: "158-164 см", displayOrder: 1 },
    { code: "164-170", label: "164-170 см", displayOrder: 2 },
    { code: "170-176", label: "170-176 см", displayOrder: 3 },
  ];

  console.log(`Наполнение Heights: ${heights.length} позиций...`);
  for (const h of heights) {
    await prisma.height.upsert({
      where: { code: h.code },
      update: { label: h.label, displayOrder: h.displayOrder },
      create: { code: h.code, label: h.label, displayOrder: h.displayOrder },
    });
  }

  // 3. Справочник форматов печати (Formats)
  const formats = [
    {
      code: "A4",
      label: "А4 (принтер)",
      description: "Печать на бытовом принтере (разбивка на листы А4 с полями для склейки)",
      displayOrder: 1,
    },
    {
      code: "PLOTTER_900",
      label: "Плоттер 900 мм",
      description: "Широкоформатная непрерывная печать на рулоне шириной 900 мм",
      displayOrder: 2,
    },
    {
      code: "LETTER",
      label: "US Letter",
      description: "Печать на листах формата Letter (8.5 x 11 дюймов)",
      displayOrder: 3,
    },
  ];

  console.log(`Наполнение Formats: ${formats.length} позиций...`);
  for (const f of formats) {
    await prisma.format.upsert({
      where: { code: f.code },
      update: { label: f.label, description: f.description, displayOrder: f.displayOrder },
      create: { code: f.code, label: f.label, description: f.description, displayOrder: f.displayOrder },
    });
  }

  console.log("--- Наполнение базовых справочников успешно завершено ---");
}

main()
  .catch((e) => {
    console.error("Ошибка при выполнении сидирования:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
