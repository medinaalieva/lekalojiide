import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { slugify } from "../src/utils/slug";
import {
  CreateCategorySchema,
  CreateProductSchema,
  CatalogQuerySchema,
  BatchVariantsSchema,
  AddProductImageSchema,
} from "../src/modules/catalog/catalog.dto";
import { DifficultyLevel } from "@prisma/client";

test("Slugify: Transliterates Russian and Kyrgyz characters to clean URL slugs", () => {
  assert.equal(slugify("Платье «Zhiide Silk»"), "plate-zhiide-silk");
  assert.equal(slugify("Көйнөк үлгүсү"), "koynok-ulgusu");
  assert.equal(slugify("  Юбка-солнце 44 размер!  "), "yubka-solntse-44-razmer");
  assert.equal(slugify("Special #1 & * Design"), "special-1-design");
});

test("DTO Validation: CreateCategorySchema validates title and optional fields", () => {
  const valid = CreateCategorySchema.safeParse({
    title: "Платья",
    description: "Женские платья всех фасонов",
    displayOrder: 1,
  });
  assert.equal(valid.success, true);
  if (valid.success) {
    assert.equal(valid.data.title, "Платья");
    assert.equal(valid.data.isActive, true);
  }

  const invalid = CreateCategorySchema.safeParse({
    title: "А", // слишком короткое
  });
  assert.equal(invalid.success, false);
});

test("DTO Validation: CreateProductSchema validates basePrice, categoryId, and difficultyLevel", () => {
  const categoryId = randomUUID();
  const valid = CreateProductSchema.safeParse({
    title: "Шелковое платье",
    categoryId,
    description: "Подробное описание пошива",
    basePrice: 450,
    difficultyLevel: DifficultyLevel.INTERMEDIATE,
  });
  assert.equal(valid.success, true);

  const negativePrice = CreateProductSchema.safeParse({
    title: "Шелковое платье",
    categoryId,
    description: "Подробное описание пошива",
    basePrice: -50,
  });
  assert.equal(negativePrice.success, false);

  const invalidUuid = CreateProductSchema.safeParse({
    title: "Шелковое платье",
    categoryId: "not-a-uuid",
    description: "Подробное описание пошива",
    basePrice: 450,
  });
  assert.equal(invalidUuid.success, false);
});

test("DTO Validation: CatalogQuerySchema coerces numbers and applies defaults", () => {
  const query = CatalogQuerySchema.parse({
    page: "2",
    limit: "20",
    search: "Шелк",
    sort: "price_asc",
  });
  assert.equal(query.page, 2);
  assert.equal(query.limit, 20);
  assert.equal(query.search, "Шелк");
  assert.equal(query.sort, "price_asc");

  // Max limit boundary: max 100
  const maxLimit = CatalogQuerySchema.safeParse({
    limit: "101",
  });
  assert.equal(maxLimit.success, false);
});

test("DTO Validation: BatchVariantsSchema requires at least one size, height, and format", () => {
  const valid = BatchVariantsSchema.safeParse({
    sizeIds: [randomUUID()],
    heightIds: [randomUUID()],
    formatIds: [randomUUID()],
    priceOverride: 500,
  });
  assert.equal(valid.success, true);

  const emptySizes = BatchVariantsSchema.safeParse({
    sizeIds: [],
    heightIds: [randomUUID()],
    formatIds: [randomUUID()],
  });
  assert.equal(emptySizes.success, false);
});

test("DTO Validation: AddProductImageSchema validates URL", () => {
  const valid = AddProductImageSchema.safeParse({
    imageUrl: "https://cdn.example.kg/dress-1.webp",
    altText: "Вид спереди",
    isCover: true,
  });
  assert.equal(valid.success, true);

  const invalidUrl = AddProductImageSchema.safeParse({
    imageUrl: "not-a-valid-url",
  });
  assert.equal(invalidUrl.success, false);
});
