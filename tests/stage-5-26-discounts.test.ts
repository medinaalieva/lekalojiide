/**
 * LEKALO ZHIIDE — STAGE 5.26 TEST SUITE
 * DISCOUNT SCHEDULING & MARKETING PRICING ENGINE
 *
 * Scenarios tested:
 * 1. Pre-flight safety check asserts current_database() === "lekalo_test".
 * 2. Scenario 1: Future discount (discountFrom > now) -> PLANNED, isDiscountActive: false, price: basePrice.
 * 3. Scenario 2: Active discount (discountFrom <= now < discountUntil) -> ACTIVE, isDiscountActive: true, price: discountPrice.
 * 4. Scenario 3: Expired discount (discountUntil <= now) -> EXPIRED, isDiscountActive: false, price: basePrice.
 * 5. Scenario 4: Validation rejection when discountFrom > discountUntil.
 * 6. Scenario 5: Validation rejection when discountPrice <= 0.
 * 7. Scenario 6: Validation rejection when discountPrice >= basePrice.
 * 8. Scenario 7: Discount cancellation (discountPrice: null) resets to basePrice with status NONE.
 * 9. Scenario 8: Priority 1 (ProductVariant.priceOverride) strictly overrides product active discount.
 * 10. Scenario 9: Priority 2 (Product.bundlePrice for ALL variant) strictly overrides product active discount.
 * 11. Scenario 10: Cart server authority: cart calculates active discount server-side.
 * 12. Scenario 11: Checkout server authority: OrderItem.priceAtPurchase freezes discounted price.
 * 13. Scenario 12: Historical immutability: past orders retain purchase price after discount changes/expires.
 * 14. Scenario 13: Timezone UTC consistency: ISO UTC boundaries evaluated correctly.
 * 15. Scenario 14: Re-editing discount is idempotent and updates windows without affecting past orders.
 *
 * Safety:
 * - Pre-flight safety check asserts current_database() === "lekalo_test".
 * - Synthetic test data prefix: T526_
 * - Complete teardown in finally block.
 */

import { PrismaClient } from "@prisma/client";
import { calculateEffectivePrice } from "../src/utils/pricing";
import { CatalogService } from "../src/modules/catalog/catalog.service";
import { CartService } from "../src/modules/cart/cart.service";
import { OrdersService } from "../src/modules/orders/orders.service";
import {
  CreateProductSchema,
  UpdateProductSchema,
  UpdateProductDiscountSchema,
  CatalogQuerySchema,
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
  variantSId?: string;
  variantAllId?: string;
  orderId?: string;
}

const ctx: TestContext = {};

async function runTests() {
  console.log("================================================================================");
  console.log("LEKALO ZHIIDE — STAGE 5.26: DISCOUNT SCHEDULING & MARKETING PRICING TEST SUITE");
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
    // 0. PRE-FLIGHT DATABASE SAFETY CHECK
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
    console.log("\n[SETUP] Creating synthetic test fixtures (prefix: T526_)...");

    const catalogService = new CatalogService(undefined, prisma);
    const cartService = new CartService(undefined, prisma);
    const ordersService = new OrdersService(undefined, prisma);

    // 1. Test User
    const user = await prisma.user.create({
      data: {
        email: `t526_tester_${Date.now()}@example.com`,
        passwordHash: "dummy_hash_t526",
        firstName: "T526",
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
        title: "T526 Discounts Category",
        slug: `t526-discounts-${Date.now()}`,
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

    // 5. Test Format (A4)
    let formatA4 = await prisma.format.findUnique({ where: { code: "A4" } });
    if (!formatA4) {
      formatA4 = await prisma.format.create({
        data: { code: "A4", label: "Формат А4", displayOrder: 1, isActive: true },
      });
    }
    ctx.formatA4Id = formatA4.id;

    // 6. Test Product: Base price 500 KGS, Bundle price 1200 KGS
    const product = await prisma.product.create({
      data: {
        title: "T526 Synthetic Discount Pattern",
        slug: `t526-pattern-${Date.now()}`,
        categoryId: category.id,
        basePrice: 500,
        bundlePrice: 1200,
        hasBundleOption: true,
        description: "Synthetic pattern for discount scheduling automated verification",
        difficultyLevel: "BEGINNER",
        isActive: true,
      },
    });
    ctx.productId = product.id;

    // 7. Test Variants (Size S and Size ALL)
    const variantS = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sizeId: sizeS.id,
        heightId: height.id,
        formatId: formatA4.id,
        sku: `T526-S-A4-${Date.now()}`,
        isActive: true,
      },
    });
    ctx.variantSId = variantS.id;

    const variantAll = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sizeId: sizeAll.id,
        heightId: height.id,
        formatId: formatA4.id,
        sku: `T526-ALL-A4-${Date.now()}`,
        isActive: true,
      },
    });
    ctx.variantAllId = variantAll.id;

    // Attach synthetic digital files for purchase guard
    const dfS = await prisma.digitalFile.create({
      data: {
        variantId: variantS.id,
        title: "T526 Test Pattern File",
        fileType: "PATTERN",
        isActive: true,
      },
    });
    const verS = await prisma.fileVersion.create({
      data: {
        digitalFileId: dfS.id,
        versionNumber: 1,
        s3Bucket: "patterns-private",
        s3Key: `patterns/t526/pattern-s-v1.pdf`,
        originalFileName: `${product.slug}-S-${height.code}-A4.pdf`,
        fileSizeBytes: BigInt(1024),
        mimeType: "application/pdf",
        checksumSha256: "t526_dummy_sha256",
      },
    });
    await prisma.digitalFile.update({
      where: { id: dfS.id },
      data: { currentVersionId: verS.id },
    });

    console.log("    Test fixtures created successfully.\n");

    // -------------------------------------------------------------------------
    // TEST 1: Pure Engine - Future Discount (PLANNED)
    // -------------------------------------------------------------------------
    console.log("[TEST 1] Pure Engine: Future Discount Scheduling...");
    const futureFrom = new Date(Date.now() + 3600 * 1000); // 1 hour in future
    const futureUntil = new Date(Date.now() + 7200 * 1000); // 2 hours in future

    const pricingPlanned = calculateEffectivePrice({
      basePrice: 500,
      discountPrice: 350,
      discountFrom: futureFrom,
      discountUntil: futureUntil,
      bundlePrice: 1200,
    });
    assert(
      pricingPlanned.discountStatus === "PLANNED",
      "Scenario 1a: Future discount resolves to status PLANNED",
      `Got: ${pricingPlanned.discountStatus}`
    );
    assert(
      pricingPlanned.isDiscountActive === false,
      "Scenario 1b: Future discount has isDiscountActive === false"
    );
    assert(
      pricingPlanned.currentPrice === 500,
      "Scenario 1c: Future discount sells at basePrice (500 KGS)",
      `Got: ${pricingPlanned.currentPrice}`
    );

    // -------------------------------------------------------------------------
    // TEST 2: Pure Engine - Active Discount (ACTIVE)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2] Pure Engine: Active Discount Scheduling...");
    const activeFrom = new Date(Date.now() - 3600 * 1000); // 1 hour ago
    const activeUntil = new Date(Date.now() + 3600 * 1000); // 1 hour in future

    const pricingActive = calculateEffectivePrice({
      basePrice: 500,
      discountPrice: 350,
      discountFrom: activeFrom,
      discountUntil: activeUntil,
      bundlePrice: 1200,
    });
    assert(
      pricingActive.discountStatus === "ACTIVE",
      "Scenario 2a: Active discount resolves to status ACTIVE",
      `Got: ${pricingActive.discountStatus}`
    );
    assert(
      pricingActive.isDiscountActive === true,
      "Scenario 2b: Active discount has isDiscountActive === true"
    );
    assert(
      pricingActive.currentPrice === 350,
      "Scenario 2c: Active discount sells at discountPrice (350 KGS)",
      `Got: ${pricingActive.currentPrice}`
    );
    assert(
      pricingActive.discountPercent === 30,
      "Scenario 2d: Active discount percent correctly calculated as 30%",
      `Got: ${pricingActive.discountPercent}%`
    );

    // -------------------------------------------------------------------------
    // TEST 3: Pure Engine - Expired Discount (EXPIRED)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Pure Engine: Expired Discount Scheduling...");
    const expiredFrom = new Date(Date.now() - 7200 * 1000); // 2 hours ago
    const expiredUntil = new Date(Date.now() - 3600 * 1000); // 1 hour ago

    const pricingExpired = calculateEffectivePrice({
      basePrice: 500,
      discountPrice: 350,
      discountFrom: expiredFrom,
      discountUntil: expiredUntil,
      bundlePrice: 1200,
    });
    assert(
      pricingExpired.discountStatus === "EXPIRED",
      "Scenario 3a: Expired discount resolves to status EXPIRED",
      `Got: ${pricingExpired.discountStatus}`
    );
    assert(
      pricingExpired.isDiscountActive === false,
      "Scenario 3b: Expired discount has isDiscountActive === false"
    );
    assert(
      pricingExpired.currentPrice === 500,
      "Scenario 3c: Expired discount automatically reverts to basePrice (500 KGS)",
      `Got: ${pricingExpired.currentPrice}`
    );

    // -------------------------------------------------------------------------
    // TEST 4: DTO Validation - Invalid Date Range (from > until)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 4] DTO Validation: Invalid Date Range (from > until)...");
    const invalidDatesRes = UpdateProductDiscountSchema.safeParse({
      discountPrice: 350,
      discountFrom: "2026-12-31T12:00:00Z",
      discountUntil: "2026-01-01T12:00:00Z",
    });
    assert(
      invalidDatesRes.success === false,
      "Scenario 4a: UpdateProductDiscountSchema rejects discountFrom > discountUntil"
    );

    const invalidDatesCreateRes = CreateProductSchema.safeParse({
      title: "Test",
      categoryId: category.id,
      basePrice: 500,
      discountPrice: 350,
      discountFrom: "2026-12-31T12:00:00Z",
      discountUntil: "2026-01-01T12:00:00Z",
      difficultyLevel: "BEGINNER",
    });
    assert(
      invalidDatesCreateRes.success === false,
      "Scenario 4b: CreateProductSchema rejects discountFrom > discountUntil"
    );

    // -------------------------------------------------------------------------
    // TEST 5: DTO Validation - Zero and Negative Discount Price
    // -------------------------------------------------------------------------
    console.log("\n[TEST 5] DTO Validation: Zero and Negative Discount Price...");
    const zeroDiscountRes = UpdateProductDiscountSchema.safeParse({
      discountPrice: 0,
    });
    assert(
      zeroDiscountRes.success === false,
      "Scenario 5a: UpdateProductDiscountSchema rejects discountPrice === 0"
    );

    const negDiscountRes = UpdateProductDiscountSchema.safeParse({
      discountPrice: -50,
    });
    assert(
      negDiscountRes.success === false,
      "Scenario 5b: UpdateProductDiscountSchema rejects discountPrice < 0"
    );

    // -------------------------------------------------------------------------
    // TEST 6: DTO & Service Validation - discountPrice >= basePrice
    // -------------------------------------------------------------------------
    console.log("\n[TEST 6] Validation: discountPrice >= basePrice...");
    const higherDiscountRes = CreateProductSchema.safeParse({
      title: "Test",
      categoryId: category.id,
      basePrice: 500,
      discountPrice: 600, // Higher than base price
      difficultyLevel: "BEGINNER",
    });
    assert(
      higherDiscountRes.success === false,
      "Scenario 6a: CreateProductSchema rejects discountPrice (600) >= basePrice (500)"
    );

    let serviceRejected = false;
    try {
      await catalogService.updateProductDiscount(product.id, {
        discountPrice: 550, // Higher than base price 500
      });
    } catch (err: any) {
      serviceRejected = err.code === "INVALID_DISCOUNT_PRICE";
    }
    assert(
      serviceRejected,
      "Scenario 6b: catalogService.updateProductDiscount rejects discountPrice >= basePrice"
    );

    // -------------------------------------------------------------------------
    // TEST 7: Discount Cancellation
    // -------------------------------------------------------------------------
    console.log("\n[TEST 7] Discount Cancellation Flow...");
    // First set active discount
    await catalogService.updateProductDiscount(product.id, {
      discountPrice: 380,
      discountFrom: activeFrom.toISOString(),
      discountUntil: activeUntil.toISOString(),
    });

    const activeProd = await catalogService.getProductById(product.id);
    assert(
      activeProd.discountStatus === "ACTIVE" && activeProd.currentPrice === 380,
      "Scenario 7a: Product discount set to ACTIVE at 380 KGS"
    );

    // Now cancel discount via discountPrice: null
    await catalogService.updateProductDiscount(product.id, {
      discountPrice: null,
    });

    const cancelledProd = await catalogService.getProductById(product.id);
    assert(
      cancelledProd.discountPrice === null &&
      cancelledProd.discountFrom === null &&
      cancelledProd.discountUntil === null,
      "Scenario 7b: Discount fields reset to null on cancellation"
    );
    assert(
      cancelledProd.discountStatus === "NONE" &&
      cancelledProd.currentPrice === 500 &&
      cancelledProd.isDiscountActive === false,
      "Scenario 7c: Product returns to basePrice (500 KGS) with status NONE"
    );

    // -------------------------------------------------------------------------
    // TEST 8: Priority 1 - priceOverride Overrides Active Discount
    // -------------------------------------------------------------------------
    console.log("\n[TEST 8] Priority 1: Variant priceOverride vs Active Discount...");
    // Re-enable active discount on product
    await catalogService.updateProductDiscount(product.id, {
      discountPrice: 350,
      discountFrom: activeFrom.toISOString(),
      discountUntil: activeUntil.toISOString(),
    });

    // Set variant priceOverride = 600 KGS (e.g. specialized format)
    await catalogService.updateVariantPrice(product.id, variantS.id, 600);

    const variantPrices = await catalogService.getProductVariants(product.id, false);
    const vS = variantPrices.find((v) => v.variantId === variantS.id);

    assert(
      vS?.price === 600,
      "Scenario 8a: Variant with priceOverride (600 KGS) sells at 600, NOT active discount (350)",
      `Got: ${vS?.price}`
    );
    assert(
      vS?.isPriceOverridden === true,
      "Scenario 8b: Variant has isPriceOverridden === true"
    );
    assert(
      vS?.isDiscountActive === false,
      "Scenario 8c: Variant with priceOverride has isDiscountActive === false"
    );

    // Reset priceOverride back to null
    await catalogService.updateVariantPrice(product.id, variantS.id, null);
    const vSInherited = (await catalogService.getProductVariants(product.id, false)).find(
      (v) => v.variantId === variantS.id
    );
    assert(
      vSInherited?.price === 350 && vSInherited?.isDiscountActive === true,
      "Scenario 8d: After resetting priceOverride, variant inherits active discount (350 KGS)"
    );

    // -------------------------------------------------------------------------
    // TEST 9: Priority 2 - Bundle ALL Price vs Active Discount
    // -------------------------------------------------------------------------
    console.log("\n[TEST 9] Priority 2: Bundle ALL Price vs Active Discount...");
    const vAll = (await catalogService.getProductVariants(product.id, false)).find(
      (v) => v.variantId === variantAll.id
    );
    assert(
      vAll?.price === 1200,
      "Scenario 9a: Bundle ALL variant sells at bundlePrice (1200 KGS), NOT active discount (350)",
      `Got: ${vAll?.price}`
    );
    assert(
      vAll?.isBundle === true,
      "Scenario 9b: Bundle ALL variant has isBundle === true"
    );
    assert(
      vAll?.isDiscountActive === false,
      "Scenario 9c: Bundle ALL variant is not reduced by product-level discount"
    );

    // -------------------------------------------------------------------------
    // TEST 10: Cart Server Authority
    // -------------------------------------------------------------------------
    console.log("\n[TEST 10] Cart Server Authority: Active Discount Calculation...");
    const cartRes = await cartService.addItem(user.id, { productId: product.id, variantId: variantS.id });
    const cartItem = cartRes.items.find((i) => i.variantId === variantS.id);

    assert(
      cartItem?.price === 350,
      "Scenario 10a: Cart calculates discounted price server-side (350 KGS)",
      `Got: ${cartItem?.price}`
    );
    assert(
      cartItem?.originalPrice === 500,
      "Scenario 10b: Cart retains originalPrice (500 KGS) for strikethrough display"
    );
    assert(
      cartItem?.isDiscountActive === true,
      "Scenario 10c: Cart item has isDiscountActive === true"
    );
    assert(
      cartRes.totalAmount === 350,
      "Scenario 10d: Cart total matches discounted item price (350 KGS)",
      `Got: ${cartRes.totalAmount}`
    );

    // -------------------------------------------------------------------------
    // TEST 11: Checkout Server Authority
    // -------------------------------------------------------------------------
    console.log("\n[TEST 11] Checkout Server Authority: Price Freezing...");
    const checkoutRes = await ordersService.checkout(userTokenPayload, {
      customerEmail: user.email,
      customerName: "T526 Tester",
    });
    ctx.orderId = checkoutRes.orderId;

    assert(
      Number(checkoutRes.totalAmount) === 350,
      "Scenario 11a: Order total is locked at discounted price (350 KGS)",
      `Got: ${checkoutRes.totalAmount}`
    );
    const orderItem = await prisma.orderItem.findFirst({
      where: { orderId: checkoutRes.orderId },
    });
    assert(
      Number(orderItem?.priceAtPurchase) === 350,
      "Scenario 11b: OrderItem.priceAtPurchase freezes discounted price (350 KGS)",
      `Got: ${orderItem?.priceAtPurchase}`
    );

    // -------------------------------------------------------------------------
    // TEST 12: Historical Immutability
    // -------------------------------------------------------------------------
    console.log("\n[TEST 12] Historical Immutability: Past Order Remains Frozen...");
    // Modify product: cancel discount and change basePrice to 800
    await catalogService.updateProduct(product.id, {
      basePrice: 800,
      discountPrice: null,
    });

    const pastOrder = await prisma.order.findUnique({
      where: { id: ctx.orderId },
      include: { items: true },
    });

    assert(
      Number(pastOrder?.totalAmount) === 350,
      "Scenario 12a: Past order total remains 350 KGS after discount cancelled and basePrice changed",
      `Got: ${pastOrder?.totalAmount}`
    );
    assert(
      Number(pastOrder?.items[0].priceAtPurchase) === 350,
      "Scenario 12b: Past OrderItem.priceAtPurchase remains 350 KGS immutable",
      `Got: ${pastOrder?.items[0].priceAtPurchase}`
    );

    // -------------------------------------------------------------------------
    // TEST 13: Timezone UTC Boundary Consistency
    // -------------------------------------------------------------------------
    console.log("\n[TEST 13] UTC Timezone Boundary Consistency...");
    const testNow = new Date("2026-11-20T12:00:00.000Z");

    const utcCheckActive = calculateEffectivePrice(
      {
        basePrice: 500,
        discountPrice: 350,
        discountFrom: "2026-11-20T11:00:00.000Z",
        discountUntil: "2026-11-20T13:00:00.000Z",
      },
      undefined,
      testNow
    );
    assert(
      utcCheckActive.discountStatus === "ACTIVE" && utcCheckActive.currentPrice === 350,
      "Scenario 13a: UTC window actively matching simulated now"
    );

    const utcCheckBoundary = calculateEffectivePrice(
      {
        basePrice: 500,
        discountPrice: 350,
        discountFrom: "2026-11-20T11:00:00.000Z",
        discountUntil: "2026-11-20T12:00:00.000Z",
      },
      undefined,
      testNow
    );
    assert(
      utcCheckBoundary.discountStatus === "EXPIRED" && utcCheckBoundary.currentPrice === 500,
      "Scenario 13b: UTC boundary now >= until expires immediately at exact second"
    );

    // -------------------------------------------------------------------------
    // TEST 14: Re-editing Idempotency & Public Catalog View
    // -------------------------------------------------------------------------
    console.log("\n[TEST 14] Re-editing Idempotency & Public Catalog...");
    // Set new future discount
    await catalogService.updateProductDiscount(product.id, {
      discountPrice: 420,
      discountFrom: new Date(Date.now() + 86400 * 1000).toISOString(),
      discountUntil: new Date(Date.now() + 172800 * 1000).toISOString(),
    });

    const catalogList = await catalogService.getProducts(
      CatalogQuerySchema.parse({ search: "T526 Synthetic" }),
      false
    );
    const listedProd = catalogList.items.find((p) => p.id === product.id);

    assert(
      listedProd !== undefined,
      "Scenario 14a: Product found in catalog list"
    );
    assert(
      listedProd?.discountStatus === "PLANNED",
      "Scenario 14b: Catalog list reflects discountStatus: PLANNED",
      `Got: ${listedProd?.discountStatus}`
    );
    assert(
      listedProd?.isDiscountActive === false && listedProd?.currentPrice === 800,
      "Scenario 14c: Catalog list sells at basePrice (800 KGS) while discount is PLANNED"
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
