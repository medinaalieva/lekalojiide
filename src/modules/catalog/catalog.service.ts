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
} from "./catalog.dto";
import { slugify } from "../../utils/slug";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../../utils/errors";

export interface CategoryTreeItem {
  id: string;
  parentId: string | null;
  title: string;
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
        orderBy: { displayOrder: "asc" },
        select: { id: true, code: true, label: true },
      }),
      this.prisma.format.findMany({
        orderBy: { displayOrder: "asc" },
        select: { id: true, code: true, label: true, description: true },
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
    const limit = Math.min(50, Math.max(1, query.limit || 12));
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    // 1. Фильтр активности
    if (isPublic) {
      where.isActive = true;
    }

    // 2. Фильтрация по категории
    if (query.categorySlug) {
      const category = await this.prisma.category.findUnique({
        where: { slug: query.categorySlug },
        include: { children: { select: { id: true } } },
      });

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
      where.categoryId = query.categoryId;
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

    // 5. Фильтр по доступным размерам, ростовкам и форматам
    const variantWhere: Prisma.ProductVariantWhereInput = {
      isActive: true,
    };
    let hasVariantFilter = false;

    if (query.sizes) {
      const sizeList = query.sizes.split(",").map((s) => s.trim());
      variantWhere.size = {
        OR: [{ code: { in: sizeList } }, { id: { in: sizeList } }],
      };
      hasVariantFilter = true;
    }

    if (query.heights) {
      const heightList = query.heights.split(",").map((h) => h.trim());
      variantWhere.height = {
        OR: [{ code: { in: heightList } }, { id: { in: heightList } }],
      };
      hasVariantFilter = true;
    }

    if (query.formats) {
      const formatList = query.formats.split(",").map((f) => f.trim());
      variantWhere.format = {
        OR: [{ code: { in: formatList } }, { id: { in: formatList } }],
      };
      hasVariantFilter = true;
    }

    if (hasVariantFilter) {
      where.variants = { some: variantWhere };
    }

    // 6. Сортировка
    let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: "desc" };
    if (query.sort === "price_asc") {
      orderBy = { basePrice: "asc" };
    } else if (query.sort === "price_desc") {
      orderBy = { basePrice: "desc" };
    } else if (query.sort === "title_asc") {
      orderBy = { title: "asc" };
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

      return {
        id: product.id,
        title: product.title,
        slug: product.slug,
        shortDescription: product.shortDescription,
        basePrice: Number(product.basePrice),
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
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: {
          select: { id: true, title: true, slug: true },
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

    const variants = product.variants.map((v: any) => ({
      variantId: v.id,
      sku: v.sku,
      size: { id: v.size.id, code: v.size.code, label: v.size.label },
      height: { id: v.height.id, code: v.height.code, label: v.height.label },
      format: { id: v.format.id, code: v.format.code, label: v.format.label },
      price: v.priceOverride !== null ? Number(v.priceOverride) : Number(product.basePrice),
      currency: "KGS",
      isAvailable: v.isActive,
    }));

    return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      basePrice: Number(product.basePrice),
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
   * Получение вариантов конкретной выкройки
   */
  async getProductVariants(productId: string, isPublic = true) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, basePrice: true, isActive: true },
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
      },
      orderBy: [
        { size: { displayOrder: "asc" } },
        { height: { displayOrder: "asc" } },
        { format: { displayOrder: "asc" } },
      ],
    });

    return variants.map((v: any) => ({
      variantId: v.id,
      sku: v.sku,
      size: v.size,
      height: v.height,
      format: v.format,
      price: v.priceOverride !== null ? Number(v.priceOverride) : Number(product.basePrice),
      currency: "KGS",
      isAvailable: v.isActive,
    }));
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

    return this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title } : {}),
        slug,
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
        ...(dto.description ? { description: dto.description } : {}),
        ...(dto.shortDescription !== undefined ? { shortDescription: dto.shortDescription } : {}),
        ...(dto.basePrice !== undefined ? { basePrice: new Prisma.Decimal(dto.basePrice) } : {}),
        ...(dto.difficultyLevel ? { difficultyLevel: dto.difficultyLevel } : {}),
        ...(dto.fabricDetails !== undefined
          ? { fabricDetails: dto.fabricDetails ?? Prisma.JsonNull }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
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

    const [sizes, heights, formats] = await Promise.all([
      this.prisma.size.findMany({ where: { id: { in: dto.sizeIds } } }),
      this.prisma.height.findMany({ where: { id: { in: dto.heightIds } } }),
      this.prisma.format.findMany({ where: { id: { in: dto.formatIds } } }),
    ]);

    if (sizes.length !== dto.sizeIds.length) {
      throw new NotFoundError("INVALID_SIZES", "Один или несколько указанных размеров не найдены");
    }
    if (heights.length !== dto.heightIds.length) {
      throw new NotFoundError("INVALID_HEIGHTS", "Один или несколько указанных ростов не найдены");
    }
    if (formats.length !== dto.formatIds.length) {
      throw new NotFoundError("INVALID_FORMATS", "Один или несколько указанных форматов не найдены");
    }

    const prefix = dto.skuPrefix || `LZ-${product.slug.toUpperCase().replace(/-/g, "").slice(0, 8)}`;
    const priceOverride = dto.priceOverride !== undefined && dto.priceOverride !== null
      ? new Prisma.Decimal(dto.priceOverride)
      : null;

    let createdOrUpdatedCount = 0;

    for (const size of sizes) {
      for (const height of heights) {
        for (const format of formats) {
          const sku = `${prefix}-${size.code}-${height.code}-${format.code}`;

          await this.prisma.productVariant.upsert({
            where: {
              product_size_height_format_unique: {
                productId,
                sizeId: size.id,
                heightId: height.id,
                formatId: format.id,
              },
            },
            update: {
              priceOverride,
              isActive: true,
            },
            create: {
              productId,
              sizeId: size.id,
              heightId: height.id,
              formatId: format.id,
              sku,
              priceOverride,
              isActive: true,
            },
          });

          createdOrUpdatedCount++;
        }
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
}
