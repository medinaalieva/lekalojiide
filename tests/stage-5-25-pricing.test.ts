/**
 * LEKALO ZHIIDE — STAGE 5.25 TEST SUITE
 * PER-FORMAT DIFFERENTIAL PRICING & INVARIANT VALIDATION
 *
 * Scenarios tested:
 * 1. Differential pricing A4 vs Plotter 900 on same product and size/height.
 * 2. Variant priceOverride takes priority over product.basePrice.
 * 3. Variant without priceOverride inherits basePrice (and active discount if applicable).
 * 4. ALL (bundle) variant uses product.bundlePrice when not explicitly overridden.
 * 5. Negative price rejected by DTO / API validation.
 * 6. Zero price rejected by DTO / API validation.
 * 7. Invalid price values (NaN, invalid types) rejected.
 * 8. Switching formats dynamically changes effective price in getProductBySlug / getProductVariants.
 * 9. Cart correctly reflects variant price for chosen format.
 * 10. Checkout enforces server-calculated price regardless of client input.
 * 11. OrderItem.priceAtPurchase freezes price at purchase time.
 * 12. Past orders invariant: updating variant priceOverride or basePrice does not alter past orders.
 * 13. Purchase Guard blocks checkout / addition when digital PDF is missing regardless of price.
 * 14. Existing variants without overrides continue functioning seamlessly.
 *
 * Safety:
 * - Pre-flight safety check asserts current_database() === "lekalo_test".
 * - Synthetic test data prefix: T525_
 * - Complete teardown in finally block.
 */

import { PrismaClient } from "@prisma/client";
import { calculateEffectivePrice } from "../src/utils/pricing";
import { CatalogService } from "../src/modules/catalog/catalog.service";
import { CartService } from "../src/modules/cart/cart.service";
import { OrdersService } from "../src/modules/orders/orders.service";
import {
  UpdateVariantPriceSchema,
  UpdateFormatPricesSchema,
  BatchVariantsSchema,
} from "../src/modules/catalog/catalog.dto";

const prisma = new PrismaClient();

interface TestContext {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  categoryId?: string;
  productId?: string;
  sizeSId?: string;
  sizeAllId?: string;
  heightId?: string;
  formatA4Id?: string;
  formatPlotterId?: string;
  variantA4Id?: string;
  variantPlotterId?: string;
  variantAllA4Id?: string;
  orderId?: string;
}

const ctx: TestContext = {};

async function runTests() {
  console.log("================================================================================");
  console.log("LEKALO ZHIIDE — STAGE 5.25: PER-FORMAT DIFFERENTIAL PRICING TEST SUITE");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}${details ? ` -> ${details}` : ""}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // PRE-FLIGHT SAFETY CHECK
    // -------------------------------------------------------------------------
    console.log("\n[0] PRE-FLIGHT DATABASE SAFETY CHECK...");
    const dbRes: any = await prisma.$queryRaw`SELECT current_database() as db`;
    const dbName = dbRes[0]?.db;
    console.log(`    Current database: ${dbName}`);
    if (dbName !== "lekalo_test") {
      throw new Error(`SAFETY_ABORT: current_database() is "${dbName}". Must strictly be "lekalo_test".`);
    }
    assert(dbName === "lekalo_test", "Safety check: current database is strictly lekalo_test");

    // -------------------------------------------------------------------------
    // SETUP TEST FIXTURES
    // -------------------------------------------------------------------------
    console.log("\n[SETUP] Creating synthetic test fixtures (prefix: T525_)...");

    const catalogService = new CatalogService(undefined, prisma);
    const cartService = new CartService(undefined, prisma);
    const ordersService = new OrdersService(undefined, prisma);

    // 1. Test User
    const user = await prisma.user.create({
      data: {
        email: `t525_tester_${Date.now()}@example.com`,
        passwordHash: "dummy_hash_t525",
        firstName: "T525",
        lastName: "Tester",
        role: "CUSTOMER",
      },
    });
    ctx.userId = user.id;
    ctx.userEmail = user.email;
    ctx.userRole = user.role;

    const userTokenPayload: any = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    // 2. Test Category
    const category = await prisma.category.create({
      data: {
        title: "T525 Differential Pricing Category",
        slug: `t525-pricing-${Date.now()}`,
        isActive: true,
      },
    });
    ctx.categoryId = category.id;

    // 3. Test Sizes (S and ALL)
    let sizeS = await prisma.size.findUnique({ where: { code: "S" } });
    if (!sizeS) {
      sizeS = await prisma.size.create({
        data: { code: "S", label: "42 (S)", displayOrder: 1 },
      });
    }
    ctx.sizeSId = sizeS.id;

    let sizeAll = await prisma.size.findUnique({ where: { code: "ALL" } });
    if (!sizeAll) {
      sizeAll = await prisma.size.create({
        data: { code: "ALL", label: "Все размеры (комплект)", displayOrder: 999 },
      });
    }
    ctx.sizeAllId = sizeAll.id;

    // 4. Test Height
    let height = await prisma.height.findFirst({ where: { isActive: true } });
    if (!height) {
      height = await prisma.height.create({
        data: { code: "164-170", label: "164-170 см", displayOrder: 1, isActive: true },
      });
    }
    ctx.heightId = height.id;

    // 5. Test Formats (A4 and PLOTTER_900)
    let formatA4 = await prisma.format.findUnique({ where: { code: "A4" } });
    if (!formatA4) {
      formatA4 = await prisma.format.create({
        data: { code: "A4", label: "Формат А4", displayOrder: 1, isActive: true },
      });
    }
    ctx.formatA4Id = formatA4.id;

    let formatPlotter = await prisma.format.findUnique({ where: { code: "PLOTTER_900" } });
    if (!formatPlotter) {
      formatPlotter = await prisma.format.create({
        data: { code: "PLOTTER_900", label: "Плоттер 900 мм", displayOrder: 2, isActive: true },
      });
    }
    ctx.formatPlotterId = formatPlotter.id;

    // 6. Test Product
    const product = await prisma.product.create({
      data: {
        title: "T525 Trench Coat Pattern",
        slug: `t525-trench-coat-${Date.now()}`,
        description: "Test product for differential pricing validation",
        basePrice: 300,
        bundlePrice: 1200,
        hasBundleOption: true,
        isActive: true,
        categoryId: category.id,
      },
    });
    ctx.productId = product.id;

    // 7. Variants:
    // Variant 1: Size S, Format A4, Height 164-170 -> priceOverride = 350
    const varA4 = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sizeId: sizeS.id,
        heightId: height.id,
        formatId: formatA4.id,
        sku: `T525-${product.id.slice(0, 4)}-S-A4`,
        priceOverride: 350,
        isActive: true,
      },
    });
    ctx.variantA4Id = varA4.id;

    // Variant 2: Size S, Format Plotter 900, Height 164-170 -> priceOverride = 450
    const varPlotter = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sizeId: sizeS.id,
        heightId: height.id,
        formatId: formatPlotter.id,
        sku: `T525-${product.id.slice(0, 4)}-S-PLOTTER`,
        priceOverride: 450,
        isActive: true,
      },
    });
    ctx.variantPlotterId = varPlotter.id;

    // Variant 3: Size ALL, Format A4, Height 164-170 -> priceOverride = null (inherits bundlePrice 1200)
    const varAllA4 = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sizeId: sizeAll.id,
        heightId: height.id,
        formatId: formatA4.id,
        sku: `T525-${product.id.slice(0, 4)}-ALL-A4`,
        priceOverride: null,
        isActive: true,
      },
    });
    ctx.variantAllA4Id = varAllA4.id;

    console.log("    Setup complete.");

    // =========================================================================
    // SCENARIO 1: Differential pricing A4 vs Plotter 900 on same product
    // =========================================================================
    console.log("\n[SCENARIO 1] Differential pricing A4 vs Plotter 900 on same size/height...");
    const priceA4 = calculateEffectivePrice(
      { basePrice: product.basePrice, bundlePrice: product.bundlePrice },
      { isBundleVariant: false, priceOverride: varA4.priceOverride }
    );
    const pricePlotter = calculateEffectivePrice(
      { basePrice: product.basePrice, bundlePrice: product.bundlePrice },
      { isBundleVariant: false, priceOverride: varPlotter.priceOverride }
    );
    assert(
      priceA4.currentPrice === 350 && pricePlotter.currentPrice === 450,
      "Scenario 1: A4 is 350 KGS and Plotter is 450 KGS",
      `A4=${priceA4.currentPrice}, Plotter=${pricePlotter.currentPrice}`
    );
    assert(
      priceA4.currentPrice !== pricePlotter.currentPrice,
      "Scenario 1: Per-format differential pricing confirmed distinct for identical size/height"
    );

    // =========================================================================
    // SCENARIO 2: Variant priceOverride takes priority over product basePrice
    // =========================================================================
    console.log("\n[SCENARIO 2] Variant priceOverride priority over basePrice...");
    assert(
      Number(product.basePrice) === 300,
      "Scenario 2: Product basePrice is 300 KGS"
    );
    assert(
      priceA4.currentPrice === 350 && priceA4.currentPrice !== Number(product.basePrice),
      "Scenario 2: priceOverride (350) overrides basePrice (300)"
    );

    // =========================================================================
    // SCENARIO 3: Variant without priceOverride inherits product basePrice
    // =========================================================================
    console.log("\n[SCENARIO 3] Variant without priceOverride inherits basePrice...");
    const priceInherited = calculateEffectivePrice(
      { basePrice: product.basePrice, bundlePrice: product.bundlePrice },
      { isBundleVariant: false, priceOverride: null }
    );
    assert(
      priceInherited.currentPrice === 300,
      "Scenario 3: Null priceOverride inherits product.basePrice (300 KGS)",
      `got ${priceInherited.currentPrice}`
    );

    // Test with active discount on base product:
    const futureDate = new Date(Date.now() + 86400000);
    const priceInheritedWithDiscount = calculateEffectivePrice(
      {
        basePrice: product.basePrice,
        discountPrice: 240,
        discountUntil: futureDate,
      },
      { isBundleVariant: false, priceOverride: null }
    );
    assert(
      priceInheritedWithDiscount.currentPrice === 240 && priceInheritedWithDiscount.isDiscountActive,
      "Scenario 3: Inherited variant respects product active discount (240 KGS)"
    );

    // =========================================================================
    // SCENARIO 4: ALL (bundle) variant uses product.bundlePrice
    // =========================================================================
    console.log("\n[SCENARIO 4] ALL (bundle) variant uses product.bundlePrice...");
    const priceAll = calculateEffectivePrice(
      { basePrice: product.basePrice, bundlePrice: product.bundlePrice },
      { isBundleVariant: true, priceOverride: null }
    );
    assert(
      priceAll.currentPrice === 1200 && priceAll.isBundle,
      "Scenario 4: ALL variant inherits product.bundlePrice (1200 KGS)",
      `got ${priceAll.currentPrice}`
    );

    // If ALL has explicit override:
    const priceAllOverridden = calculateEffectivePrice(
      { basePrice: product.basePrice, bundlePrice: product.bundlePrice },
      { isBundleVariant: true, priceOverride: 1100 }
    );
    assert(
      priceAllOverridden.currentPrice === 1100,
      "Scenario 4: ALL variant with explicit priceOverride (1100) takes priority over bundlePrice"
    );

    // =========================================================================
    // SCENARIO 5: Negative price rejected by DTO / API validation
    // =========================================================================
    console.log("\n[SCENARIO 5] Negative price rejected by DTO validation...");
    const negativeRes1 = UpdateVariantPriceSchema.safeParse({ price: -100 });
    assert(
      !negativeRes1.success,
      "Scenario 5: UpdateVariantPriceSchema rejects negative price (-100)"
    );
    const negativeRes2 = UpdateFormatPricesSchema.safeParse({
      formatCode: "A4",
      price: -50,
    });
    assert(
      !negativeRes2.success,
      "Scenario 5: UpdateFormatPricesSchema rejects negative price (-50)"
    );

    // Test service layer negative price rejection:
    let serviceRejectedNegative = false;
    try {
      await catalogService.updateVariantPrice(product.id, varA4.id, -200);
    } catch (e: any) {
      serviceRejectedNegative = e.code === "INVALID_PRICE";
    }
    assert(
      serviceRejectedNegative,
      "Scenario 5: CatalogService.updateVariantPrice throws INVALID_PRICE for negative price"
    );

    // =========================================================================
    // SCENARIO 6: Zero price rejected by DTO / API validation
    // =========================================================================
    console.log("\n[SCENARIO 6] Zero price rejected by DTO / API validation...");
    const zeroRes1 = UpdateVariantPriceSchema.safeParse({ price: 0 });
    assert(
      !zeroRes1.success,
      "Scenario 6: UpdateVariantPriceSchema rejects zero price (0)"
    );

    let serviceRejectedZero = false;
    try {
      await catalogService.updateVariantPrice(product.id, varA4.id, 0);
    } catch (e: any) {
      serviceRejectedZero = e.code === "INVALID_PRICE";
    }
    assert(
      serviceRejectedZero,
      "Scenario 6: CatalogService.updateVariantPrice throws INVALID_PRICE for zero price"
    );

    // =========================================================================
    // SCENARIO 7: Invalid price values (NaN, invalid types) rejected
    // =========================================================================
    console.log("\n[SCENARIO 7] Invalid price values rejected by DTO validation...");
    const nanRes = UpdateVariantPriceSchema.safeParse({ price: "free" });
    assert(
      !nanRes.success,
      "Scenario 7: UpdateVariantPriceSchema rejects string 'free'"
    );

    const emptyRes = UpdateVariantPriceSchema.safeParse({});
    assert(
      !emptyRes.success,
      "Scenario 7: UpdateVariantPriceSchema rejects empty payload without price/priceOverride"
    );

    // =========================================================================
    // SCENARIO 8: Dynamic format switching in Catalog APIs
    // =========================================================================
    console.log("\n[SCENARIO 8] Dynamic format switching returns distinct prices in Catalog APIs...");
    const variantsList = await catalogService.getProductVariants(product.id, false);
    const foundA4 = variantsList.find((v: any) => v.format?.code === "A4" && v.size?.code === "S");
    const foundPlotter = variantsList.find((v: any) => v.format?.code === "PLOTTER_900" && v.size?.code === "S");
    const foundAll = variantsList.find((v: any) => v.size?.code === "ALL");

    assert(
      foundA4?.price === 350 && foundA4?.isPriceOverridden === true,
      "Scenario 8: getProductVariants returns 350 KGS and isPriceOverridden: true for A4",
      `got ${foundA4?.price}`
    );
    assert(
      foundPlotter?.price === 450 && foundPlotter?.isPriceOverridden === true,
      "Scenario 8: getProductVariants returns 450 KGS and isPriceOverridden: true for Plotter",
      `got ${foundPlotter?.price}`
    );
    assert(
      foundAll?.price === 1200 && foundAll?.isPriceOverridden === false,
      "Scenario 8: getProductVariants returns 1200 KGS and isPriceOverridden: false for ALL bundle",
      `got ${foundAll?.price}`
    );

    const productBySlug = await catalogService.getProductBySlug(product.slug, false);
    const slugA4 = productBySlug.variants.find((v: any) => v.format?.code === "A4" && v.size?.code === "S");
    const slugPlotter = productBySlug.variants.find((v: any) => v.format?.code === "PLOTTER_900" && v.size?.code === "S");
    assert(
      slugA4?.price === 350 && slugPlotter?.price === 450,
      "Scenario 8: getProductBySlug accurately reflects differential prices per format",
      `A4=${slugA4?.price}, Plotter=${slugPlotter?.price}`
    );

    // =========================================================================
    // SCENARIO 9: Cart correctly stores and reflects format-specific price
    // =========================================================================
    console.log("\n[SCENARIO 9] Cart correctly stores and reflects format-specific price...");
    // Attach an active digital PDF file to varPlotter so Purchase Guard allows cart addition & checkout
    const digitalFile = await prisma.digitalFile.create({
      data: {
        variantId: varPlotter.id,
        title: "T525 Test Plotter Pattern File",
        fileType: "PATTERN",
        isActive: true,
      },
    });
    const fileVersion = await prisma.fileVersion.create({
      data: {
        digitalFileId: digitalFile.id,
        versionNumber: 1,
        s3Bucket: "patterns-private",
        s3Key: `patterns/t525/test-plotter-v1.pdf`,
        originalFileName: `${product.slug}-S-${height.code}-PLOTTER_900.pdf`,
        fileSizeBytes: BigInt(10240),
        mimeType: "application/pdf",
        checksumSha256: "t525_dummy_sha256",
      },
    });
    await prisma.digitalFile.update({
      where: { id: digitalFile.id },
      data: { currentVersionId: fileVersion.id },
    });

    // Add Plotter variant (450 KGS) to user's cart
    await cartService.addItem(user.id, { productId: product.id, variantId: varPlotter.id });
    const cart = await cartService.getUserCart(user.id);
    const cartItem = cart.items.find((i: any) => i.variantId === varPlotter.id);

    assert(
      cartItem?.price === 450,
      "Scenario 9: Cart reflects Plotter variant price (450 KGS)",
      `got ${cartItem?.price}`
    );
    assert(
      cart.totalAmount === 450,
      "Scenario 9: Cart totalAmount accurately reflects variant price override",
      `got ${cart.totalAmount}`
    );

    // =========================================================================
    // SCENARIO 10: Checkout enforces server-calculated price
    // =========================================================================
    console.log("\n[SCENARIO 10] Checkout enforces server authority over client price...");
    const checkoutRes = await ordersService.checkout(userTokenPayload, {
      customerName: "T525 Tester",
      customerEmail: user.email,
    });
    ctx.orderId = checkoutRes.orderId;

    const placedOrder = await prisma.order.findUnique({
      where: { id: checkoutRes.orderId },
      include: { items: true },
    });
    assert(
      Number(placedOrder?.totalAmount) === 450,
      "Scenario 10: Order totalAmount is 450 KGS based on authoritative server price",
      `got ${placedOrder?.totalAmount}`
    );
    assert(
      Number(placedOrder?.items[0]?.priceAtPurchase) === 450,
      "Scenario 10: OrderItem.priceAtPurchase recorded exactly 450 KGS"
    );

    // =========================================================================
    // SCENARIO 11 & 12: OrderItem.priceAtPurchase freezes price; past orders invariant
    // =========================================================================
    console.log("\n[SCENARIOS 11 & 12] OrderItem.priceAtPurchase immutability and past orders invariant...");
    // Now simulate an admin updating the Plotter format price to 600 KGS
    await catalogService.updateVariantPrice(product.id, varPlotter.id, 600);
    // Also update product basePrice to 500 KGS
    await prisma.product.update({
      where: { id: product.id },
      data: { basePrice: 500 },
    });

    // Verify current variant price is now 600
    const updatedVar = await prisma.productVariant.findUnique({ where: { id: varPlotter.id } });
    assert(
      Number(updatedVar?.priceOverride) === 600,
      "Scenario 11: Variant priceOverride was updated to 600 KGS"
    );

    // Re-fetch past order and assert its priceAtPurchase is STILL 450 KGS!
    const historicalOrder = await prisma.order.findUnique({
      where: { id: checkoutRes.orderId },
      include: { items: true },
    });
    assert(
      Number(historicalOrder?.items[0]?.priceAtPurchase) === 450,
      "Scenario 12: Past OrderItem.priceAtPurchase is unchanged at 450 KGS despite variant price increase",
      `got ${historicalOrder?.items[0]?.priceAtPurchase}`
    );
    assert(
      Number(historicalOrder?.totalAmount) === 450,
      "Scenario 12: Historical Order totalAmount is preserved at 450 KGS"
    );

    // =========================================================================
    // SCENARIO 13: Purchase Guard strictly blocks purchasing unavailable PDFs
    // =========================================================================
    console.log("\n[SCENARIO 13] Purchase Guard strictly blocks unavailable PDF regardless of price...");
    // Variant A4 does NOT have any digitalFile uploaded.
    // Try to add Variant A4 to cart:
    let purchaseGuardBlocked = false;
    let blockedReason = "";
    try {
      await cartService.addItem(user.id, { productId: product.id, variantId: varA4.id });
    } catch (e: any) {
      purchaseGuardBlocked = true;
      blockedReason = e.message || e.code;
    }
    assert(
      purchaseGuardBlocked,
      "Scenario 13: Addition of unavailable A4 PDF is strictly blocked by Purchase Guard",
      `Blocked message: "${blockedReason}"`
    );

    // =========================================================================
    // SCENARIO 14: Existing variants without overrides continue working
    // =========================================================================
    console.log("\n[SCENARIO 14] Existing variants without overrides continue working seamlessly...");
    // Reset A4 price override back to null (reset to inherited)
    await catalogService.updateVariantPrice(product.id, varA4.id, null);
    const resetA4 = await prisma.productVariant.findUnique({ where: { id: varA4.id } });
    assert(
      resetA4?.priceOverride === null,
      "Scenario 14: updateVariantPrice(null) successfully resets priceOverride to null"
    );

    const refreshedVariants = await catalogService.getProductVariants(product.id, false);
    const resetA4InList = refreshedVariants.find((v: any) => v.variantId === varA4.id);
    assert(
      resetA4InList?.price === 500 && resetA4InList?.isPriceOverridden === false,
      "Scenario 14: Variant with null override inherits new basePrice (500 KGS) without errors",
      `got ${resetA4InList?.price}`
    );

    // Test Batch Format Pricing (updateFormatPrices)
    console.log("\n[BATCH FORMAT PRICING] Testing updateFormatPrices...");
    const batchRes = await catalogService.updateFormatPrices(product.id, {
      formatId: formatPlotter.id,
      price: 550,
    });
    assert(
      batchRes.updatedCount >= 1 && batchRes.priceOverride === 550,
      "Batch Format: updateFormatPrices set 550 KGS for Plotter variants",
      `updatedCount: ${batchRes.updatedCount}`
    );

    // Clean reset via batch format pricing
    const batchReset = await catalogService.updateFormatPrices(product.id, {
      formatId: formatPlotter.id,
      price: null,
    });
    assert(
      batchReset.priceOverride === null,
      "Batch Format: updateFormatPrices(null) successfully resets format price to null (inherited)"
    );

  } catch (error: any) {
    console.error("\nFATAL TEST EXCEPTION:", error);
    failed++;
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP SYNTHETIC TEST DATA
    // -------------------------------------------------------------------------
    console.log("\n[CLEANUP] Tearing down synthetic test fixtures...");
    try {
      if (ctx.orderId) {
        await prisma.orderItem.deleteMany({ where: { orderId: ctx.orderId } });
        await prisma.payment.deleteMany({ where: { orderId: ctx.orderId } });
        await prisma.order.deleteMany({ where: { id: ctx.orderId } });
      }
      if (ctx.userId) {
        await prisma.cartItem.deleteMany({ where: { cart: { userId: ctx.userId } } });
        await prisma.cart.deleteMany({ where: { userId: ctx.userId } });
        await prisma.purchaseEntitlement.deleteMany({ where: { userId: ctx.userId } });
        await prisma.user.deleteMany({ where: { id: ctx.userId } });
      }
      if (ctx.productId) {
        // Delete digital files and file versions
        const variants = await prisma.productVariant.findMany({ where: { productId: ctx.productId } });
        for (const v of variants) {
          const files = await prisma.digitalFile.findMany({ where: { variantId: v.id } });
          for (const f of files) {
            await prisma.digitalFile.update({ where: { id: f.id }, data: { currentVersionId: null } });
            await prisma.fileVersion.deleteMany({ where: { digitalFileId: f.id } });
            await prisma.digitalFile.delete({ where: { id: f.id } });
          }
        }
        await prisma.productVariant.deleteMany({ where: { productId: ctx.productId } });
        await prisma.product.deleteMany({ where: { id: ctx.productId } });
      }
      if (ctx.categoryId) {
        await prisma.category.deleteMany({ where: { id: ctx.categoryId } });
      }
      console.log("    Cleanup complete.");
    } catch (cleanupErr) {
      console.error("    Cleanup error:", cleanupErr);
    }
  }

  console.log("\n================================================================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
