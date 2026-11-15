import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AddToCartSchema, UpdateCartItemSchema } from "../src/modules/cart/cart.dto";
import { CheckoutDtoSchema, OrderQuerySchema } from "../src/modules/orders/orders.dto";
import { OrderStatus } from "@prisma/client";

test("Cart DTO: AddToCartSchema validates variantId and optional productId", () => {
  const valid = AddToCartSchema.safeParse({
    variantId: randomUUID(),
  });
  assert.equal(valid.success, true);

  const validWithProduct = AddToCartSchema.safeParse({
    variantId: randomUUID(),
    productId: randomUUID(),
  });
  assert.equal(validWithProduct.success, true);

  const invalid = AddToCartSchema.safeParse({
    variantId: "not-a-uuid",
  });
  assert.equal(invalid.success, false);
});

test("Cart DTO: UpdateCartItemSchema requires valid newVariantId UUID", () => {
  const valid = UpdateCartItemSchema.safeParse({
    newVariantId: randomUUID(),
  });
  assert.equal(valid.success, true);

  const invalid = UpdateCartItemSchema.safeParse({
    newVariantId: "invalid-uuid",
  });
  assert.equal(invalid.success, false);
});

test("Orders DTO: CheckoutDtoSchema validates contact fields", () => {
  const validEmpty = CheckoutDtoSchema.safeParse({});
  assert.equal(validEmpty.success, true);

  const validFull = CheckoutDtoSchema.safeParse({
    customerName: "Айгерим Алиева",
    customerEmail: "aigerim@example.kg",
    customerPhone: "+996555123456",
  });
  assert.equal(validFull.success, true);

  const invalidEmail = CheckoutDtoSchema.safeParse({
    customerEmail: "not-an-email",
  });
  assert.equal(invalidEmail.success, false);

  const shortName = CheckoutDtoSchema.safeParse({
    customerName: "А",
  });
  assert.equal(shortName.success, false);
});

test("Orders DTO: OrderQuerySchema coerces numbers and validates enum", () => {
  const parsed = OrderQuerySchema.parse({
    page: "3",
    limit: "15",
    status: OrderStatus.PENDING,
    customerEmail: "user@example.kg",
  });
  assert.equal(parsed.page, 3);
  assert.equal(parsed.limit, 15);
  assert.equal(parsed.status, OrderStatus.PENDING);
  assert.equal(parsed.customerEmail, "user@example.kg");

  // Max limit boundary: max 50
  const overLimit = OrderQuerySchema.safeParse({
    limit: "100",
  });
  assert.equal(overLimit.success, false);
});

test("Price Calculation: Accurately computes totals and rounds floating point numbers in KGS", () => {
  // Проверка сложения дробных сумм в KGS (например, 450.40 + 320.70 = 771.10)
  const items = [
    { price: 450.4 },
    { price: 320.7 },
    { price: 199.99 },
  ];
  const rawSum = items.reduce((acc, it) => acc + it.price, 0);
  const rounded = Math.round(rawSum * 100) / 100;

  assert.equal(rounded, 971.09);
  assert.notEqual(rawSum.toString(), "971.09"); // Из-за погрешности IEEE 754 rawSum = 971.0900000000001
});
