import { Injectable, Optional } from "@nestjs/common";
import { PrismaClient, DifficultyLevel, Prisma } from "@prisma/client";
import { PrismaService } from "../../lib/prisma.service";
import { prisma as defaultPrisma } from "../../lib/prisma";
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  CatalogQueryDto,
  BatchVariantsDto,
  AddProductImageDto,
  CreateSizeDto,
  UpdateSizeDto,
  CreateHeightDto,
  UpdateHeightDto,
  CreateFormatDto,
  UpdateFormatDto,
  UpdateProductDiscountDto,
} from "./catalog.dto";
import { calculateEffectivePrice } from "../../utils/pricing";
import { slugify } from "../../utils/slug";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
  UnprocessableEntityError,
} from "../../utils/errors";
import { checkPatternAvailability } from "../../utils/pattern-availability";

export interface CategoryTreeItem {
  id: string;
  parentId: string | null;
  title: string;
  name: string;
  slug: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  children: CategoryTreeItem[];
}

@Injectable()
export class CatalogService {
  private prisma: PrismaClient;

  constructor(@Optional() prismaService?: PrismaService, @Optional() customPrisma?: PrismaClient) {
    if (customPrisma) {
      this.prisma = customPrisma;
    } else if (prismaService?.client) {
      this.prisma = prismaService.client;
    } else {
      this.prisma = defaultPrisma;
    }
  }

  // ===========================================================================
  // ПУБЛИЧНЫЕ МЕТОДЫ: КАТЕГОРИИ
  // ===========================================================================

  /**
   * Получение дерева категорий каталога (с поддержкой иерархии parent -> children)
   */
  async getCategories(includeInactive = false): Promise<CategoryTreeItem[]> {
    const categories = await this.prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
    });

    const categoryMap = new Map<string, CategoryTreeItem>();
    const rootCategories: CategoryTreeItem[] = [];

    // 1. Создаем объекты дерева
    for (const cat of categories) {
      categoryMap.set(cat.id, {
        id: cat.id,
        parentId: cat.parentId,
        title: cat.title,
        name: cat.title,
        slug: cat.slug,
        description: cat.description,
        displayOrder: cat.displayOrder,
        isActive: cat.isActive,
        children: [],
      });
    }

    // 2. Выстраиваем иерархию
    for (const cat of categories) {
      const item = categoryMap.get(cat.id)!;
      if (cat.parentId && categoryMap.has(cat.parentId)) {
        categoryMap.get(cat.parentId)!.children.push(item);
      } else {
        rootCategories.push(item);
      }
    }

    return rootCategories;
  }

  /**
   * Получение категории по slug
   */
  async getCategoryBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { displayOrder: "asc" },
        },
      },
    });

    if (!category) {
      throw new NotFoundError("CATEGORY_NOT_FOUND", "Категория не найдена");
    }

    return category;
  }

  // ===========================================================================
  // ПУБЛИЧНЫЕ МЕТОДЫ: СПРАВОЧНИКИ ФИЛЬТРОВ
  // ===========================================================================

  /**
   * Справочник доступных фильтров (размеры, ростовки, форматы, уровни сложности)
   */
  async getFilters() {
    const [sizes, heights, formats] = await Promise.all([
      this.prisma.size.findMany({
        orderBy: { displayOrder: "asc" },
        select: { id: true, code: true, label: true },
      }),
      this.prisma.height.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
        select: { id: true, code: true, label: true, minHeight: true, maxHeight: true },
      }),
      this.prisma.format.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
        select: { id: true, code: true, label: true, description: true, maxPrintWidth: true },
      }),
    ]);

    return {
      sizes,
      heights,
      formats,
      difficultyLevels: [
        DifficultyLevel.BEGINNER,
        DifficultyLevel.INTERMEDIATE,
        DifficultyLevel.ADVANCED,
      ],
    };
  }

  // ===========================================================================
  // ПУБЛИЧНЫЕ МЕТОДЫ: ВЫКРОЙКИ (ТОВАРЫ)
  // ===========================================================================

  /**
   * Список выкроек с пагинацией, множественной фильтрацией и поиском
   */
  async getProducts(query: CatalogQueryDto, isPublic = true) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 12));
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    // 1. Фильтр активности
    if (isPublic) {
      where.isActive = true;
    }

    // 2. Фильтрация по категории
    const catSlug = query.categorySlug || (query as any).category;
    if (catSlug) {
      let category = await this.prisma.category.findUnique({
        where: { slug: catSlug },
        include: { children: { select: { id: true } } },
      });

      // Alias fallback for dresses (platya <-> plate) or fuzzy title match
      if (!category && (catSlug === "platya" || catSlug === "plate")) {
        category = await this.prisma.category.findFirst({
          where: {
            OR: [
              { slug: { in: ["platya", "plate", "dresses"] } },
              { title: { contains: "плать", mode: "insensitive" } },
            ],
          },
          include: { children: { select: { id: true } } },
        });
      }

      if (!category) {
        return {
          items: [],
          meta: {
            page,
            limit,
            totalItems: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
        };
      }

      const categoryIds = [category.id, ...category.children.map((c: { id: string }) => c.id)];
      where.categoryId = { in: categoryIds };
    } else if (query.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: query.categoryId },
        include: { children: { select: { id: true } } },
      });
      if (category && category.children && category.children.length > 0) {
        where.categoryId = { in: [category.id, ...category.children.map((c: { id: string }) => c.id)] };
      } else {
        where.categoryId = query.categoryId;
      }
    }

    // 3. Поиск по названию или описанию
    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { shortDescription: { contains: search, mode: "insensitive" } },
      ];
    }

    // 4. Фильтр по сложности
    if (query.difficulty) {
      const difficulties = query.difficulty
        .split(",")
        .map((d) => d.trim().toUpperCase())
        .filter((d): d is DifficultyLevel =>
          Object.values(DifficultyLevel).includes(d as DifficultyLevel)
        );

      if (difficulties.length > 0) {
        where.difficultyLevel = { in: difficulties };
      }
    }

    // Фильтры по бейджам и скидкам
    if (query.isNew !== undefined) {
      where.isNew = query.isNew;
    }
    if (query.isBestseller !== undefined) {
      where.isBestseller = query.isBestseller;
    }
    if (query.isPopular !== undefined) {
      where.isPopular = query.isPopular;
    }
    if (query.hasDiscount === true) {
      where.discountPrice = { not: null };
    }

    // 5. Фильтр по доступным размерам, ростовкам и форматам
    const variantWhere: Prisma.ProductVariantWhereInput = {
      isActive: true,
    };
    let hasVariantFilter = false;

    const isUuid = (val: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    const sizesParam = query.sizes || query.size;
    if (sizesParam) {
      const sizeList = sizesParam.split(",").map((s) => s.trim()).filter(Boolean);
      const uuids = sizeList.filter(isUuid);
      const codes = sizeList.filter((s) => !isUuid(s));
      const conditions: Prisma.SizeWhereInput[] = [];
      if (codes.length > 0) conditions.push({ code: { in: codes } });
      if (uuids.length > 0) conditions.push({ id: { in: uuids } });
      if (conditions.length > 0) {
        variantWhere.size = conditions.length === 1 ? conditions[0] : { OR: conditions };
        hasVariantFilter = true;
      }
    }

    const heightsParam = query.heights || query.height;
    if (heightsParam) {
      const heightList = heightsParam.split(",").map((h) => h.trim()).filter(Boolean);
      const uuids = heightList.filter(isUuid);
      const codes = heightList.filter((h) => !isUuid(h));
      const conditions: Prisma.HeightWhereInput[] = [];
      if (codes.length > 0) conditions.push({ code: { in: codes } });
      if (uuids.length > 0) conditions.push({ id: { in: uuids } });
      if (conditions.length > 0) {
        variantWhere.height = conditions.length === 1 ? conditions[0] : { OR: conditions };
        hasVariantFilter = true;
      }
    }

    const formatsParam = query.formats || query.format;
    if (formatsParam) {
      const formatList = formatsParam.split(",").map((f) => f.trim()).filter(Boolean);
      const uuids = formatList.filter(isUuid);
      const codes = formatList.filter((f) => !isUuid(f));
      const conditions: Prisma.FormatWhereInput[] = [];
      if (codes.length > 0) conditions.push({ code: { in: codes } });
      if (uuids.length > 0) conditions.push({ id: { in: uuids } });
      if (conditions.length > 0) {
        variantWhere.format = conditions.length === 1 ? conditions[0] : { OR: conditions };
        hasVariantFilter = true;
      }
    }

    if (hasVariantFilter) {
      where.variants = { some: variantWhere };
    }

    // 6. Сортировка
    let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: "desc" };
    if (query.sort === "price_asc" || (query.sortBy === "price" && query.sortOrder === "asc")) {
      orderBy = { basePrice: "asc" };
    } else if (query.sort === "price_desc" || (query.sortBy === "price" && query.sortOrder === "desc")) {
      orderBy = { basePrice: "desc" };
    } else if (query.sort === "title_asc" || (query.sortBy === "title" && query.sortOrder === "asc")) {
      orderBy = { title: "asc" };
    } else if (query.sortBy === "createdAt" && query.sortOrder === "asc") {
      orderBy = { createdAt: "asc" };
    }

    // 7. Запрос данных и подсчёт общего количества
    const [totalItems, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          category: {
            select: { id: true, title: true, slug: true },
          },
          images: {
            orderBy: [{ isCover: "desc" }, { displayOrder: "asc" }],
          },
          variants: {
            where: { isActive: true },
            select: {
              size: { select: { code: true, label: true, displayOrder: true } },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    // 8. Форматирование каталожной выдачи
    const items = products.map((product: any) => {
      const sizeMap = new Map<string, { code: string; label: string; displayOrder: number }>();
      for (const v of product.variants) {
        if (!sizeMap.has(v.size.code)) {
          sizeMap.set(v.size.code, v.size);
        }
      }
      const availableSizes = Array.from(sizeMap.values())
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(({ code, label }) => ({ code, label }));

      const coverImage =
        product.images.find((img: any) => img.isCover)?.imageUrl ||
        product.images[0]?.imageUrl ||
        null;

      const pricing = calculateEffectivePrice({
        basePrice: product.basePrice,
        discountPrice: product.discountPrice,
        discountFrom: product.discountFrom,
        discountUntil: product.discountUntil,
        bundlePrice: product.bundlePrice,
      });

      return {
        id: product.id,
        title: product.title,
        slug: product.slug,
        shortDescription: product.shortDescription,
        basePrice: pricing.originalPrice,
        currentPrice: pricing.currentPrice,
        isDiscountActive: pricing.isDiscountActive,
        discountPrice: product.discountPrice ? Number(product.discountPrice) : null,
        discountPercent: pricing.discountPercent,
        discountFrom: pricing.discountFrom,
        discountUntil: pricing.discountUntil,
        discountStatus: pricing.discountStatus,
        bundlePrice: product.bundlePrice ? Number(product.bundlePrice) : null,
        hasBundleOption: product.hasBundleOption,
        isNew: product.isNew,
        isBestseller: product.isBestseller,
        isPopular: product.isPopular,
        technicalDrawingUrl: product.technicalDrawingUrl,
        videoUrl: product.videoUrl,
        currency: "KGS",
        difficultyLevel: product.difficultyLevel,
        category: product.category,
        coverImage,
        availableSizes,
        createdAt: product.createdAt.toISOString(),
      };
    });

    return {
      items,
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Получение детальной карточки выкройки по slug
   */
  async getProductBySlug(slug: string, isPublic = true) {
    const slugAliases: Record<string, string> = {
      "pizharnyj-komplekt-komfort": "pizhamnyj-komplekt-komfort",
    };
    const targetSlug = slugAliases[slug] || slug;

    const product = await this.prisma.product.findUnique({
      where: { slug: targetSlug },
      include: {
        category: {
          select: { id: true, title: true, slug: true, parentId: true },
        },
        images: {
          orderBy: [{ isCover: "desc" }, { displayOrder: "asc" }],
          select: {
            id: true,
            imageUrl: true,
            altText: true,
            displayOrder: true,
            isCover: true,
          },
        },
        instructions: {
          where: { isActive: true },
          select: { id: true, title: true, fileName: true, version: true },
        },
        variants: {
          where: isPublic ? { isActive: true } : {},
          include: {
            size: { select: { id: true, code: true, label: true, displayOrder: true } },
            height: { select: { id: true, code: true, label: true, displayOrder: true } },
            format: { select: { id: true, code: true, label: true, description: true, displayOrder: true } },
            digitalFiles: {
              where: { isActive: true },
              include: {
                currentVersion: true,
                versions: true,
              },
            },
          },
          orderBy: [
            { size: { displayOrder: "asc" } },
            { height: { displayOrder: "asc" } },
            { format: { displayOrder: "asc" } },
          ],
        },
      },
    });

    if (!product || (isPublic && !product.isActive)) {
      throw new NotFoundError("PRODUCT_NOT_FOUND", "Выкройка не найдена");
    }

    const prodPricing = calculateEffectivePrice({
      basePrice: product.basePrice,
      discountPrice: product.discountPrice,
      discountFrom: product.discountFrom,
      discountUntil: product.discountUntil,
      bundlePrice: product.bundlePrice,
    });

    const variants = product.variants.map((v: any) => {
      const isBundleVariant = v.size.code === "ALL";
      const varPricing = calculateEffectivePrice(
        {
          basePrice: product.basePrice,
          discountPrice: product.discountPrice,
          discountFrom: product.discountFrom,
          discountUntil: product.discountUntil,
          bundlePrice: product.bundlePrice,
        },
        { isBundleVariant, priceOverride: v.priceOverride }
      );

      let childVariants: any[] | undefined = undefined;
      if (isBundleVariant) {
        childVariants = product.variants.filter(
          (c: any) =>
            c.size.code !== "ALL" &&
            c.height.id === v.height.id &&
            c.format.id === v.format.id &&
            c.isActive
        );
      }

      const availCheck = checkPatternAvailability(
        {
          ...v,
          product: { title: product.title, isActive: product.isActive },
        },
        childVariants
      );

      return {
        variantId: v.id,
        sku: v.sku,
        size: { id: v.size.id, code: v.size.code, label: v.size.label },
        height: { id: v.height.id, code: v.height.code, label: v.height.label },
        format: { id: v.format.id, code: v.format.code, label: v.format.label },
        price: varPricing.currentPrice,
        originalPrice: varPricing.originalPrice,
        priceOverride: v.priceOverride !== null ? Number(v.priceOverride) : null,
        isPriceOverridden: v.priceOverride !== null,
        isDiscountActive: varPricing.isDiscountActive,
        isBundle: varPricing.isBundle,
        currency: "KGS",
        isAvailable: Boolean(v.isActive && availCheck.isAvailable),
        unavailableReason: availCheck.reason,
        unavailableMessage: availCheck.message,
      };
    });

    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      basePrice: prodPricing.originalPrice,
      currentPrice: prodPricing.currentPrice,
      isDiscountActive: prodPricing.isDiscountActive,
      discountPrice: product.discountPrice ? Number(product.discountPrice) : null,
      discountPercent: prodPricing.discountPercent,
      discountFrom: prodPricing.discountFrom,
      discountUntil: prodPricing.discountUntil,
      discountStatus: prodPricing.discountStatus,
      bundlePrice: product.bundlePrice ? Number(product.bundlePrice) : null,
      hasBundleOption: product.hasBundleOption,
      isNew: product.isNew,
      isBestseller: product.isBestseller,
      isPopular: product.isPopular,
      technicalDrawingUrl: product.technicalDrawingUrl,
      videoUrl: product.videoUrl,
      currency: "KGS",
      difficultyLevel: product.difficultyLevel,
      fabricDetails: product.fabricDetails,
      category: product.category,
      images: product.images,
      hasInstruction: product.instructions.length > 0,
      variants,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  /**
   * Получение детальной карточки выкройки по ID (для админки)
   */
  async getProductById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: {
          select: { id: true, title: true, slug: true, parentId: true },
        },
        images: {
          orderBy: [{ isCover: "desc" }, { displayOrder: "asc" }],
          select: {
            id: true,
            imageUrl: true,
            altText: true,
            displayOrder: true,
            isCover: true,
          },
        },
        instructions: {
          select: { id: true, title: true, fileName: true, version: true, isActive: true },
        },
        variants: {
          include: {
            size: { select: { id: true, code: true, label: true, displayOrder: true } },
            height: { select: { id: true, code: true, label: true, displayOrder: true } },
            format: { select: { id: true, code: true, label: true, description: true, displayOrder: true } },
            digitalFiles: {
              where: { isActive: true },
              include: {
                currentVersion: true,
                versions: {
                  orderBy: { versionNumber: "desc" },
                },
              },
            },
          },
          orderBy: [
            { size: { displayOrder: "asc" } },
            { height: { displayOrder: "asc" } },
            { format: { displayOrder: "asc" } },
          ],
        },
      },
    });

    if (!product) {
      throw new NotFoundError("PRODUCT_NOT_FOUND", "Выкройка не найдена");
    }

    const variants = product.variants.map((v) => ({
      ...v,
      priceOverride: v.priceOverride ? Number(v.priceOverride) : null,
      digitalFiles: v.digitalFiles.map((df) => ({
        ...df,
        currentVersion: df.currentVersion
          ? { ...df.currentVersion, fileSizeBytes: Number(df.currentVersion.fileSizeBytes) }
          : null,
        versions: df.versions.map((ver) => ({
          ...ver,
          fileSizeBytes: Number(ver.fileSizeBytes),
        })),
      })),
    }));

    const pricing = calculateEffectivePrice({
      basePrice: product.basePrice,
      discountPrice: product.discountPrice,
      discountFrom: product.discountFrom,
      discountUntil: product.discountUntil,
      bundlePrice: product.bundlePrice,
    });

    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      basePrice: Number(product.basePrice),
      currentPrice: pricing.currentPrice,
      isDiscountActive: pricing.isDiscountActive,
      discountStatus: pricing.discountStatus,
      discountPercent: pricing.discountPercent,
      bundlePrice: product.bundlePrice ? Number(product.bundlePrice) : null,
      hasBundleOption: product.hasBundleOption,
      discountPrice: product.discountPrice ? Number(product.discountPrice) : null,
      discountFrom: product.discountFrom ? product.discountFrom.toISOString() : null,
      discountUntil: product.discountUntil ? product.discountUntil.toISOString() : null,
      isNew: product.isNew,
      isBestseller: product.isBestseller,
      isPopular: product.isPopular,
      technicalDrawingUrl: product.technicalDrawingUrl,
      videoUrl: product.videoUrl,
      currency: "KGS",
      difficultyLevel: product.difficultyLevel,
      fabricDetails: product.fabricDetails,
      isActive: product.isActive,
      categoryId: product.categoryId,
      category: product.category,
      images: product.images,
      instructions: product.instructions,
      variants,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  /**
   * Получение вариантов конкретной выкройки
   */
  async getProductVariants(productId: string, isPublic = true) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        basePrice: true,
        discountPrice: true,
        discountFrom: true,
        discountUntil: true,
        bundlePrice: true,
        isActive: true,
      },
    });

    if (!product || (isPublic && !product.isActive)) {
      throw new NotFoundError("PRODUCT_NOT_FOUND", "Выкройка не найдена");
    }

    const variants = await this.prisma.productVariant.findMany({
      where: {
        productId,
        ...(isPublic ? { isActive: true } : {}),
      },
      include: {
        size: { select: { id: true, code: true, label: true, displayOrder: true } },
        height: { select: { id: true, code: true, label: true, displayOrder: true } },
        format: { select: { id: true, code: true, label: true, displayOrder: true } },
        digitalFiles: {
          where: { isActive: true },
          include: {
            currentVersion: true,
            versions: true,
          },
        },
      },
      orderBy: [
        { size: { displayOrder: "asc" } },
        { height: { displayOrder: "asc" } },
        { format: { displayOrder: "asc" } },
      ],
    });

    return variants.map((v: any) => {
      const isBundleVariant = v.size?.code === "ALL";
      const varPricing = calculateEffectivePrice(
        {
          basePrice: product.basePrice,
          discountPrice: product.discountPrice,
          discountFrom: product.discountFrom,
          discountUntil: product.discountUntil,
          bundlePrice: product.bundlePrice,
        },
        { isBundleVariant, priceOverride: v.priceOverride }
      );

      let childVariants: any[] | undefined = undefined;
      if (isBundleVariant) {
        childVariants = variants.filter(
          (c: any) =>
            c.size?.code !== "ALL" &&
            c.height?.id === v.height?.id &&
            c.format?.id === v.format?.id &&
            c.isActive
        );
      }

      const availCheck = checkPatternAvailability(
        {
          ...v,
          product: { isActive: product.isActive },
        },
        childVariants
      );

      return {
        variantId: v.id,
        sku: v.sku,
        size: v.size,
        height: v.height,
        format: v.format,
        price: varPricing.currentPrice,
        originalPrice: varPricing.originalPrice,
        priceOverride: v.priceOverride !== null ? Number(v.priceOverride) : null,
        isPriceOverridden: v.priceOverride !== null,
        isDiscountActive: varPricing.isDiscountActive,
        isBundle: varPricing.isBundle,
        currency: "KGS",
        isAvailable: Boolean(v.isActive && availCheck.isAvailable),
        unavailableReason: availCheck.reason,
        unavailableMessage: availCheck.message,
      };
    });
  }

  // ===========================================================================
  // АДМИНИСТРАТИВНЫЕ МЕТОДЫ: КАТЕГОРИИ
  // ===========================================================================

  /**
   * Создание новой категории
   */
  async createCategory(dto: CreateCategoryDto) {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.title);

    const existingSlug = await this.prisma.category.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      throw new ConflictError("CATEGORY_SLUG_EXISTS", `Категория со слагом '${slug}' уже существует`);
    }

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundError("PARENT_CATEGORY_NOT_FOUND", "Родительская категория не найдена");
      }
    }

    return this.prisma.category.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description || null,
        parentId: dto.parentId || null,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  /**
   * Обновление существующей категории
   */
  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundError("CATEGORY_NOT_FOUND", "Категория не найдена");
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestError("INVALID_PARENT", "Категория не может быть родительской для самой себя");
      }
      if (dto.parentId !== null) {
        const parent = await this.prisma.category.findUnique({
          where: { id: dto.parentId },
        });
        if (!parent) {
          throw new NotFoundError("PARENT_CATEGORY_NOT_FOUND", "Родительская категория не найдена");
        }
      }
    }

    let slug = category.slug;
    if (dto.slug) {
      slug = slugify(dto.slug);
      if (slug !== category.slug) {
        const existing = await this.prisma.category.findUnique({ where: { slug } });
        if (existing) {
          throw new ConflictError("CATEGORY_SLUG_EXISTS", `Слаг '${slug}' уже занят другой категорией`);
        }
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title } : {}),
        slug,
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * Получение списка всех категорий со связями для админ-панели
   */
  async getCategoriesForAdmin() {
    return this.prisma.category.findMany({
      include: {
        parent: { select: { id: true, title: true, slug: true } },
        children: {
          orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
          select: {
            id: true,
            parentId: true,
            title: true,
            slug: true,
            description: true,
            displayOrder: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        _count: { select: { products: true } },
      },
      orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
    });
  }

  /**
   * Безопасное удаление категории (с проверкой привязанных товаров и подкатегорий)
   */
  async deleteCategory(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        children: { select: { id: true, title: true } },
        products: { select: { id: true, title: true }, take: 5 },
      },
    });

    if (!category) {
      throw new NotFoundError("CATEGORY_NOT_FOUND", "Категория не найдена");
    }

    if (category.products.length > 0) {
      throw new ConflictError(
        "CATEGORY_HAS_PRODUCTS",
        `Нельзя удалить категорию «${category.title}», так как к ней привязаны товары (${category.products.length}). Сначала перенесите товары в другую категорию или деактивируйте категорию.`
      );
    }

    if (category.children.length > 0) {
      throw new ConflictError(
        "CATEGORY_HAS_CHILDREN",
        `Нельзя удалить категорию «${category.title}», так как она содержит ${category.children.length} подкатегорий. Сначала удалите или переместите подкатегории.`
      );
    }

    return this.prisma.category.delete({
      where: { id },
    });
  }

  // ===========================================================================
  // АДМИНИСТРАТИВНЫЕ МЕТОДЫ: ВЫКРОЙКИ
  // ===========================================================================

  /**
   * Создание новой выкройки
   */
  async createProduct(dto: CreateProductDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundError("CATEGORY_NOT_FOUND", "Указанная категория не найдена");
    }

    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.title);

    const existingSlug = await this.prisma.product.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      throw new ConflictError("PRODUCT_SLUG_EXISTS", `Выкройка со слагом '${slug}' уже существует`);
    }

    return this.prisma.product.create({
      data: {
        title: dto.title,
        slug,
        categoryId: dto.categoryId,
        description: dto.description,
        shortDescription: dto.shortDescription || null,
        basePrice: new Prisma.Decimal(dto.basePrice),
        bundlePrice: dto.bundlePrice !== undefined && dto.bundlePrice !== null ? new Prisma.Decimal(dto.bundlePrice) : null,
        hasBundleOption: dto.hasBundleOption ?? true,
        discountPrice: dto.discountPrice !== undefined && dto.discountPrice !== null ? new Prisma.Decimal(dto.discountPrice) : null,
        discountFrom: dto.discountFrom ? new Date(dto.discountFrom) : null,
        discountUntil: dto.discountUntil ? new Date(dto.discountUntil) : null,
        isNew: dto.isNew ?? false,
        isBestseller: dto.isBestseller ?? false,
        isPopular: dto.isPopular ?? false,
        technicalDrawingUrl: dto.technicalDrawingUrl || null,
        videoUrl: dto.videoUrl || null,
        difficultyLevel: dto.difficultyLevel,
        fabricDetails: dto.fabricDetails ?? Prisma.JsonNull,
        isActive: dto.isActive ?? true,
      },
    });
  }

  /**
   * Редактирование выкройки
   */
  async updateProduct(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundError("PRODUCT_NOT_FOUND", "Выкройка не найдена");
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundError("CATEGORY_NOT_FOUND", "Указанная категория не найдена");
      }
    }

    let slug = product.slug;
    if (dto.slug) {
      slug = slugify(dto.slug);
      if (slug !== product.slug) {
        const existing = await this.prisma.product.findUnique({ where: { slug } });
        if (existing) {
          throw new ConflictError("PRODUCT_SLUG_EXISTS", `Слаг '${slug}' уже занят другой выкройкой`);
        }
      }
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title } : {}),
        slug,
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
        ...(dto.description ? { description: dto.description } : {}),
        ...(dto.shortDescription !== undefined ? { shortDescription: dto.shortDescription } : {}),
        ...(dto.basePrice !== undefined ? { basePrice: new Prisma.Decimal(dto.basePrice) } : {}),
        ...(dto.bundlePrice !== undefined
          ? { bundlePrice: dto.bundlePrice !== null ? new Prisma.Decimal(dto.bundlePrice) : null }
          : {}),
        ...(dto.hasBundleOption !== undefined ? { hasBundleOption: dto.hasBundleOption } : {}),
        ...(dto.discountPrice === null
          ? { discountPrice: null, discountFrom: null, discountUntil: null }
          : dto.discountPrice !== undefined
          ? { discountPrice: new Prisma.Decimal(dto.discountPrice) }
          : {}),
        ...(dto.discountFrom !== undefined && dto.discountPrice !== null
          ? { discountFrom: dto.discountFrom ? new Date(dto.discountFrom) : null }
          : {}),
        ...(dto.discountUntil !== undefined && dto.discountPrice !== null
          ? { discountUntil: dto.discountUntil ? new Date(dto.discountUntil) : null }
          : {}),
        ...(dto.isNew !== undefined ? { isNew: dto.isNew } : {}),
        ...(dto.isBestseller !== undefined ? { isBestseller: dto.isBestseller } : {}),
        ...(dto.isPopular !== undefined ? { isPopular: dto.isPopular } : {}),
        ...(dto.technicalDrawingUrl !== undefined ? { technicalDrawingUrl: dto.technicalDrawingUrl || null } : {}),
        ...(dto.videoUrl !== undefined ? { videoUrl: dto.videoUrl || null } : {}),
        ...(dto.difficultyLevel ? { difficultyLevel: dto.difficultyLevel } : {}),
        ...(dto.fabricDetails !== undefined
          ? { fabricDetails: dto.fabricDetails ?? Prisma.JsonNull }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    if (dto.hasBundleOption !== undefined) {
      const sizeAll = await this.prisma.size.findUnique({ where: { code: "ALL" } });
      if (sizeAll) {
        await this.prisma.productVariant.updateMany({
          where: { productId: id, sizeId: sizeAll.id },
          data: { isActive: dto.hasBundleOption },
        });
      }
    }

    return updated;
  }

  /**
   * Обновление, планирование или отмена скидки на выкройку
   */
  async updateProductDiscount(productId: string, dto: UpdateProductDiscountDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundError("PRODUCT_NOT_FOUND", "Выкройка не найдена");
    }

    if (dto.discountPrice === null) {
      return this.prisma.product.update({
        where: { id: productId },
        data: {
          discountPrice: null,
          discountFrom: null,
          discountUntil: null,
        },
      });
    }

    const basePriceNum = Number(product.basePrice);
    if (dto.discountPrice >= basePriceNum) {
      throw new BadRequestError("INVALID_DISCOUNT_PRICE", "Цена со скидкой должна быть меньше базовой цены");
    }

    const discountFromDate = dto.discountFrom ? new Date(dto.discountFrom) : null;
    const discountUntilDate = dto.discountUntil ? new Date(dto.discountUntil) : null;

    if (discountFromDate && discountUntilDate && discountFromDate > discountUntilDate) {
      throw new BadRequestError("INVALID_DATE_RANGE", "Дата начала скидки не может быть позже даты окончания");
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        discountPrice: new Prisma.Decimal(dto.discountPrice),
        discountFrom: discountFromDate,
        discountUntil: discountUntilDate,
      },
    });
  }

  /**
   * Публикация / снятие с публикации выкройки
   */
  async toggleProductStatus(id: string, isActive: boolean) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundError("PRODUCT_NOT_FOUND", "Выкройка не найдена");
    }

    return this.prisma.product.update({
      where: { id },
      data: { isActive },
    });
  }

  // ===========================================================================
  // АДМИНИСТРАТИВНЫЕ МЕТОДЫ: МАТРИЧНАЯ ГЕНЕРАЦИЯ ВАРИАНТОВ
  // ===========================================================================

  /**
   * Пакетная генерация матрицы вариантов выкройки (размеры x ростовки x форматы)
   */
  async batchGenerateVariants(productId: string, dto: BatchVariantsDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundError("PRODUCT_NOT_FOUND", "Выкройка не найдена");
    }

    const isUuid = (val: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    const rawSizes = (dto.sizeIds && dto.sizeIds.length > 0) ? dto.sizeIds : (dto.sizes || []);
    const rawHeights = (dto.heightIds && dto.heightIds.length > 0) ? dto.heightIds : (dto.heights || []);
    const rawFormats = (dto.formatIds && dto.formatIds.length > 0) ? dto.formatIds : (dto.formats || []);

    const sizeUuids = rawSizes.filter(isUuid);
    const sizeCodes = rawSizes.filter((s) => !isUuid(s));

    const heightUuids = rawHeights.filter(isUuid);
    const heightCodes = rawHeights.filter((h) => !isUuid(h));

    const formatUuids = rawFormats.filter(isUuid);
    const formatCodes = rawFormats.filter((f) => !isUuid(f));

    const sizeConditions: Prisma.SizeWhereInput[] = [];
    if (sizeUuids.length > 0) sizeConditions.push({ id: { in: sizeUuids } });
    if (sizeCodes.length > 0) sizeConditions.push({ code: { in: sizeCodes } });

    const heightConditions: Prisma.HeightWhereInput[] = [];
    if (heightUuids.length > 0) heightConditions.push({ id: { in: heightUuids } });
    if (heightCodes.length > 0) heightConditions.push({ code: { in: heightCodes } });

    const formatConditions: Prisma.FormatWhereInput[] = [];
    if (formatUuids.length > 0) formatConditions.push({ id: { in: formatUuids } });
    if (formatCodes.length > 0) formatConditions.push({ code: { in: formatCodes } });

    const [sizes, heights, formats] = await Promise.all([
      this.prisma.size.findMany({
        where: sizeConditions.length === 1 ? sizeConditions[0] : (sizeConditions.length > 1 ? { OR: sizeConditions } : { id: "none" }),
      }),
      this.prisma.height.findMany({
        where: {
          AND: [
            heightConditions.length === 1 ? heightConditions[0] : (heightConditions.length > 1 ? { OR: heightConditions } : { id: "none" }),
            { isActive: true },
          ],
        },
      }),
      this.prisma.format.findMany({
        where: {
          AND: [
            formatConditions.length === 1 ? formatConditions[0] : (formatConditions.length > 1 ? { OR: formatConditions } : { id: "none" }),
            { isActive: true },
          ],
        },
      }),
    ]);

    if (sizes.length === 0) {
      throw new NotFoundError("INVALID_SIZES", "Не найдены указанные размеры");
    }
    if (heights.length === 0) {
      throw new NotFoundError("INVALID_HEIGHTS", "Не найдены активные ростовки для генерации вариантов");
    }
    if (formats.length === 0) {
      throw new NotFoundError("INVALID_FORMATS", "Не найдены активные форматы для генерации вариантов");
    }

    const prefix = dto.skuPrefix || `LZ-${product.slug.toUpperCase().replace(/-/g, "").slice(0, 8)}`;

    let createdOrUpdatedCount = 0;

    for (const size of sizes) {
      for (const height of heights) {
        for (const format of formats) {
          const sku = `${prefix}-${size.code}-${height.code}-${format.code}`;

          let targetPriceOverride: Prisma.Decimal | null | undefined = undefined;

          if (dto.formatPrices) {
            const fpVal =
              dto.formatPrices[format.code] ??
              dto.formatPrices[format.id] ??
              dto.formatPrices[format.code.toLowerCase()];
            if (fpVal !== undefined) {
              targetPriceOverride = fpVal !== null ? new Prisma.Decimal(fpVal) : null;
            }
          } else if (dto.priceOverride !== undefined) {
            targetPriceOverride = dto.priceOverride !== null ? new Prisma.Decimal(dto.priceOverride) : null;
          }

          const updateData: Prisma.ProductVariantUpdateInput = {
            isActive: true,
          };
          if (targetPriceOverride !== undefined) {
            updateData.priceOverride = targetPriceOverride;
          }

          await this.prisma.productVariant.upsert({
            where: {
              product_size_height_format_unique: {
                productId,
                sizeId: size.id,
                heightId: height.id,
                formatId: format.id,
              },
            },
            update: updateData,
            create: {
              productId,
              sizeId: size.id,
              heightId: height.id,
              formatId: format.id,
              sku,
              priceOverride: targetPriceOverride !== undefined ? targetPriceOverride : null,
              isActive: true,
            },
          });

          createdOrUpdatedCount++;
        }
      }
    }

    // Обработка комплекта «Все размеры (комплект)» (ALL)
    const shouldGenerateBundle = dto.includeBundle !== undefined
      ? dto.includeBundle
      : Boolean(product.hasBundleOption && product.bundlePrice !== null);

    const sizeAll = await this.prisma.size.findUnique({ where: { code: "ALL" } });

    if (sizeAll) {
      if (shouldGenerateBundle) {
        for (const height of heights) {
          for (const format of formats) {
            const allSku = `${prefix}-ALL-${height.code}-${format.code}`;

            await this.prisma.productVariant.upsert({
              where: {
                product_size_height_format_unique: {
                  productId,
                  sizeId: sizeAll.id,
                  heightId: height.id,
                  formatId: format.id,
                },
              },
              update: {
                isActive: true,
              },
              create: {
                productId,
                sizeId: sizeAll.id,
                heightId: height.id,
                formatId: format.id,
                sku: allSku,
                priceOverride: null,
                isActive: true,
              },
            });

            createdOrUpdatedCount++;
          }
        }
      } else {
        // Если бандл отключен — деактивируем варианты ALL для указанных ростовок и форматов
        await this.prisma.productVariant.updateMany({
          where: {
            productId,
            sizeId: sizeAll.id,
            heightId: { in: heights.map((h) => h.id) },
            formatId: { in: formats.map((f) => f.id) },
          },
          data: { isActive: false },
        });
      }
    }

    return {
      productId,
      createdOrUpdatedCount,
      combinations: {
        sizesCount: sizes.length,
        heightsCount: heights.length,
        formatsCount: formats.length,
      },
    };
  }

  /**
   * Обновление цены отдельного варианта (priceOverride)
   * Если price === null, сбрасывается к базовой цене выкройки
   */
  async updateVariantPrice(productId: string, variantId: string, price: number | null) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        basePrice: true,
        discountPrice: true,
        discountFrom: true,
        discountUntil: true,
        bundlePrice: true,
        isActive: true,
      },
    });
    if (!product) {
      throw new NotFoundError("PRODUCT_NOT_FOUND", "Выкройка не найдена");
    }

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        size: true,
        height: true,
        format: true,
      },
    });

    if (!variant || variant.productId !== productId) {
      throw new NotFoundError("VARIANT_NOT_FOUND", "Вариант выкройки не найден для данного товара");
    }

    if (price !== null) {
      if (typeof price !== "number" || isNaN(price) || price <= 0) {
        throw new BadRequestError("INVALID_PRICE", "Цена должна быть положительным числом больше нуля");
      }
    }

    const updatedVariant = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        priceOverride: price !== null ? new Prisma.Decimal(price) : null,
      },
      include: {
        size: true,
        height: true,
        format: true,
      },
    });

    const isBundleVariant = updatedVariant.size?.code === "ALL";
    const pricing = calculateEffectivePrice(
      {
        basePrice: product.basePrice,
        discountPrice: product.discountPrice,
        discountFrom: product.discountFrom,
        discountUntil: product.discountUntil,
        bundlePrice: product.bundlePrice,
      },
      { isBundleVariant, priceOverride: updatedVariant.priceOverride }
    );

    return {
      variantId: updatedVariant.id,
      sku: updatedVariant.sku,
      productId: updatedVariant.productId,
      format: updatedVariant.format,
      size: updatedVariant.size,
      height: updatedVariant.height,
      priceOverride: updatedVariant.priceOverride !== null ? Number(updatedVariant.priceOverride) : null,
      isPriceOverridden: updatedVariant.priceOverride !== null,
      price: pricing.currentPrice,
      originalPrice: pricing.originalPrice,
    };
  }

  /**
   * Пакетное обновление цен вариантов для определенного формата (A4, PLOTTER_900 и т.д.)
   */
  async updateFormatPrices(
    productId: string,
    dto: { formatId?: string; formatCode?: string; price: number | null }
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, basePrice: true },
    });
    if (!product) {
      throw new NotFoundError("PRODUCT_NOT_FOUND", "Выкройка не найдена");
    }

    if (dto.price !== null && (typeof dto.price !== "number" || isNaN(dto.price) || dto.price <= 0)) {
      throw new BadRequestError("INVALID_PRICE", "Цена должна быть положительным числом больше нуля");
    }

    let format = null;
    if (dto.formatId) {
      format = await this.prisma.format.findUnique({ where: { id: dto.formatId } });
    } else if (dto.formatCode) {
      format = await this.prisma.format.findUnique({ where: { code: dto.formatCode } });
    }

    if (!format) {
      throw new NotFoundError("FORMAT_NOT_FOUND", "Формат выкройки не найден");
    }

    const updateRes = await this.prisma.productVariant.updateMany({
      where: {
        productId,
        formatId: format.id,
      },
      data: {
        priceOverride: dto.price !== null ? new Prisma.Decimal(dto.price) : null,
      },
    });

    return {
      productId,
      format: {
        id: format.id,
        code: format.code,
        label: format.label,
      },
      updatedCount: updateRes.count,
      priceOverride: dto.price !== null ? dto.price : null,
    };
  }

  // ===========================================================================
  // АДМИНИСТРАТИВНЫЕ МЕТОДЫ: ИЗОБРАЖЕНИЯ
  // ===========================================================================

  /**
   * Добавление фото в галерею выкройки
   */
  async addProductImage(productId: string, dto: AddProductImageDto) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundError("PRODUCT_NOT_FOUND", "Выкройка не найдена");
    }

    if (dto.isCover) {
      await this.prisma.productImage.updateMany({
        where: { productId, isCover: true },
        data: { isCover: false },
      });
    }

    return this.prisma.productImage.create({
      data: {
        productId,
        imageUrl: dto.imageUrl,
        altText: dto.altText || null,
        displayOrder: dto.displayOrder ?? 0,
        isCover: dto.isCover ?? false,
      },
    });
  }

  /**
   * Удаление фото из галереи выкройки
   */
  async deleteProductImage(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image) {
      throw new NotFoundError("IMAGE_NOT_FOUND", "Изображение не найдено у данной выкройки");
    }

    await this.prisma.productImage.delete({
      where: { id: imageId },
    });

    return { success: true };
  }

  // ===========================================================================
  // АДМИНИСТРАТИВНЫЕ МЕТОДЫ: СПРАВОЧНИК РАЗМЕРОВ (CRUD)
  // ===========================================================================

  /**
   * Получение всех размеров с количеством связанных вариантов
   */
  async getAllSizes() {
    const sizes = await this.prisma.size.findMany({
      orderBy: { displayOrder: "asc" },
      include: {
        _count: {
          select: { variants: true },
        },
      },
    });

    return sizes.map((s) => ({
      id: s.id,
      code: s.code,
      label: s.label,
      displayOrder: s.displayOrder,
      variantsCount: s._count.variants,
    }));
  }

  /**
   * Получение размера по ID
   */
  async getSizeById(id: string) {
    const size = await this.prisma.size.findUnique({
      where: { id },
      include: {
        _count: { select: { variants: true } },
      },
    });

    if (!size) {
      throw new NotFoundError("SIZE_NOT_FOUND", "Размер не найден");
    }

    return {
      id: size.id,
      code: size.code,
      label: size.label,
      displayOrder: size.displayOrder,
      variantsCount: size._count.variants,
    };
  }

  /**
   * Создание нового размера
   */
  async createSize(dto: CreateSizeDto) {
    const existing = await this.prisma.size.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictError("SIZE_CODE_EXISTS", `Размер с кодом '${dto.code}' уже существует`);
    }

    return this.prisma.size.create({
      data: {
        code: dto.code,
        label: dto.label,
        displayOrder: dto.displayOrder ?? 0,
      },
    });
  }

  /**
   * Обновление размера
   */
  async updateSize(id: string, dto: UpdateSizeDto) {
    const size = await this.prisma.size.findUnique({ where: { id } });
    if (!size) {
      throw new NotFoundError("SIZE_NOT_FOUND", "Размер не найден");
    }

    if (dto.code && dto.code !== size.code) {
      const existing = await this.prisma.size.findUnique({ where: { code: dto.code } });
      if (existing) {
        throw new ConflictError("SIZE_CODE_EXISTS", `Размер с кодом '${dto.code}' уже существует`);
      }
    }

    return this.prisma.size.update({
      where: { id },
      data: {
        ...(dto.code ? { code: dto.code } : {}),
        ...(dto.label ? { label: dto.label } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
      },
    });
  }

  /**
   * Безопасное удаление размера (только если нет привязанных вариантов)
   */
  async deleteSize(id: string) {
    const size = await this.prisma.size.findUnique({
      where: { id },
      include: {
        _count: { select: { variants: true } },
      },
    });

    if (!size) {
      throw new NotFoundError("SIZE_NOT_FOUND", "Размер не найден");
    }

    if (size._count.variants > 0) {
      throw new ConflictError(
        "SIZE_IN_USE",
        `Невозможно удалить размер '${size.code}', так как он используется в ${size._count.variants} вариантах выкроек`
      );
    }

    await this.prisma.size.delete({
      where: { id },
    });

    return { success: true, message: `Размер '${size.code}' успешно удален` };
  }

  // ===========================================================================
  // СПРАВОЧНИКИ: РОСТОВКИ (HEIGHTS)
  // ===========================================================================

  /**
   * Получение всех ростовок со счётчиком использования в вариантах
   */
  async getAllHeights(includeInactive: boolean = true) {
    const heights = await this.prisma.height.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { displayOrder: "asc" },
      include: {
        _count: {
          select: { variants: true },
        },
      },
    });

    return heights.map((h) => ({
      id: h.id,
      code: h.code,
      label: h.label,
      minHeight: h.minHeight,
      maxHeight: h.maxHeight,
      displayOrder: h.displayOrder,
      isActive: h.isActive,
      variantsCount: h._count.variants,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    }));
  }

  /**
   * Получение ростовки по ID
   */
  async getHeightById(id: string) {
    const height = await this.prisma.height.findUnique({
      where: { id },
      include: {
        _count: { select: { variants: true } },
      },
    });

    if (!height) {
      throw new NotFoundError("HEIGHT_NOT_FOUND", "Ростовка не найдена");
    }

    return {
      id: height.id,
      code: height.code,
      label: height.label,
      minHeight: height.minHeight,
      maxHeight: height.maxHeight,
      displayOrder: height.displayOrder,
      isActive: height.isActive,
      variantsCount: height._count.variants,
      createdAt: height.createdAt,
      updatedAt: height.updatedAt,
    };
  }

  /**
   * Создание новой ростовки
   */
  async createHeight(dto: CreateHeightDto) {
    const existing = await this.prisma.height.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictError("HEIGHT_CODE_EXISTS", `Ростовка с кодом '${dto.code}' уже существует`);
    }

    if (dto.minHeight != null && dto.maxHeight != null && dto.minHeight > dto.maxHeight) {
      throw new UnprocessableEntityError(
        "INVALID_HEIGHT_RANGE",
        "Нижняя граница роста не может превышать верхнюю границу"
      );
    }

    return this.prisma.height.create({
      data: {
        code: dto.code,
        label: dto.label,
        minHeight: dto.minHeight ?? null,
        maxHeight: dto.maxHeight ?? null,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  /**
   * Обновление ростовки
   */
  async updateHeight(id: string, dto: UpdateHeightDto) {
    const height = await this.prisma.height.findUnique({ where: { id } });
    if (!height) {
      throw new NotFoundError("HEIGHT_NOT_FOUND", "Ростовка не найдена");
    }

    if (dto.code && dto.code !== height.code) {
      const existing = await this.prisma.height.findUnique({ where: { code: dto.code } });
      if (existing) {
        throw new ConflictError("HEIGHT_CODE_EXISTS", `Ростовка с кодом '${dto.code}' уже существует`);
      }
    }

    const effectiveMin = dto.minHeight !== undefined ? dto.minHeight : height.minHeight;
    const effectiveMax = dto.maxHeight !== undefined ? dto.maxHeight : height.maxHeight;

    if (effectiveMin != null && effectiveMax != null && effectiveMin > effectiveMax) {
      throw new UnprocessableEntityError(
        "INVALID_HEIGHT_RANGE",
        "Нижняя граница роста не может превышать верхнюю границу"
      );
    }

    return this.prisma.height.update({
      where: { id },
      data: {
        ...(dto.code ? { code: dto.code } : {}),
        ...(dto.label ? { label: dto.label } : {}),
        ...(dto.minHeight !== undefined ? { minHeight: dto.minHeight } : {}),
        ...(dto.maxHeight !== undefined ? { maxHeight: dto.maxHeight } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * Переключение статуса активности ростовки
   */
  async toggleHeightActive(id: string, explicitIsActive?: boolean) {
    const height = await this.prisma.height.findUnique({ where: { id } });
    if (!height) {
      throw new NotFoundError("HEIGHT_NOT_FOUND", "Ростовка не найдена");
    }

    const nextState = explicitIsActive !== undefined ? explicitIsActive : !height.isActive;
    return this.prisma.height.update({
      where: { id },
      data: { isActive: nextState },
    });
  }

  /**
   * Безопасное удаление ростовки (только если не используется в вариантах)
   */
  async deleteHeight(id: string) {
    const height = await this.prisma.height.findUnique({
      where: { id },
      include: {
        _count: { select: { variants: true } },
      },
    });

    if (!height) {
      throw new NotFoundError("HEIGHT_NOT_FOUND", "Ростовка не найдена");
    }

    if (height._count.variants > 0) {
      throw new ConflictError(
        "HEIGHT_IN_USE",
        `Невозможно удалить ростовку '${height.code}', так как она используется в ${height._count.variants} вариантах выкроек. Рекомендуется деактивировать ростовку.`
      );
    }

    await this.prisma.height.delete({
      where: { id },
    });

    return { success: true, message: `Ростовка '${height.code}' успешно удалена` };
  }

  // ===========================================================================
  // СПРАВОЧНИКИ: ФОРМАТЫ ВЫКРОЕК (FORMATS)
  // ===========================================================================

  /**
   * Получение всех форматов со счётчиками использования в вариантах и товарах
   */
  async getAllFormats(includeInactive: boolean = true) {
    const formats = await this.prisma.format.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { displayOrder: "asc" },
      include: {
        _count: {
          select: { variants: true },
        },
      },
    });

    // Расчёт уникальных товаров для каждого формата
    const productCountsRaw = await this.prisma.productVariant.groupBy({
      by: ["formatId", "productId"],
    });
    const formatProductCountMap = new Map<string, number>();
    for (const row of productCountsRaw) {
      const current = formatProductCountMap.get(row.formatId) || 0;
      formatProductCountMap.set(row.formatId, current + 1);
    }

    return formats.map((f) => ({
      id: f.id,
      code: f.code,
      label: f.label,
      description: f.description,
      maxPrintWidth: f.maxPrintWidth,
      displayOrder: f.displayOrder,
      isActive: f.isActive,
      variantsCount: f._count.variants,
      productsCount: formatProductCountMap.get(f.id) || 0,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  }

  /**
   * Получение формата по ID
   */
  async getFormatById(id: string) {
    const format = await this.prisma.format.findUnique({
      where: { id },
      include: {
        _count: { select: { variants: true } },
      },
    });

    if (!format) {
      throw new NotFoundError("FORMAT_NOT_FOUND", "Формат не найден");
    }

    const productVariants = await this.prisma.productVariant.findMany({
      where: { formatId: id },
      distinct: ["productId"],
      select: { productId: true },
    });

    return {
      id: format.id,
      code: format.code,
      label: format.label,
      description: format.description,
      maxPrintWidth: format.maxPrintWidth,
      displayOrder: format.displayOrder,
      isActive: format.isActive,
      variantsCount: format._count.variants,
      productsCount: productVariants.length,
      createdAt: format.createdAt,
      updatedAt: format.updatedAt,
    };
  }

  /**
   * Создание нового формата выкроек
   */
  async createFormat(dto: CreateFormatDto) {
    const existing = await this.prisma.format.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictError("FORMAT_CODE_EXISTS", `Формат с кодом '${dto.code}' уже существует`);
    }

    return this.prisma.format.create({
      data: {
        code: dto.code,
        label: dto.label,
        description: dto.description ?? null,
        maxPrintWidth: dto.maxPrintWidth ?? null,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  /**
   * Обновление формата выкроек
   */
  async updateFormat(id: string, dto: UpdateFormatDto) {
    const format = await this.prisma.format.findUnique({ where: { id } });
    if (!format) {
      throw new NotFoundError("FORMAT_NOT_FOUND", "Формат не найден");
    }

    if (dto.code && dto.code !== format.code) {
      const existing = await this.prisma.format.findUnique({ where: { code: dto.code } });
      if (existing) {
        throw new ConflictError("FORMAT_CODE_EXISTS", `Формат с кодом '${dto.code}' уже существует`);
      }
    }

    return this.prisma.format.update({
      where: { id },
      data: {
        ...(dto.code ? { code: dto.code } : {}),
        ...(dto.label ? { label: dto.label } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.maxPrintWidth !== undefined ? { maxPrintWidth: dto.maxPrintWidth } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * Переключение статуса активности формата
   */
  async toggleFormatActive(id: string, explicitIsActive?: boolean) {
    const format = await this.prisma.format.findUnique({ where: { id } });
    if (!format) {
      throw new NotFoundError("FORMAT_NOT_FOUND", "Формат не найден");
    }

    const nextState = explicitIsActive !== undefined ? explicitIsActive : !format.isActive;
    return this.prisma.format.update({
      where: { id },
      data: { isActive: nextState },
    });
  }

  /**
   * Безопасное удаление формата (только если не используется в вариантах)
   */
  async deleteFormat(id: string) {
    const format = await this.prisma.format.findUnique({
      where: { id },
      include: {
        _count: { select: { variants: true } },
      },
    });

    if (!format) {
      throw new NotFoundError("FORMAT_NOT_FOUND", "Формат не найден");
    }

    if (format._count.variants > 0) {
      throw new ConflictError(
        "FORMAT_IN_USE",
        `Невозможно удалить формат '${format.code}', так как он используется в ${format._count.variants} вариантах выкроек. Рекомендуется деактивировать формат.`
      );
    }

    await this.prisma.format.delete({
      where: { id },
    });

    return { success: true, message: `Формат '${format.code}' успешно удален` };
  }

  // ===========================================================================
  // УПРАВЛЕНИЕ ГЛАВНОЙ СТРАНИЦЕЙ (HOMEPAGE CONFIG)
  // ===========================================================================

  /**
   * Получение конфигурации главной страницы
   * @param isPublic флаг публичного запроса (если true, фильтрует по датам и активности)
   */
  async getHomepageConfig(isPublic = true) {
    const records = await this.prisma.homepageConfig.findMany();
    const configMap: Record<string, any> = {};
    for (const r of records) {
      configMap[r.id] = r.data;
    }

    // Базовые настройки блока "Хит сезона"
    const heroRaw = configMap["hero_featured"] || {
      isEnabled: true,
      productId: null,
      badge: "Хит сезона • Точная посадка",
      title: "Платье миди «Аида» с запахом",
      subtitle: "Флагманская выкройка",
      description:
        "Профессиональные электронные лекала с точной градацией размеров (40–60), заложенными припусками на швы и подробными инструкциями по пошиву.",
      imageUrl:
        "https://susoqzykfmwivajdkvtb.storage.supabase.co/storage/v1/object/public/product-images/products/1cfe5f94-564b-40dc-81ed-f953f5b2239b/1794847456360-bec05e1f-ru8PR-XHAiuIkXL3bVXX2oM_o-VanPASlCx6yM0FfWCP-Qp5x55eVRXgVWp9KqdSPFAg3POjmFb40Z2Ipu4epBkBnu4SeeHi58AJxjASU2zUQRUMjnWkduOmVnzCv11CKnPjKfW5d7dmq2mA5M4nesPNzUIIgrvC0Je_fc1DeOvlTpbxl-Wn6DHufavuRicm.jpg",
      buttonText: "Смотреть выкройку →",
      buttonLink: "/catalog/plate-midi-aida-s-zapakhom",
      startDate: null,
      endDate: null,
    };

    // Расчет видимости с учетом дат публикации
    let isVisible = heroRaw.isEnabled !== false;
    const now = new Date();
    if (heroRaw.startDate && new Date(heroRaw.startDate) > now) {
      isVisible = false;
    }
    if (heroRaw.endDate && new Date(heroRaw.endDate) < now) {
      isVisible = false;
    }

    let resolvedProduct: any = null;
    if (heroRaw.productId) {
      try {
        const prod = await this.prisma.product.findUnique({
          where: { id: heroRaw.productId },
          include: {
            category: { select: { id: true, title: true, slug: true } },
            images: { orderBy: { displayOrder: "asc" } },
          },
        });
        if (prod && (!isPublic || prod.isActive)) {
          const cover =
            prod.images.find((i) => i.isCover)?.imageUrl ||
            prod.images[0]?.imageUrl ||
            null;
          const pricing = calculateEffectivePrice({
            basePrice: prod.basePrice,
            discountPrice: prod.discountPrice,
            discountFrom: prod.discountFrom,
            discountUntil: prod.discountUntil,
            bundlePrice: prod.bundlePrice,
          });
          resolvedProduct = {
            id: prod.id,
            title: prod.title,
            slug: prod.slug,
            basePrice: pricing.originalPrice,
            currentPrice: pricing.currentPrice,
            isDiscountActive: pricing.isDiscountActive,
            discountPercent: pricing.discountPercent,
            bundlePrice: prod.bundlePrice ? Number(prod.bundlePrice) : null,
            coverImage: cover,
            images: prod.images.map((i) => i.imageUrl),
            categoryTitle: prod.category?.title,
          };
        }
      } catch (e) {
        console.error("Error resolving hero product:", e);
      }
    }

    const finalHero = {
      isEnabled: heroRaw.isEnabled !== false,
      isVisible,
      productId: heroRaw.productId || null,
      badge: heroRaw.badge || "Хит сезона • Точная посадка",
      title: heroRaw.title || resolvedProduct?.title || "Платье миди «Аида» с запахом",
      subtitle: heroRaw.subtitle || "Флагманская выкройка",
      description:
        heroRaw.description ||
        "Профессиональные электронные лекала с точной градацией размеров (40–60), заложенными припусками на швы и подробными инструкциями по пошиву.",
      imageUrl:
        heroRaw.imageUrl ||
        resolvedProduct?.coverImage ||
        "https://susoqzykfmwivajdkvtb.storage.supabase.co/storage/v1/object/public/product-images/products/1cfe5f94-564b-40dc-81ed-f953f5b2239b/1794847456360-bec05e1f-ru8PR-XHAiuIkXL3bVXX2oM_o-VanPASlCx6yM0FfWCP-Qp5x55eVRXgVWp9KqdSPFAg3POjmFb40Z2Ipu4epBkBnu4SeeHi58AJxjASU2zUQRUMjnWkduOmVnzCv11CKnPjKfW5d7dmq2mA5M4nesPNzUIIgrvC0Je_fc1DeOvlTpbxl-Wn6DHufavuRicm.jpg",
      buttonText: heroRaw.buttonText || "Смотреть выкройку →",
      buttonLink:
        heroRaw.buttonLink ||
        (resolvedProduct?.slug
          ? `/catalog/${resolvedProduct.slug}`
          : "/catalog/plate-midi-aida-s-zapakhom"),
      startDate: heroRaw.startDate || null,
      endDate: heroRaw.endDate || null,
      basePrice: resolvedProduct?.currentPrice ?? 650,
      bundlePrice: resolvedProduct?.bundlePrice ?? 1290,
      product: resolvedProduct,
    };

    const newArrivalsRaw = configMap["new_arrivals"] || {
      isEnabled: true,
      title: "Новинки сезона",
      subtitle: "Свежие выкройки с безупречной посадкой",
    };

    const bestsellersRaw = configMap["bestsellers"] || {
      isEnabled: true,
      title: "Популярные выкройки",
      subtitle: "Выбор покупателей LEKALO ZHIIDE",
    };

    const promoBannerRaw = configMap["promo_banner"] || {
      isEnabled: true,
      title: "Создайте свой идеальный гардероб с LEKALO ZHIIDE",
      subtitle: "Цифровые лекала ресторанного и подиумного уровня",
      description:
        "В каталоге собраны платья, юбки, брюки, жакеты и костюмы с точной европейской градацией. Выбирайте выкройку и скачивайте PDF за 2 минуты.",
      badge: "Начните шить прямо сегодня",
      buttonText: "Перейти в каталог выкроек",
      buttonLink: "/catalog",
      imageUrl: null,
    };

    return {
      heroFeatured: finalHero,
      newArrivals: newArrivalsRaw,
      bestsellers: bestsellersRaw,
      promoBanner: promoBannerRaw,
    };
  }

  /**
   * Получение данных для панели администратора главной страницы
   */
  async getHomepageAdminData() {
    const [config, products] = await Promise.all([
      this.getHomepageConfig(false),
      this.prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          title: true,
          slug: true,
          basePrice: true,
          bundlePrice: true,
          discountPrice: true,
          category: { select: { title: true } },
          images: {
            orderBy: { displayOrder: "asc" },
            select: { imageUrl: true, isCover: true },
          },
        },
        orderBy: { title: "asc" },
      }),
    ]);

    const formattedProducts = products.map((p) => {
      const cover =
        p.images.find((i) => i.isCover)?.imageUrl || p.images[0]?.imageUrl || "";
      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        basePrice: Number(p.basePrice),
        bundlePrice: p.bundlePrice ? Number(p.bundlePrice) : null,
        categoryTitle: p.category?.title || "",
        coverImage: cover,
        images: p.images.map((i) => i.imageUrl),
      };
    });

    return {
      config,
      products: formattedProducts,
    };
  }

  /**
   * Обновление блока главной страницы
   */
  async updateHomepageBlock(blockId: string, payload: any) {
    const validBlocks = ["hero_featured", "new_arrivals", "bestsellers", "promo_banner"];
    if (!validBlocks.includes(blockId)) {
      throw new BadRequestError(
        "INVALID_BLOCK_ID",
        `Неизвестный блок главной страницы: ${blockId}. Разрешены: ${validBlocks.join(", ")}`
      );
    }

    const data = payload?.data !== undefined ? payload.data : payload;

    const existing = await this.prisma.homepageConfig.findUnique({
      where: { id: blockId },
    });

    const mergedData =
      existing?.data && typeof existing.data === "object"
        ? { ...(existing.data as object), ...data }
        : data;

    await this.prisma.homepageConfig.upsert({
      where: { id: blockId },
      create: {
        id: blockId,
        data: mergedData,
      },
      update: {
        data: mergedData,
        updatedAt: new Date(),
      },
    });

    return this.getHomepageConfig(false);
  }
}
