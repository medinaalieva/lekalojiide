"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "../../../../../lib/api";
import { Button } from "../../../../../components/ui/Button";
import { Badge } from "../../../../../components/ui/Badge";
import {
  ArrowLeft,
  Upload,
  Link as LinkIcon,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Star,
  Download,
  RefreshCw,
  Layers,
  X,
  FileCheck,
  Edit2,
  Eye,
  Filter,
  Check,
  Video,
  BookOpen,
  Tag,
} from "lucide-react";

interface ProductImage {
  id: string;
  imageUrl: string;
  altText: string | null;
  displayOrder: number;
  isCover: boolean;
  createdAt: string;
}

interface FileVersion {
  id: string;
  versionNumber: number;
  originalFileName: string;
  fileSizeBytes: number;
  checksumSha256: string;
  createdAt: string;
  changelog: string | null;
}

interface DigitalFile {
  id: string;
  title: string;
  fileType: string;
  isActive: boolean;
  currentVersionId: string | null;
  versions: FileVersion[];
}

interface ProductVariant {
  id: string;
  sku: string;
  priceOverride: number | null;
  isActive: boolean;
  size: { id: string; code: string; label: string };
  height: { id: string; code: string; label: string };
  format: { id: string; code: string; label: string };
  digitalFiles: DigitalFile[];
}

interface ProductInstructionItem {
  id: string;
  productId: string;
  title: string;
  fileName: string;
  fileSizeBytes: number;
  checksumSha256: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProductStorageDetails {
  id: string;
  title: string;
  slug: string;
  basePrice: number;
  bundlePrice: number | null;
  hasBundleOption: boolean;
  isActive: boolean;
  technicalDrawingUrl: string | null;
  videoUrl: string | null;
  category: { id: string; title: string; slug: string };
  images: ProductImage[];
  variants: ProductVariant[];
  instructions?: ProductInstructionItem[];
}

export interface BulkFileItem {
  id: string;
  file: File;
  fileName: string;
  fileSizeBytes: number;
  status:
    | "READY"
    | "WRONG_FILENAME"
    | "UNKNOWN_VARIANT"
    | "DUPLICATE"
    | "INVALID_PDF"
    | "ALREADY_EXISTS";
  statusText?: string;
  matchedVariant?: ProductVariant;
  expectedFileName?: string;
  allowOverwrite: boolean;
  serverResult?: {
    status: "SUCCESS" | "REJECTED";
    versionNumber?: number;
    errorCode?: string;
    errorMessage?: string;
  };
}

export default function ProductFilesPage({
  params,
}: {
  params?: { id: string };
}) {
  const routeParams = useParams();
  const searchParams = useSearchParams();
  const productId = (routeParams?.id as string) || (params as any)?.id || "";
  const tabQuery = searchParams?.get("tab");

  const [product, setProduct] = useState<ProductStorageDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"patterns" | "images" | "instructions">(
    tabQuery === "images" ? "images" : tabQuery === "instructions" ? "instructions" : "patterns"
  );

  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (tab === "images" || tab === "instructions" || tab === "patterns") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Matrix Filter State
  const [fileFilter, setFileFilter] = useState<"ALL" | "MISSING" | "HAS_FILE">("ALL");
  const [formatFilter, setFormatFilter] = useState<string>("ALL");
  const [heightFilter, setHeightFilter] = useState<string>("ALL");

  // Состояние загрузки изображения
  const [imageUploadType, setImageUploadType] = useState<"file" | "url">("file");
  const [imageFileBase64, setImageFileBase64] = useState<string>("");
  const [imageFileName, setImageFileName] = useState<string>("");
  const [imageContentType, setImageContentType] = useState<string>("");
  const [imageUrlInput, setImageUrlInput] = useState<string>("");
  const [imageIsCover, setImageIsCover] = useState<boolean>(false);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [imageMessage, setImageMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Состояние модального окна загрузки PDF
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [pdfUploadType, setPdfUploadType] = useState<"file" | "url">("file");
  const [pdfFileBase64, setPdfFileBase64] = useState<string>("");
  const [pdfFileName, setPdfFileName] = useState<string>("");
  const [pdfUrlInput, setPdfUrlInput] = useState<string>("");
  const [pdfChangelog, setPdfChangelog] = useState<string>("");
  const [isUploadingPdf, setIsUploadingPdf] = useState<boolean>(false);
  const [pdfMessage, setPdfMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [downloadingVersionId, setDownloadingVersionId] = useState<string | null>(null);

  // Состояние массовой загрузки (Bulk Upload - Stage 5.6)
  const [bulkFiles, setBulkFiles] = useState<BulkFileItem[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isBulkUploading, setIsBulkUploading] = useState<boolean>(false);
  const [bulkChangelog, setBulkChangelog] = useState<string>("");
  const [bulkReport, setBulkReport] = useState<{
    total: number;
    successful: number;
    failed: number;
  } | null>(null);

  // Состояние инструкций по пошиву (Stage 5.23)
  const [instructionTitle, setInstructionTitle] = useState<string>("Инструкция по пошиву и сборке модели");
  const [instructionFileBase64, setInstructionFileBase64] = useState<string>("");
  const [instructionFileName, setInstructionFileName] = useState<string>("");
  const [instructionFileSize, setInstructionFileSize] = useState<number>(0);
  const [isUploadingInstruction, setIsUploadingInstruction] = useState<boolean>(false);
  const [instructionMessage, setInstructionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testingInstructionId, setTestingInstructionId] = useState<string | null>(null);
  const [togglingInstructionId, setTogglingInstructionId] = useState<string | null>(null);
  const [deactivatingInstructionId, setDeactivatingInstructionId] = useState<string | null>(null);

  // Состояние дифференциальных цен (Stage 5.25)
  const [priceModalVariant, setPriceModalVariant] = useState<ProductVariant | null>(null);
  const [priceInputValue, setPriceInputValue] = useState<string>("");
  const [isSavingPrice, setIsSavingPrice] = useState<boolean>(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  const [isFormatPriceModalOpen, setIsFormatPriceModalOpen] = useState<boolean>(false);
  const [selectedFormatForPricing, setSelectedFormatForPricing] = useState<string>("");
  const [formatPriceInputValue, setFormatPriceInputValue] = useState<string>("");
  const [isSavingFormatPrices, setIsSavingFormatPrices] = useState<boolean>(false);
  const [formatPriceError, setFormatPriceError] = useState<string | null>(null);
  const [autoCanonicalRename, setAutoCanonicalRename] = useState<boolean>(true);

  // Unique formats for bulk price setting (Stage 5.25)
  const variants = product?.variants || [];
  const uniqueFormats = useMemo(() => {
    const map = new Map<string, { id: string; code: string; label?: string }>();
    variants.forEach((v) => {
      if (v.format && !map.has(v.format.id)) {
        map.set(v.format.id, v.format);
      }
    });
    return Array.from(map.values());
  }, [variants]);

  const handleSaveVariantPrice = async (variantId: string, price: number | null) => {
    setIsSavingPrice(true);
    setPriceError(null);
    try {
      const res = await api.patch<{ success: boolean; data: any }>(
        `/api/v1/admin/products/${productId}/variants/${variantId}/price`,
        { price }
      );
      if (res.success) {
        setPriceModalVariant(null);
        await fetchDetails();
      }
    } catch (err: any) {
      setPriceError(err?.message || "Ошибка при сохранении цены варианта");
    } finally {
      setIsSavingPrice(false);
    }
  };

  const handleSaveFormatPrices = async (formatId: string, price: number | null) => {
    setIsSavingFormatPrices(true);
    setFormatPriceError(null);
    try {
      const res = await api.patch<{ success: boolean; data: any }>(
        `/api/v1/admin/products/${productId}/variants/prices-by-format`,
        { formatId, price }
      );
      if (res.success) {
        setIsFormatPriceModalOpen(false);
        await fetchDetails();
      }
    } catch (err: any) {
      setFormatPriceError(err?.message || "Ошибка при сохранении цен по формату");
    } finally {
      setIsSavingFormatPrices(false);
    }
  };

  const fetchDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: ProductStorageDetails }>(
        `/api/v1/admin/storage/products/${productId}`
      );
      if (res.success && res.data) {
        setProduct(res.data);
      }
    } catch (err: any) {
      setError(err?.message || "Не удалось загрузить данные выкройки");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [productId]);

  // Обработка выбора изображения с диска
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageMessage({ type: "error", text: "Разрешены только форматы JPG, PNG и WebP" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setImageMessage({ type: "error", text: "Размер файла не должен превышать 10 МБ" });
      return;
    }

    setImageFileName(file.name);
    setImageContentType(file.type);

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageFileBase64(event.target?.result as string);
      setImageMessage(null);
    };
    reader.readAsDataURL(file);
  };

  // Обработка выбора файла инструкции (Stage 5.23)
  const handleInstructionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setInstructionMessage({ type: "error", text: "Разрешены только документы в формате PDF" });
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      setInstructionMessage({ type: "error", text: "Размер файла не должен превышать 30 МБ" });
      return;
    }

    setInstructionFileName(file.name);
    setInstructionFileSize(file.size);
    setInstructionMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      setInstructionFileBase64(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Загрузка / замена инструкции
  const handleUploadInstruction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instructionFileBase64) {
      setInstructionMessage({ type: "error", text: "Пожалуйста, выберите PDF-файл инструкции" });
      return;
    }

    setIsUploadingInstruction(true);
    setInstructionMessage(null);

    try {
      const res = await api.post<{ success: boolean; message: string }>(
        "/api/v1/admin/storage/upload-instruction",
        {
          productId,
          title: instructionTitle.trim() || "Инструкция по пошиву",
          fileBase64: instructionFileBase64,
          fileName: instructionFileName,
          contentType: "application/pdf",
        }
      );

      if (res.success) {
        setInstructionMessage({ type: "success", text: res.message || "Инструкция успешно сохранена!" });
        setInstructionFileBase64("");
        setInstructionFileName("");
        setInstructionFileSize(0);
        await fetchDetails();
      }
    } catch (err: any) {
      setInstructionMessage({ type: "error", text: err?.message || "Ошибка при сохранении инструкции" });
    } finally {
      setIsUploadingInstruction(false);
    }
  };

  // Переключение активности инструкции
  const handleToggleInstructionActive = async (instructionId: string) => {
    setTogglingInstructionId(instructionId);
    try {
      await api.patch(`/api/v1/admin/storage/instructions/${instructionId}/toggle-active`, {});
      await fetchDetails();
    } catch (err: any) {
      alert(`Ошибка: ${err?.message || "Не удалось изменить статус инструкции"}`);
    } finally {
      setTogglingInstructionId(null);
    }
  };

  // Тестовое скачивание инструкции администратором
  const handleTestDownloadInstruction = async (instructionId: string) => {
    setTestingInstructionId(instructionId);
    try {
      const res = await api.get<{ success: boolean; data: { downloadUrl: string; fileName: string } }>(
        `/api/v1/admin/storage/instructions/${instructionId}/download-test`
      );
      if (res.success && res.data?.downloadUrl) {
        window.open(res.data.downloadUrl, "_blank");
      }
    } catch (err: any) {
      alert(`Ошибка ссылки: ${err?.message || "Не удалось сгенерировать ссылку для скачивания"}`);
    } finally {
      setTestingInstructionId(null);
    }
  };

  // Безопасная деактивация инструкции
  const handleDeactivateInstruction = async (instructionId: string) => {
    if (!window.confirm("Деактивировать эту версию инструкции? Файл останется в архиве, но станет недоступным для покупателей.")) {
      return;
    }
    setDeactivatingInstructionId(instructionId);
    try {
      await api.delete(`/api/v1/admin/storage/instructions/${instructionId}`);
      await fetchDetails();
    } catch (err: any) {
      alert(`Ошибка: ${err?.message || "Не удалось деактивировать инструкцию"}`);
    } finally {
      setDeactivatingInstructionId(null);
    }
  };

  // Отправка нового фото в S3
  const handleUploadImageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImageMessage(null);
    setIsUploadingImage(true);

    try {
      const payload: any = {
        productId,
        isCover: imageIsCover,
      };

      if (imageUploadType === "file") {
        if (!imageFileBase64) {
          throw new Error("Пожалуйста, выберите файл изображения на компьютере");
        }
        payload.fileBase64 = imageFileBase64;
        payload.fileName = imageFileName;
        payload.contentType = imageContentType;
      } else {
        if (!imageUrlInput.trim()) {
          throw new Error("Пожалуйста, введите корректный URL изображения");
        }
        payload.url = imageUrlInput.trim();
      }

      await api.post("/api/v1/admin/storage/upload-image", payload);

      setImageMessage({ type: "success", text: "Изображение успешно загружено в хранилище!" });
      setImageFileBase64("");
      setImageFileName("");
      setImageUrlInput("");
      setImageIsCover(false);

      await fetchDetails();
    } catch (err: any) {
      setImageMessage({ type: "error", text: err?.message || "Ошибка загрузки изображения" });
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Удаление фото
  const handleDeleteImage = async (imageId: string) => {
    if (!confirm("Вы уверены, что хотите удалить это фото из хранилища и каталога?")) return;
    try {
      await api.delete(`/api/v1/admin/storage/images/${imageId}`);
      await fetchDetails();
    } catch (err: any) {
      alert(`Ошибка удаления: ${err?.message || "Действие отклонено"}`);
    }
  };

  // Назначение обложки
  const handleSetCover = async (imageId: string) => {
    try {
      await api.patch(`/api/v1/admin/storage/images/${imageId}/cover`, {});
      await fetchDetails();
    } catch (err: any) {
      alert(`Ошибка назначения обложки: ${err?.message || "Действие отклонено"}`);
    }
  };

  // Обработка выбора PDF с диска
  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setPdfMessage({ type: "error", text: "Разрешены только файлы формата PDF (.pdf)" });
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      setPdfMessage({ type: "error", text: "Размер файла не должен превышать 30 МБ" });
      return;
    }

    setPdfFileName(file.name);

    const expectedName = (product && selectedVariant)
      ? `${product.slug}-${selectedVariant.size?.code}-${selectedVariant.height?.code}-${selectedVariant.format?.code}.pdf`
      : "";

    if (expectedName && file.name.trim().toLowerCase() !== expectedName.toLowerCase() && !autoCanonicalRename) {
      setPdfMessage({
        type: "error",
        text: `Несоответствие имени файла! Выбран "${file.name}", но для этого варианта требуется "${expectedName}". Включите автопереименование или назовите файл по стандарту.`
      });
    } else {
      setPdfMessage(null);
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setPdfFileBase64(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Отправка PDF в приватный S3 бакет
  const handleUploadPdfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariant || !product) return;

    setPdfMessage(null);
    setIsUploadingPdf(true);

    const expectedName = `${product.slug}-${selectedVariant.size?.code}-${selectedVariant.height?.code}-${selectedVariant.format?.code}.pdf`;

    try {
      const payload: any = {
        variantId: selectedVariant.id,
        productId,
        changelog: pdfChangelog.trim() || undefined,
      };

      if (pdfUploadType === "file") {
        if (!pdfFileBase64) {
          throw new Error("Пожалуйста, выберите файл PDF на компьютере");
        }
        const effectiveName = autoCanonicalRename ? expectedName : pdfFileName.trim();
        if (effectiveName.toLowerCase() !== expectedName.toLowerCase()) {
          throw new Error(`Имя файла "${pdfFileName}" не соответствует выбранному варианту SKU (${selectedVariant.sku}). Ожидалось: "${expectedName}". Загрузка отклонена.`);
        }
        payload.fileBase64 = pdfFileBase64;
        payload.fileName = effectiveName;
        payload.contentType = "application/pdf";
      } else {
        if (!pdfUrlInput.trim()) {
          throw new Error("Пожалуйста, введите URL для скачивания PDF");
        }
        const urlFileName = pdfUrlInput.trim().split("/").pop()?.split("?")[0] || "";
        const effectiveName = autoCanonicalRename ? expectedName : urlFileName;
        if (effectiveName.toLowerCase() !== expectedName.toLowerCase()) {
          throw new Error(`Имя файла в URL "${urlFileName}" не соответствует ожидаемому "${expectedName}".`);
        }
        payload.url = pdfUrlInput.trim();
        payload.fileName = effectiveName;
      }

      await api.post("/api/v1/admin/storage/upload-pattern", payload);

      setPdfMessage({ type: "success", text: "PDF-выкройка успешно загружена в защищенное хранилище!" });
      setTimeout(() => {
        setSelectedVariant(null);
        setPdfFileBase64("");
        setPdfFileName("");
        setPdfUrlInput("");
        setPdfChangelog("");
        setPdfMessage(null);
      }, 1400);

      await fetchDetails();
    } catch (err: any) {
      setPdfMessage({ type: "error", text: err?.message || "Ошибка загрузки PDF" });
    } finally {
      setIsUploadingPdf(false);
    }
  };

  // Тестовое скачивание PDF администратором
  const handleTestDownload = async (variantId: string, versionId: string) => {
    setDownloadingVersionId(versionId);
    try {
      const res = await api.get<{ success: boolean; data: { downloadUrl: string } }>(
        `/api/v1/admin/storage/variants/${variantId}/files/${versionId}/download-test`
      );
      if (res.success && res.data?.downloadUrl) {
        window.open(res.data.downloadUrl, "_blank");
      }
    } catch (err: any) {
      alert(`Ошибка получения ссылки: ${err?.message || "Действие отклонено"}`);
    } finally {
      setDownloadingVersionId(null);
    }
  };

  // Удаление версии PDF
  const handleDeleteFileVersion = async (variantId: string, versionId: string) => {
    if (!confirm("Удалить этот PDF-файл из защищенного хранилища?")) return;
    try {
      await api.delete(`/api/v1/admin/storage/variants/${variantId}/files/${versionId}`);
      await fetchDetails();
    } catch (err: any) {
      alert(`Ошибка удаления: ${err?.message || "Действие отклонено"}`);
    }
  };

  // ---------------------------------------------------------------------------
  // МАССОВАЯ ЗАГРУЗКА (BULK PDF UPLOAD — STAGE 5.6)
  // ---------------------------------------------------------------------------

  const analyzeAndAddFiles = (incomingFiles: FileList | File[]) => {
    if (!product) return;
    const filesArray = Array.from(incomingFiles);
    if (filesArray.length === 0) return;

    setBulkReport(null);

    const existingNames = new Set(bulkFiles.map((b) => b.fileName));
    const newItems: BulkFileItem[] = [];

    const currentBatchNames = new Set<string>();
    const currentBatchVariantIds = new Set<string>();

    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      const fileName = file.name.trim();
      const id = `${fileName}_${Date.now()}_${i}`;

      // 1. Проверка формата и размера
      const isPdfExt = fileName.toLowerCase().endsWith(".pdf");
      const isZeroBytes = file.size === 0;
      const isTooLarge = file.size > 30 * 1024 * 1024;

      if (!isPdfExt) {
        newItems.push({
          id,
          file,
          fileName,
          fileSizeBytes: file.size,
          status: "INVALID_PDF",
          statusText: "Файл не является PDF (.pdf)",
          allowOverwrite: false,
        });
        continue;
      }

      if (isZeroBytes) {
        newItems.push({
          id,
          file,
          fileName,
          fileSizeBytes: file.size,
          status: "INVALID_PDF",
          statusText: "Пустой файл (0 байт)",
          allowOverwrite: false,
        });
        continue;
      }

      if (isTooLarge) {
        newItems.push({
          id,
          file,
          fileName,
          fileSizeBytes: file.size,
          status: "INVALID_PDF",
          statusText: "Превышен лимит 30 МБ",
          allowOverwrite: false,
        });
        continue;
      }

      // 2. Проверка дубликатов в очереди
      if (existingNames.has(fileName) || currentBatchNames.has(fileName)) {
        newItems.push({
          id,
          file,
          fileName,
          fileSizeBytes: file.size,
          status: "DUPLICATE",
          statusText: "Дубликат имени файла в списке",
          allowOverwrite: false,
        });
        continue;
      }
      currentBatchNames.add(fileName);

      // 3. Проверка соответствия слагу товара
      if (!fileName.toLowerCase().startsWith(product.slug.toLowerCase() + "-")) {
        newItems.push({
          id,
          file,
          fileName,
          fileSizeBytes: file.size,
          status: "WRONG_FILENAME",
          statusText: `Не начинается со слага "${product.slug}"`,
          allowOverwrite: false,
        });
        continue;
      }

      // 4. Поиск соответствующего варианта в каталоге
      const matchedVariant = product.variants?.find((v) => {
        const expectedName = `${product.slug}-${v.size?.code}-${v.height?.code}-${v.format?.code}.pdf`;
        return expectedName.toLowerCase() === fileName.toLowerCase();
      });

      if (!matchedVariant) {
        newItems.push({
          id,
          file,
          fileName,
          fileSizeBytes: file.size,
          status: "UNKNOWN_VARIANT",
          statusText: "Размер, рост или формат не найден среди вариантов товара",
          allowOverwrite: false,
        });
        continue;
      }

      // 5. Проверка повторной привязки к одному и тому же варианту
      if (currentBatchVariantIds.has(matchedVariant.id)) {
        newItems.push({
          id,
          file,
          fileName,
          fileSizeBytes: file.size,
          status: "DUPLICATE",
          statusText: `Повторная привязка к SKU "${matchedVariant.sku}"`,
          matchedVariant,
          allowOverwrite: false,
        });
        continue;
      }
      currentBatchVariantIds.add(matchedVariant.id);

      // 6. Проверка наличия существующего файла (ALREADY_EXISTS)
      const patternFile =
        matchedVariant.digitalFiles?.find((f) => f.fileType === "PATTERN" && f.isActive) ||
        matchedVariant.digitalFiles?.[0];
      const existingVersion = patternFile?.versions?.[0];

      const expectedFileName = `${product.slug}-${matchedVariant.size?.code}-${matchedVariant.height?.code}-${matchedVariant.format?.code}.pdf`;

      if (existingVersion) {
        newItems.push({
          id,
          file,
          fileName,
          fileSizeBytes: file.size,
          status: "ALREADY_EXISTS",
          statusText: `Уже загружена v${existingVersion.versionNumber}`,
          matchedVariant,
          expectedFileName,
          allowOverwrite: false,
        });
      } else {
        newItems.push({
          id,
          file,
          fileName,
          fileSizeBytes: file.size,
          status: "READY",
          statusText: "Готов к загрузке",
          matchedVariant,
          expectedFileName,
          allowOverwrite: false,
        });
      }
    }

    setBulkFiles((prev) => [...prev, ...newItems]);
  };

  const handleRemoveBulkFile = (id: string) => {
    setBulkFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleToggleItemOverwrite = (id: string) => {
    setBulkFiles((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, allowOverwrite: !item.allowOverwrite } : item
      )
    );
  };

  const handleToggleAllOverwrite = (checked: boolean) => {
    setBulkFiles((prev) =>
      prev.map((item) =>
        item.status === "ALREADY_EXISTS" ? { ...item, allowOverwrite: checked } : item
      )
    );
  };

  const handleClearBulkList = () => {
    setBulkFiles([]);
    setBulkReport(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      analyzeAndAddFiles(e.dataTransfer.files);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error("Ошибка чтения файла"));
      reader.readAsDataURL(file);
    });
  };

  const handleStartBulkUpload = async () => {
    if (!product) return;

    // В партию включаются файлы READY и подтвержденные ALREADY_EXISTS
    const validItems = bulkFiles.filter(
      (item) => item.status === "READY" || (item.status === "ALREADY_EXISTS" && item.allowOverwrite)
    );

    if (validItems.length === 0) {
      alert("Нет готовых к отправке файлов. Ошибочные файлы не будут загружены.");
      return;
    }

    if (validItems.length > 50) {
      alert("В одной партии разрешено максимум 50 файлов. Удалите часть файлов.");
      return;
    }

    setIsBulkUploading(true);
    setBulkReport(null);

    try {
      const uploadPayloadItems = await Promise.all(
        validItems.map(async (item) => {
          const base64 = await readFileAsBase64(item.file);
          return {
            fileName: item.expectedFileName || item.fileName,
            fileBase64: base64,
            variantId: item.matchedVariant?.id,
            allowOverwrite: item.allowOverwrite,
            changelog: bulkChangelog.trim() || undefined,
          };
        })
      );

      const res = await api.post<{
        success: boolean;
        data: {
          total: number;
          successful: number;
          failed: number;
          results: Array<{
            fileName: string;
            variantId?: string;
            sku?: string;
            status: "SUCCESS" | "REJECTED";
            versionNumber?: number;
            errorCode?: string;
            errorMessage?: string;
          }>;
        };
      }>("/api/v1/admin/storage/upload-patterns-bulk", {
        productId: product.id,
        items: uploadPayloadItems,
      });

      if (res.success && res.data) {
        setBulkReport({
          total: res.data.total,
          successful: res.data.successful,
          failed: res.data.failed,
        });

        const serverResultsMap = new Map<string, any>();
        for (const r of res.data.results) {
          serverResultsMap.set(r.fileName, r);
        }

        setBulkFiles((prev) =>
          prev.map((item) => {
            const serverRes = serverResultsMap.get(item.fileName);
            if (serverRes) {
              return {
                ...item,
                serverResult: serverRes,
              };
            }
            return item;
          })
        );

        await fetchDetails();
      }
    } catch (err: any) {
      alert(`Ошибка массовой загрузки: ${err?.message || "Действие отклонено"}`);
    } finally {
      setIsBulkUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-atelier-muted space-y-2">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand-700" />
        <p>Загрузка менеджера файлов и матрицы вариантов...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
        <div className="text-red-800 font-semibold">{error || "Выкройка не найдена"}</div>
        <Link href="/admin/products">
          <Button variant="outline" size="sm">Вернуться к списку выкроек</Button>
        </Link>
      </div>
    );
  }

  // Bundle Completeness Analysis
  const totalVariants = variants.length;
  const variantsWithFile = variants.filter((v) => {
    const file = v.digitalFiles?.find((f) => f.fileType === "PATTERN" && f.isActive) || v.digitalFiles?.[0];
    return !!file?.versions?.[0];
  });
  const variantsMissingFile = variants.filter((v) => {
    const file = v.digitalFiles?.find((f) => f.fileType === "PATTERN" && f.isActive) || v.digitalFiles?.[0];
    return !file?.versions?.[0];
  });

  const isBundleComplete = totalVariants > 0 && variantsMissingFile.length === 0;
  const bundleCompletionPercent = totalVariants > 0
    ? Math.round((variantsWithFile.length / totalVariants) * 100)
    : 0;

  // Filtered variants for table
  const filteredVariants = variants.filter((v) => {
    const file = v.digitalFiles?.find((f) => f.fileType === "PATTERN" && f.isActive) || v.digitalFiles?.[0];
    const hasFile = !!file?.versions?.[0];

    if (fileFilter === "MISSING" && hasFile) return false;
    if (fileFilter === "HAS_FILE" && !hasFile) return false;
    if (formatFilter !== "ALL" && v.format?.code !== formatFilter) return false;
    if (heightFilter !== "ALL" && v.height?.code !== heightFilter) return false;

    return true;
  });

  // Bulk upload counts (Stage 5.6)
  const readyCount = bulkFiles.filter((f) => f.status === "READY").length;
  const existsCount = bulkFiles.filter((f) => f.status === "ALREADY_EXISTS").length;
  const errorCount = bulkFiles.filter((f) =>
    ["WRONG_FILENAME", "UNKNOWN_VARIANT", "DUPLICATE", "INVALID_PDF"].includes(f.status)
  ).length;
  const confirmedCount = bulkFiles.filter(
    (f) => f.status === "ALREADY_EXISTS" && f.allowOverwrite
  ).length;
  const totalEligible = readyCount + confirmedCount;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Шапка карточки товара */}
      <div className="bg-white border border-atelier-border rounded-sm p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-3 text-xs mb-2">
            <Link
              href="/admin/products"
              className="text-atelier-muted hover:text-brand-950 flex items-center"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Каталог
            </Link>
            <span className="text-atelier-border">/</span>
            <Link
              href={`/admin/products/${productId}/edit`}
              className="text-brand-700 hover:text-brand-900 flex items-center font-medium"
            >
              <Edit2 className="w-3.5 h-3.5 mr-1" />
              Редактировать параметры
            </Link>
          </div>

          <div className="flex items-center space-x-3">
            <h1 className="font-serif text-2xl font-bold text-brand-950">
              {product.title}
            </h1>
            <Badge variant={product.isActive ? "success" : "neutral"}>
              {product.isActive ? "Опубликована" : "В черновиках"}
            </Badge>
          </div>

          <p className="text-xs text-atelier-muted">
            Категория: <span className="text-brand-950 font-medium">{product.category?.title}</span> •
            Slug: <code className="bg-atelier-surface px-1.5 py-0.5 rounded text-[11px] font-mono">{product.slug}</code> •
            Базовая цена: <span className="font-semibold text-brand-950">{Number(product.basePrice).toLocaleString("ru-RU")} KGS</span>
            {product.bundlePrice && (
              <> • Комплект ALL: <span className="font-semibold text-brand-950">{Number(product.bundlePrice).toLocaleString("ru-RU")} KGS</span></>
            )}
          </p>
        </div>

        {/* Переключатель вкладок */}
        <div className="flex border border-atelier-border rounded-sm p-1 bg-atelier-surface shrink-0">
          <button
            onClick={() => setActiveTab("patterns")}
            className={`min-h-[44px] sm:min-h-0 px-4 py-2 text-xs font-semibold rounded-sm transition-all flex items-center space-x-1.5 ${
              activeTab === "patterns"
                ? "bg-white text-brand-950 shadow-sm"
                : "text-atelier-muted hover:text-brand-950"
            }`}
          >
            <FileText className="w-4 h-4 text-brand-700" />
            <span>PDF-выкройки ({variantsWithFile.length}/{totalVariants})</span>
          </button>
          <button
            onClick={() => setActiveTab("images")}
            className={`min-h-[44px] sm:min-h-0 px-4 py-2 text-xs font-semibold rounded-sm transition-all flex items-center space-x-1.5 ${
              activeTab === "images"
                ? "bg-white text-brand-950 shadow-sm"
                : "text-atelier-muted hover:text-brand-950"
            }`}
          >
            <ImageIcon className="w-4 h-4 text-brand-700" />
            <span>Фотографии ({product.images?.length || 0})</span>
          </button>
          <button
            onClick={() => setActiveTab("instructions")}
            className={`min-h-[44px] sm:min-h-0 px-4 py-2 text-xs font-semibold rounded-sm transition-all flex items-center space-x-1.5 ${
              activeTab === "instructions"
                ? "bg-white text-brand-950 shadow-sm"
                : "text-atelier-muted hover:text-brand-950"
            }`}
          >
            <BookOpen className="w-4 h-4 text-brand-700" />
            <span>Инструкции ({product.instructions?.length || 0})</span>
          </button>
        </div>
      </div>

      {/* ВКЛАДКА 1: PDF-ВЫКРОЙКИ И МАТРИЦА */}
      {activeTab === "patterns" && (
        <div className="space-y-6">
          {/* ИНДИКАТОР ГОТОВНОСТИ КОМПЛЕКТА ALL */}
          {product.hasBundleOption && totalVariants > 0 && (
            <div
              className={`p-5 rounded-sm border transition-all ${
                isBundleComplete
                  ? "bg-emerald-50/80 border-emerald-300 text-emerald-950"
                  : "bg-amber-50/90 border-amber-300 text-amber-950"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start space-x-3">
                  {isBundleComplete ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h3 className="font-serif font-bold text-sm">
                      {isBundleComplete
                        ? "Комплект ALL полностью укомплектован и готов к продаже"
                        : "Комплект ALL не укомплектован! Часть файлов отсутствует"}
                    </h3>
                    <p className="text-xs mt-0.5 opacity-90">
                      {isBundleComplete
                        ? `Все ${totalVariants} вариантов имеют загруженные PDF-файлы. При покупке комплекта клиент мгновенно получит полный доступ.`
                        : `Загружено файлов: ${variantsWithFile.length} из ${totalVariants} (${bundleCompletionPercent}%). Не хватает: ${variantsMissingFile.length} файлов.`}
                    </p>
                    {!isBundleComplete && (
                      <div className="mt-2 text-[11px] font-mono flex flex-wrap gap-1 items-center">
                        <span className="font-sans font-semibold">Требуется загрузить:</span>
                        {variantsMissingFile.slice(0, 6).map((v) => (
                          <span
                            key={v.id}
                            className="bg-white/80 border border-amber-300 px-1.5 py-0.5 rounded text-amber-900"
                          >
                            Р-р {v.size?.code} ({v.height?.code}, {v.format?.code})
                          </span>
                        ))}
                        {variantsMissingFile.length > 6 && (
                          <span className="text-amber-800 font-sans">
                            и ещё {variantsMissingFile.length - 6}...
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center space-x-2">
                  {!isBundleComplete && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setFileFilter("MISSING")}
                      className="bg-white text-xs border-amber-300 text-amber-950 hover:bg-amber-100"
                    >
                      Показать недостающие ({variantsMissingFile.length})
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* СЕКЦИЯ МАССОВОЙ ЗАГРУЗКИ (BULK UPLOAD — STAGE 5.6) */}
          <div className="bg-white border border-atelier-border rounded-sm p-6 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-atelier-border pb-4">
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="font-serif text-lg font-bold text-brand-950 flex items-center space-x-2">
                    <Upload className="w-5 h-5 text-brand-700" />
                    <span>Массовая загрузка PDF-выкроек (Bulk Upload)</span>
                  </h2>
                  <span className="text-[11px] font-mono bg-brand-50 text-brand-900 border border-brand-200 px-2 py-0.5 rounded">
                    Партия до 50 файлов • макс. 150 МБ
                  </span>
                </div>
                <p className="text-xs text-atelier-muted mt-1">
                  Перетащите несколько PDF-файлов или выберите их на диске. Система автоматически сопоставит размеры, ростовки и форматы по каноническому стандарту.
                </p>
              </div>

              {bulkFiles.length > 0 && (
                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleClearBulkList}
                    disabled={isBulkUploading}
                    className="text-xs text-atelier-muted hover:text-red-700 border-atelier-border"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Очистить список
                  </Button>
                </div>
              )}
            </div>

            {/* Зона Drag-and-Drop */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => {
                const el = document.getElementById("bulk-file-input");
                if (el) el.click();
              }}
              className={`border-2 border-dashed rounded-sm p-6 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-brand-600 bg-brand-50/80 scale-[1.005]"
                  : "border-atelier-border hover:border-brand-400 bg-atelier-surface/30"
              }`}
            >
              <input
                id="bulk-file-input"
                type="file"
                multiple
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    analyzeAndAddFiles(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
              <div className="max-w-md mx-auto space-y-2 pointer-events-none">
                <Upload className="w-8 h-8 mx-auto text-brand-700 stroke-1" />
                <p className="text-xs font-semibold text-brand-950">
                  {isDragging ? "Отпустите файлы для анализа" : "Перетащите PDF-выкройки сюда или нажмите для выбора"}
                </p>
                <p className="text-[11px] text-atelier-muted font-mono">
                  Формат: {product.slug}-&#123;size&#125;-&#123;height&#125;-&#123;format&#125;.pdf (например, {product.slug}-42-164-170-A4.pdf)
                </p>
              </div>
            </div>

            {/* Итоговый отчет о пакетной загрузке от сервера */}
            {bulkReport && (
              <div
                className={`p-4 rounded-sm border text-xs flex items-start space-x-3 ${
                  bulkReport.failed === 0
                    ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                    : bulkReport.successful > 0
                    ? "bg-amber-50 border-amber-300 text-amber-950"
                    : "bg-red-50 border-red-300 text-red-950"
                }`}
              >
                {bulkReport.failed === 0 ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <div className="font-semibold text-sm">
                    Результат партии: успешно {bulkReport.successful} из {bulkReport.total} файлов
                    {bulkReport.failed > 0 && ` (${bulkReport.failed} отклонено)`}
                  </div>
                  <p className="text-[11px] opacity-90">
                    {bulkReport.failed === 0
                      ? "Все файлы проверены и сохранены в приватный бакет S3. Матрица вариантов обновлена."
                      : "Часть файлов была отклонена сервером из-за несовпадения структуры или имени. Успешные файлы зафиксированы."}
                  </p>
                </div>
              </div>
            )}

            {/* Таблица предварительного просмотра и действий */}
            {bulkFiles.length > 0 && (
              <div className="space-y-4">
                {/* Сводная статистика и панель действий */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-atelier-surface p-3 rounded-sm border border-atelier-border text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold text-brand-950">
                      Выбрано: {bulkFiles.length}
                    </span>
                    <span className="text-emerald-700 font-medium">
                      Готовы: {readyCount}
                    </span>
                    {existsCount > 0 && (
                      <span className="text-amber-700 font-medium">
                        Уже загружены: {existsCount} ({confirmedCount} подтв.)
                      </span>
                    )}
                    {errorCount > 0 && (
                      <span className="text-red-700 font-medium">
                        Ошибки: {errorCount}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {existsCount > 0 && (
                      <label className="flex items-center space-x-1.5 text-[11px] text-amber-950 cursor-pointer bg-amber-50 px-2 py-1 rounded border border-amber-200">
                        <input
                          type="checkbox"
                          checked={bulkFiles.filter((f) => f.status === "ALREADY_EXISTS").every((f) => f.allowOverwrite)}
                          onChange={(e) => handleToggleAllOverwrite(e.target.checked)}
                          className="rounded text-brand-900 focus:ring-brand-900"
                        />
                        <span>Заменить все существующие</span>
                      </label>
                    )}

                    <Button
                      size="sm"
                      onClick={handleStartBulkUpload}
                      disabled={isBulkUploading || totalEligible === 0}
                      className="bg-brand-900 text-white hover:bg-brand-950 text-xs px-3 py-1.5 h-auto shadow-sm"
                    >
                      {isBulkUploading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Загрузка партии в S3...
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5 mr-1.5" />
                          Загрузить проверенные файлы ({totalEligible})
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Поле комментария к пакету */}
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-atelier-muted shrink-0">Комментарий к версии:</span>
                  <input
                    type="text"
                    value={bulkChangelog}
                    onChange={(e) => setBulkChangelog(e.target.value)}
                    placeholder="Например: Пакетный релиз выкроек v1 от конструктора"
                    className="flex-1 px-3 py-1.5 border border-atelier-border rounded-sm text-xs bg-white focus:outline-none focus:border-brand-700 font-mono"
                  />
                </div>

                {/* Таблица файлов */}
                <div className="overflow-x-auto border border-atelier-border rounded-sm">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-atelier-surface border-b border-atelier-border text-atelier-muted font-mono uppercase text-[10px]">
                        <th className="py-2.5 px-3">Файл</th>
                        <th className="py-2.5 px-3">Найденный вариант</th>
                        <th className="py-2.5 px-3">Проверка / Статус</th>
                        <th className="py-2.5 px-3 text-right">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-atelier-border">
                      {bulkFiles.map((item) => {
                        return (
                          <tr
                            key={item.id}
                            className={`transition-colors ${
                              item.serverResult?.status === "SUCCESS"
                                ? "bg-emerald-50/30"
                                : item.serverResult?.status === "REJECTED"
                                ? "bg-red-50/30"
                                : item.status === "READY"
                                ? "hover:bg-emerald-50/10"
                                : item.status === "ALREADY_EXISTS"
                                ? "bg-amber-50/20"
                                : "bg-red-50/20"
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              <div className="font-mono text-xs font-medium text-brand-950 flex items-center space-x-1.5">
                                <FileText className="w-3.5 h-3.5 text-atelier-muted shrink-0" />
                                <span title={item.fileName}>{item.fileName}</span>
                              </div>
                              <div className="text-[10px] text-atelier-muted">
                                {Math.round(item.fileSizeBytes / 1024)} КБ
                              </div>
                            </td>

                            <td className="py-2.5 px-3">
                              {item.matchedVariant ? (
                                <div className="space-y-0.5">
                                  <div className="font-medium text-brand-950">
                                    Р-р {item.matchedVariant.size?.code} ({item.matchedVariant.height?.code} см, {item.matchedVariant.format?.code})
                                  </div>
                                  <div className="text-[10px] font-mono text-atelier-muted">
                                    {item.matchedVariant.sku}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[11px] text-red-600 font-mono italic">
                                  Вариант не определен
                                </span>
                              )}
                            </td>

                            <td className="py-2.5 px-3">
                              {/* Серверный результат, если партия уже отправлена */}
                              {item.serverResult ? (
                                item.serverResult.status === "SUCCESS" ? (
                                  <span className="inline-flex items-center text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                                    ✓ Загружен (v{item.serverResult.versionNumber})
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-[10px] font-semibold text-red-800 bg-red-100 px-2 py-0.5 rounded" title={item.serverResult.errorMessage}>
                                    ✕ Отклонен: {item.serverResult.errorCode}
                                  </span>
                                )
                              ) : (
                                /* Клиентский статус предварительной проверки */
                                <div>
                                  {item.status === "READY" && (
                                    <span className="inline-flex items-center text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                                      READY
                                    </span>
                                  )}
                                  {item.status === "ALREADY_EXISTS" && (
                                    <span className="inline-flex items-center text-[10px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                                      ALREADY_EXISTS
                                    </span>
                                  )}
                                  {item.status === "WRONG_FILENAME" && (
                                    <span className="inline-flex items-center text-[10px] font-semibold text-red-800 bg-red-100 px-2 py-0.5 rounded">
                                      WRONG_FILENAME
                                    </span>
                                  )}
                                  {item.status === "UNKNOWN_VARIANT" && (
                                    <span className="inline-flex items-center text-[10px] font-semibold text-red-800 bg-red-100 px-2 py-0.5 rounded">
                                      UNKNOWN_VARIANT
                                    </span>
                                  )}
                                  {item.status === "DUPLICATE" && (
                                    <span className="inline-flex items-center text-[10px] font-semibold text-orange-800 bg-orange-100 px-2 py-0.5 rounded">
                                      DUPLICATE
                                    </span>
                                  )}
                                  {item.status === "INVALID_PDF" && (
                                    <span className="inline-flex items-center text-[10px] font-semibold text-red-800 bg-red-100 px-2 py-0.5 rounded">
                                      INVALID_PDF
                                    </span>
                                  )}
                                  {item.statusText && (
                                    <div className="text-[10px] text-atelier-muted mt-0.5">
                                      {item.statusText}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end space-x-2">
                                {item.status === "ALREADY_EXISTS" && !item.serverResult && (
                                  <label className="flex items-center space-x-1 text-[11px] text-amber-900 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={item.allowOverwrite}
                                      onChange={() => handleToggleItemOverwrite(item.id)}
                                      className="rounded text-brand-900 focus:ring-brand-900"
                                    />
                                    <span>Заменить</span>
                                  </label>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleRemoveBulkFile(item.id)}
                                  disabled={isBulkUploading}
                                  className="text-atelier-muted hover:text-red-700 p-1"
                                  title="Удалить из списка"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Фильтры матрицы и таблица вариантов */}
          <div className="bg-white border border-atelier-border rounded-sm p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-atelier-border pb-4">
              <div>
                <h2 className="font-serif text-lg font-bold text-brand-950 flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-brand-700" />
                  <span>Матрица PDF-файлов выкроек</span>
                </h2>
                <p className="text-xs text-atelier-muted">
                  Защищенный приватный бакет <code>pattern-files</code>. Файлы отдаются только авторизованным покупателям по защищенным ссылкам.
                </p>
              </div>

              {/* Быстрые фильтры */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Статус файла */}
                <div className="flex flex-wrap sm:flex-nowrap rounded-sm border border-atelier-border p-0.5 bg-atelier-surface gap-1">
                  <button
                    onClick={() => setFileFilter("ALL")}
                    className={`min-h-[44px] px-3.5 py-2 sm:min-h-0 sm:py-1 rounded-sm text-xs sm:text-[11px] font-semibold transition-colors flex items-center justify-center ${
                      fileFilter === "ALL" ? "bg-white text-brand-950 shadow-sm" : "text-atelier-muted"
                    }`}
                  >
                    Все ({totalVariants})
                  </button>
                  <button
                    onClick={() => setFileFilter("MISSING")}
                    className={`min-h-[44px] px-3.5 py-2 sm:min-h-0 sm:py-1 rounded-sm text-xs sm:text-[11px] font-semibold transition-colors flex items-center justify-center ${
                      fileFilter === "MISSING" ? "bg-white text-amber-700 shadow-sm" : "text-atelier-muted"
                    }`}
                  >
                    Без PDF ({variantsMissingFile.length})
                  </button>
                  <button
                    onClick={() => setFileFilter("HAS_FILE")}
                    className={`min-h-[44px] px-3.5 py-2 sm:min-h-0 sm:py-1 rounded-sm text-xs sm:text-[11px] font-semibold transition-colors flex items-center justify-center ${
                      fileFilter === "HAS_FILE" ? "bg-white text-emerald-700 shadow-sm" : "text-atelier-muted"
                    }`}
                  >
                    С файлами ({variantsWithFile.length})
                  </button>
                </div>

                {/* Формат */}
                <select
                  value={formatFilter}
                  onChange={(e) => setFormatFilter(e.target.value)}
                  className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-[11px] border border-atelier-border rounded-sm bg-white"
                >
                  <option value="ALL">Все форматы</option>
                  <option value="A4">Только А4</option>
                  <option value="PLOTTER_900">Только Плоттер</option>
                </select>

                {/* Рост */}
                <select
                  value={heightFilter}
                  onChange={(e) => setHeightFilter(e.target.value)}
                  className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-[11px] border border-atelier-border rounded-sm bg-white"
                >
                  <option value="ALL">Любой рост</option>
                  <option value="158-164">158-164 см</option>
                  <option value="164-170">164-170 см</option>
                  <option value="170-176">170-176 см</option>
                </select>

                {/* Кнопка пакетной установки цен по форматам (Stage 5.25) */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsFormatPriceModalOpen(true);
                    setFormatPriceError(null);
                    setFormatPriceInputValue("");
                    setSelectedFormatForPricing(uniqueFormats[0]?.id || "");
                  }}
                  className="min-h-[44px] sm:min-h-0 sm:h-8 px-3.5 sm:px-2.5 text-xs sm:text-[11px] border-atelier-border text-brand-900 hover:bg-brand-50"
                  title="Массово изменить цены по форматам (A4, Плоттер и др.)"
                >
                  <Tag className="w-3.5 h-3.5 mr-1" />
                  Цены по форматам
                </Button>
              </div>
            </div>

            {totalVariants === 0 ? (
              <div className="py-12 text-center text-atelier-muted border border-dashed border-atelier-border rounded-sm space-y-3">
                <Layers className="w-10 h-10 mx-auto text-atelier-muted stroke-1" />
                <p className="text-sm font-medium">Варианты выкройки еще не созданы</p>
                <p className="text-xs">
                  Перейдите в редактирование и сгенерируйте матрицу вариантов (размеры × рост × формат)
                </p>
                <Link href={`/admin/products/${productId}/edit`}>
                  <Button size="sm" variant="outline" className="text-xs">
                    Сгенерировать варианты
                  </Button>
                </Link>
              </div>
            ) : filteredVariants.length === 0 ? (
              <div className="py-8 text-center text-xs text-atelier-muted">
                Нет вариантов, соответствующих выбранным фильтрам
              </div>
            ) : (
              <div className="overflow-x-auto border border-atelier-border rounded-sm">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-atelier-surface border-b border-atelier-border text-atelier-muted font-mono uppercase text-[10px]">
                      <th className="py-3 px-4">Размер</th>
                      <th className="py-3 px-4">Рост</th>
                      <th className="py-3 px-4">Формат</th>
                      <th className="py-3 px-4">Артикул (SKU)</th>
                      <th className="py-3 px-4">Цена</th>
                      <th className="py-3 px-4">Статус PDF в S3</th>
                      <th className="py-3 px-4 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-atelier-border">
                    {filteredVariants.map((v) => {
                      const patternFile =
                        v.digitalFiles?.find((f) => f.fileType === "PATTERN" && f.isActive) ||
                        v.digitalFiles?.[0];
                      const currentVersion = patternFile?.versions?.[0];
                      const hasFile = !!currentVersion;

                      return (
                        <tr
                          key={v.id}
                          className={`transition-colors ${
                            !hasFile ? "bg-amber-50/20 hover:bg-amber-50/40" : "hover:bg-atelier-surface/40"
                          }`}
                        >
                          <td className="py-3 px-4 font-bold text-brand-950 font-mono">
                            {v.size?.code}
                          </td>
                          <td className="py-3 px-4 text-atelier-charcoal">
                            {v.height?.code} см
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono bg-atelier-surface px-1.5 py-0.5 rounded text-[11px] border border-atelier-border">
                              {v.format?.code}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-atelier-muted text-[11px]">
                            {v.sku}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold text-brand-950 font-mono">
                                {v.priceOverride !== null && v.priceOverride !== undefined
                                  ? `${v.priceOverride} сом`
                                  : (v.size?.code === "ALL" && product.bundlePrice
                                      ? `${product.bundlePrice} сом`
                                      : `${product.basePrice} сом`)}
                              </span>
                              {v.priceOverride !== null && v.priceOverride !== undefined ? (
                                <span className="inline-flex items-center text-[9px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 w-fit">
                                  Индивидуальная
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-[9px] font-medium text-atelier-muted bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 w-fit">
                                  Базовая (наследуется)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {hasFile ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  ✓ v{currentVersion.versionNumber} ({Math.round(currentVersion.fileSizeBytes / 1024)} КБ)
                                </span>
                                <div
                                  className="text-[10px] text-atelier-muted truncate max-w-xs font-mono"
                                  title={currentVersion.originalFileName}
                                >
                                  {currentVersion.originalFileName}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                ⚠️ Файл отсутствует
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex flex-wrap sm:flex-nowrap items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-8 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-[11px] text-brand-800 hover:bg-brand-50"
                                onClick={() => {
                                  setPriceModalVariant(v);
                                  setPriceInputValue(v.priceOverride !== null && v.priceOverride !== undefined ? String(v.priceOverride) : "");
                                  setPriceError(null);
                                }}
                                title="Установить индивидуальную цену варианта"
                              >
                                <Edit2 className="w-3.5 h-3.5 mr-1" />
                                Цена
                              </Button>

                              {hasFile && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-8 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-[11px] text-brand-800 hover:bg-brand-50"
                                  disabled={downloadingVersionId === currentVersion.id}
                                  onClick={() =>
                                    handleTestDownload(v.id, currentVersion.id)
                                  }
                                  title="Тестовое скачивание (проверка временной подписанной ссылки)"
                                >
                                  <Download className="w-3.5 h-3.5 mr-1" />
                                  {downloadingVersionId === currentVersion.id ? "Загрузка..." : "Тест ссылки"}
                                </Button>
                              )}

                              <Button
                                variant="outline"
                                size="sm"
                                className={`min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-8 px-3.5 py-2 sm:px-2 sm:py-1 text-xs sm:text-[11px] ${
                                  !hasFile
                                    ? "bg-brand-900 text-white hover:bg-brand-950 border-brand-900"
                                    : "border-atelier-border text-atelier-charcoal hover:text-brand-950"
                                }`}
                                onClick={() => {
                                  setSelectedVariant(v);
                                  setPdfMessage(null);
                                }}
                              >
                                <Upload className="w-3.5 h-3.5 mr-1" />
                                {hasFile ? "Заменить PDF" : "Загрузить PDF"}
                              </Button>

                              {hasFile && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-8 p-2.5 sm:px-2 sm:py-1 text-xs sm:text-[11px] text-red-600 hover:text-red-800 flex items-center justify-center"
                                  onClick={() => handleDeleteFileVersion(v.id, currentVersion.id)}
                                  title="Удалить версию файла"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ВКЛАДКА 2: ФОТОГАЛЕРЕЯ И МЕДИА */}
      {activeTab === "images" && (
        <div className="space-y-6">
          {/* Галерея существующих фото */}
          <div className="bg-white border border-atelier-border rounded-sm p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif text-lg font-bold text-brand-950">
                  Галерея фотографий изделия
                </h2>
                <p className="text-xs text-atelier-muted">
                  Публичные изображения, хранящиеся в облаке Supabase Storage (бакет <code>product-images</code>)
                </p>
              </div>
              <span className="text-xs text-atelier-muted">
                Всего фото: {product.images?.length || 0}
              </span>
            </div>

            {(!product.images || product.images.length === 0) ? (
              <div className="py-12 text-center text-atelier-muted border border-dashed border-atelier-border rounded-sm">
                <ImageIcon className="w-10 h-10 mx-auto text-atelier-muted mb-2 stroke-1" />
                <p className="text-sm font-medium">Нет загруженных фотографий</p>
                <p className="text-xs mt-1">Добавьте фотографии с компьютера или по прямой ссылке ниже</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {(product.images || []).map((img) => (
                  <div
                    key={img.id}
                    className={`group relative bg-atelier-surface border rounded-sm overflow-hidden flex flex-col justify-between transition-all ${
                      img.isCover
                        ? "border-amber-400 ring-2 ring-amber-400/20"
                        : "border-atelier-border hover:border-brand-500"
                    }`}
                  >
                    <div className="aspect-[3/4] w-full overflow-hidden bg-white relative">
                      <img
                        src={img.imageUrl}
                        alt={img.altText || product.title}
                        className="w-full h-full object-cover"
                      />
                      {img.isCover && (
                        <div className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm shadow-sm flex items-center space-x-1">
                          <Star className="w-3 h-3 fill-white" />
                          <span>Обложка</span>
                        </div>
                      )}
                    </div>

                    <div className="p-2.5 bg-white border-t border-atelier-border flex items-center justify-between gap-1 text-[11px]">
                      {!img.isCover ? (
                        <button
                          onClick={() => handleSetCover(img.id)}
                          className="text-amber-700 hover:text-amber-900 font-medium flex items-center"
                          title="Сделать главной обложкой"
                        >
                          <Star className="w-3.5 h-3.5 mr-1" />
                          На обложку
                        </button>
                      ) : (
                        <span className="text-atelier-muted font-medium">Главное фото</span>
                      )}

                      <button
                        onClick={() => handleDeleteImage(img.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Удалить фото"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Технический рисунок и видео карточки */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-atelier-border rounded-sm p-4 shadow-sm space-y-2">
              <h3 className="font-serif font-bold text-sm text-brand-950 flex items-center space-x-2">
                <FileCheck className="w-4 h-4 text-brand-700" />
                <span>Технический рисунок</span>
              </h3>
              {product.technicalDrawingUrl ? (
                <div className="flex items-center space-x-3 p-3 bg-atelier-surface border border-atelier-border rounded-sm">
                  <img
                    src={product.technicalDrawingUrl}
                    alt="Технический рисунок"
                    className="w-20 h-20 object-contain bg-white rounded border border-atelier-border"
                  />
                  <div className="text-xs space-y-1">
                    <span className="font-semibold text-emerald-800 block">✓ Эскиз загружен</span>
                    <a
                      href={product.technicalDrawingUrl}
                      target="_blank"
                      className="text-brand-700 hover:underline text-[11px] font-mono break-all line-clamp-1"
                    >
                      {product.technicalDrawingUrl}
                    </a>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-atelier-muted">
                  Технический рисунок не указан. Добавьте его на странице редактирования.
                </p>
              )}
            </div>

            <div className="bg-white border border-atelier-border rounded-sm p-4 shadow-sm space-y-2">
              <h3 className="font-serif font-bold text-sm text-brand-950 flex items-center space-x-2">
                <Video className="w-4 h-4 text-brand-700" />
                <span>Видео готового изделия</span>
              </h3>
              {product.videoUrl ? (
                <div className="p-3 bg-atelier-surface border border-atelier-border rounded-sm text-xs space-y-1">
                  <span className="font-semibold text-emerald-800 block">✓ Видео прикреплено</span>
                  <a
                    href={product.videoUrl}
                    target="_blank"
                    className="text-brand-700 hover:underline text-[11px] font-mono break-all"
                  >
                    {product.videoUrl}
                  </a>
                </div>
              ) : (
                <p className="text-xs text-atelier-muted">
                  Видеоролик не прикреплен. Вы можете добавить ссылку в редактировании выкройки.
                </p>
              )}
            </div>
          </div>

          {/* Форма загрузки нового фото */}
          <div className="bg-white border border-atelier-border rounded-sm p-6 shadow-sm space-y-4">
            <h2 className="font-serif text-lg font-bold text-brand-950 flex items-center space-x-2">
              <Upload className="w-5 h-5 text-brand-700" />
              <span>Загрузить новое фото в галерею</span>
            </h2>

            {imageMessage && (
              <div
                className={`p-3 rounded-sm text-xs flex items-center space-x-2 ${
                  imageMessage.type === "success"
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {imageMessage.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{imageMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleUploadImageSubmit} className="space-y-4">
              <div className="flex border-b border-atelier-border space-x-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setImageUploadType("file")}
                  className={`pb-2 border-b-2 transition-all flex items-center space-x-1.5 ${
                    imageUploadType === "file"
                      ? "border-brand-900 text-brand-950"
                      : "border-transparent text-atelier-muted hover:text-brand-950"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>С компьютера (JPEG, PNG, WebP)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImageUploadType("url")}
                  className={`pb-2 border-b-2 transition-all flex items-center space-x-1.5 ${
                    imageUploadType === "url"
                      ? "border-brand-900 text-brand-950"
                      : "border-transparent text-atelier-muted hover:text-brand-950"
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>По прямой ссылке (URL)</span>
                </button>
              </div>

              {imageUploadType === "file" ? (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-2">
                    Выберите файл (до 10 МБ) *
                  </label>
                  <div className="flex items-center space-x-4">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageFileChange}
                      className="text-xs text-atelier-charcoal file:mr-3 file:py-2 file:px-4 file:rounded-sm file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-900 hover:file:bg-brand-100 cursor-pointer"
                    />
                    {imageFileName && (
                      <span className="text-xs text-green-700 font-medium">
                        ✓ {imageFileName}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-2">
                    Прямая ссылка на изображение *
                  </label>
                  <input
                    type="url"
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="https://example.com/photos/dress-front.jpg"
                    className="w-full px-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
                  />
                </div>
              )}

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="imageIsCover"
                  checked={imageIsCover}
                  onChange={(e) => setImageIsCover(e.target.checked)}
                  className="rounded text-brand-900 focus:ring-brand-500"
                />
                <label htmlFor="imageIsCover" className="text-xs text-atelier-charcoal font-medium cursor-pointer">
                  Сделать это фото главной обложкой выкройки
                </label>
              </div>

              <Button
                type="submit"
                isLoading={isUploadingImage}
                disabled={isUploadingImage}
                className="text-xs bg-brand-900 hover:bg-brand-950 text-white"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Загрузить в Supabase Storage
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ВКЛАДКА 3: ИНСТРУКЦИИ ПО ПОШИВУ (STAGE 5.23) */}
      {activeTab === "instructions" && (
        <div className="space-y-6">
          {/* Плашка текущего статуса инструкции */}
          {(() => {
            const instructions = product.instructions || [];
            const activeInstruction = instructions.find((i) => i.isActive) || instructions[0];
            const hasActive = Boolean(activeInstruction && activeInstruction.isActive);

            return (
              <div
                className={`p-5 rounded-sm border transition-all ${
                  hasActive
                    ? "bg-emerald-50/80 border-emerald-300 text-emerald-950"
                    : instructions.length > 0
                    ? "bg-amber-50/90 border-amber-300 text-amber-950"
                    : "bg-atelier-surface border-atelier-border text-atelier-charcoal"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start space-x-3">
                    {hasActive ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                    ) : instructions.length > 0 ? (
                      <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <BookOpen className="w-6 h-6 text-brand-700 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-serif font-bold text-sm">
                          {hasActive
                            ? `Актуальная инструкция: «${activeInstruction.title}» (v${activeInstruction.version})`
                            : instructions.length > 0
                            ? "Все загруженные инструкции деактивированы"
                            : "Инструкция по сборке и пошиву еще не загружена"}
                        </h3>
                        <Badge variant={hasActive ? "success" : instructions.length > 0 ? "warning" : "neutral"}>
                          {hasActive ? "Загружена и активна" : instructions.length > 0 ? "Неактивна" : "Отсутствует"}
                        </Badge>
                      </div>
                      <p className="text-xs mt-1 opacity-90 leading-relaxed">
                        {hasActive
                          ? `Файл: ${activeInstruction.fileName} • Размер: ${Math.round(activeInstruction.fileSizeBytes / 1024)} КБ • Загружена: ${new Date(activeInstruction.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })} • SHA-256: ${activeInstruction.checksumSha256.slice(0, 12)}...`
                          : instructions.length > 0
                          ? "Покупателям выкройки временно недоступно скачивание руководства. Активируйте одну из версий ниже."
                          : "Загрузите производственное руководство в формате PDF. Покупатели получат доступ к нему сразу после оплаты выкройки в личном кабинете."}
                      </p>
                    </div>
                  </div>

                  {hasActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 bg-white hover:bg-emerald-100/50 border-emerald-300 text-emerald-900"
                      disabled={testingInstructionId === activeInstruction.id}
                      onClick={() => handleTestDownloadInstruction(activeInstruction.id)}
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      {testingInstructionId === activeInstruction.id ? "Генерация ссылки..." : "Проверить скачивание (PDF)"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Форма загрузки / обновления инструкции */}
          <div className="bg-white border border-atelier-border rounded-sm p-6 shadow-sm space-y-4">
            <div>
              <h2 className="font-serif text-lg font-bold text-brand-950 flex items-center space-x-2">
                <Upload className="w-5 h-5 text-brand-700" />
                <span>Загрузить / обновить инструкцию по пошиву</span>
              </h2>
              <p className="text-xs text-atelier-muted mt-0.5">
                Файл сохраняется в защищенный приватный бакет <code>pattern-files</code>. При загрузке новой версии текущая автоматически архивируется, а номер версии инкрементируется.
              </p>
            </div>

            {instructionMessage && (
              <div
                className={`p-3 rounded text-xs flex items-center space-x-2 ${
                  instructionMessage.type === "success"
                    ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                    : "bg-red-50 text-red-900 border border-red-200"
                }`}
              >
                {instructionMessage.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{instructionMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleUploadInstruction} className="space-y-4 max-w-xl">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                  Название руководства *
                </label>
                <input
                  type="text"
                  value={instructionTitle}
                  onChange={(e) => setInstructionTitle(e.target.value)}
                  placeholder="Например: Инструкция по пошиву и сборке модели «Пальто оверсайз Чолпон»"
                  className="w-full px-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                  PDF-документ (до 30 МБ, проверка структуры и сигнатуры ISO 32000) *
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleInstructionFileChange}
                    className="text-xs text-atelier-charcoal file:mr-3 file:py-2 file:px-4 file:rounded-sm file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-900 hover:file:bg-brand-100 cursor-pointer"
                  />
                  {instructionFileName && (
                    <span className="text-xs text-emerald-700 font-medium">
                      ✓ {instructionFileName} ({Math.round(instructionFileSize / 1024)} КБ)
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  size="sm"
                  isLoading={isUploadingInstruction}
                  disabled={isUploadingInstruction || !instructionFileBase64}
                  className="bg-brand-900 hover:bg-brand-950 text-white disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  {product.instructions && product.instructions.length > 0
                    ? "Сохранить как новую версию инструкции"
                    : "Загрузить инструкцию в хранилище"}
                </Button>
              </div>
            </form>
          </div>

          {/* Таблица истории всех версий инструкций */}
          <div className="bg-white border border-atelier-border rounded-sm p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif text-lg font-bold text-brand-950">
                  История версий инструкций
                </h2>
                <p className="text-xs text-atelier-muted">
                  Полный неизменяемый аудит-лог версий. Безопасное отключение без удаления файлов.
                </p>
              </div>
              <span className="text-xs text-atelier-muted font-mono">
                Всего версий: {product.instructions?.length || 0}
              </span>
            </div>

            {(!product.instructions || product.instructions.length === 0) ? (
              <div className="py-12 text-center text-atelier-muted border border-dashed border-atelier-border rounded-sm">
                <BookOpen className="w-10 h-10 mx-auto text-atelier-muted mb-2 stroke-1" />
                <p className="text-sm font-medium">История версий пуста</p>
                <p className="text-xs mt-1">Загрузите первый PDF-файл инструкции с помощью формы выше</p>
              </div>
            ) : (
              <div className="border border-atelier-border rounded-sm overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-atelier-surface border-b border-atelier-border text-atelier-muted uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Версия</th>
                      <th className="py-2.5 px-3">Название</th>
                      <th className="py-2.5 px-3">Имя файла</th>
                      <th className="py-2.5 px-3">Размер</th>
                      <th className="py-2.5 px-3">SHA-256</th>
                      <th className="py-2.5 px-3">Дата загрузки</th>
                      <th className="py-2.5 px-3">Статус</th>
                      <th className="py-2.5 px-3 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-atelier-border">
                    {(product.instructions || []).map((inst) => (
                      <tr
                        key={inst.id}
                        className={`transition-colors ${
                          inst.isActive
                            ? "bg-emerald-50/20 hover:bg-emerald-50/40"
                            : "bg-atelier-surface/30 hover:bg-atelier-surface/60 opacity-80"
                        }`}
                      >
                        <td className="py-3 px-3 font-bold text-brand-950 font-mono">
                          v{inst.version}
                        </td>
                        <td className="py-3 px-3 font-medium text-brand-950">
                          {inst.title}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-atelier-charcoal max-w-[180px] truncate" title={inst.fileName}>
                          {inst.fileName}
                        </td>
                        <td className="py-3 px-3 font-mono text-atelier-muted">
                          {Math.round(inst.fileSizeBytes / 1024)} КБ
                        </td>
                        <td className="py-3 px-3 font-mono text-[10px] text-atelier-muted" title={inst.checksumSha256}>
                          {inst.checksumSha256.slice(0, 10)}...
                        </td>
                        <td className="py-3 px-3 text-atelier-muted text-[11px]">
                          {new Date(inst.createdAt).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-3 px-3">
                          {inst.isActive ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
                              ✓ Активна
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
                              Архив
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex flex-wrap sm:flex-nowrap items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-8 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-[11px] text-brand-800 hover:bg-brand-50"
                              disabled={testingInstructionId === inst.id}
                              onClick={() => handleTestDownloadInstruction(inst.id)}
                              title="Тестовое скачивание (проверка временного подписанного URL)"
                            >
                              <Download className="w-3.5 h-3.5 mr-1" />
                              {testingInstructionId === inst.id ? "Тест..." : "Тест ссылки"}
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-8 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-[11px] border-atelier-border text-atelier-charcoal hover:text-brand-950"
                              disabled={togglingInstructionId === inst.id}
                              onClick={() => handleToggleInstructionActive(inst.id)}
                              title={inst.isActive ? "Отключить инструкцию" : "Сделать эту инструкцию активной"}
                            >
                              {togglingInstructionId === inst.id ? "..." : inst.isActive ? "Отключить" : "Включить"}
                            </Button>

                            {inst.isActive && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-8 p-2.5 sm:px-2 sm:py-1 text-xs sm:text-[11px] text-red-700 hover:bg-red-50 hover:text-red-900 flex items-center justify-center"
                                disabled={deactivatingInstructionId === inst.id}
                                onClick={() => handleDeactivateInstruction(inst.id)}
                                title="Безопасная деактивация"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО ЗАГРУЗКИ / ЗАМЕНЫ PDF */}
      {selectedVariant && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm border border-atelier-border max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-atelier-border pb-3">
              <div>
                <h3 className="font-serif text-lg font-bold text-brand-950 flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-brand-700" />
                  <span>Загрузка PDF-выкройки</span>
                </h3>
                <p className="text-xs text-atelier-muted">
                  Размер {selectedVariant.size?.code} • Рост {selectedVariant.height?.code} см • Формат {selectedVariant.format?.code}
                </p>
              </div>
              <button
                onClick={() => setSelectedVariant(null)}
                className="text-atelier-muted hover:text-brand-950 min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Карточка ожидаемого имени файла (P0-3) */}
            {product && (
              <div className="p-3 bg-atelier-surface border border-atelier-border rounded-sm text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-atelier-charcoal">
                    Товар: {product.title}
                  </span>
                  <span className="font-mono text-[11px] text-atelier-muted">
                    SKU: {selectedVariant.sku}
                  </span>
                </div>
                <div>
                  <span className="text-atelier-muted block text-[11px]">
                    Ожидаемое каноническое имя файла (Стандарт Stage 5.1):
                  </span>
                  <code className="block mt-1 font-mono font-bold text-xs bg-white px-2 py-1 rounded border border-atelier-border text-brand-950 break-all select-all">
                    {`${product.slug}-${selectedVariant.size?.code}-${selectedVariant.height?.code}-${selectedVariant.format?.code}.pdf`}
                  </code>
                </div>
              </div>
            )}

            {pdfMessage && (
              <div
                className={`p-3 rounded-sm text-xs flex items-center space-x-2 ${
                  pdfMessage.type === "success"
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {pdfMessage.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{pdfMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleUploadPdfSubmit} className="space-y-4">
              <div className="flex border-b border-atelier-border space-x-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setPdfUploadType("file")}
                  className={`pb-2 border-b-2 transition-all flex items-center space-x-1.5 ${
                    pdfUploadType === "file"
                      ? "border-brand-900 text-brand-950"
                      : "border-transparent text-atelier-muted hover:text-brand-950"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Файл с компьютера (PDF)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPdfUploadType("url")}
                  className={`pb-2 border-b-2 transition-all flex items-center space-x-1.5 ${
                    pdfUploadType === "url"
                      ? "border-brand-900 text-brand-950"
                      : "border-transparent text-atelier-muted hover:text-brand-950"
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>Загрузить по ссылке (URL)</span>
                </button>
              </div>

              {pdfUploadType === "file" ? (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-2">
                    Выберите PDF-файл (до 30 МБ) *
                  </label>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handlePdfFileChange}
                    className="text-xs text-atelier-charcoal file:mr-3 file:py-2 file:px-4 file:rounded-sm file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-900 hover:file:bg-brand-100 cursor-pointer"
                  />
                  {pdfFileName && (
                    <p className="text-xs text-atelier-charcoal font-medium mt-1">
                      Выбран файл: <span className="font-mono font-bold">{pdfFileName}</span>
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-2">
                    Прямая ссылка на PDF-файл *
                  </label>
                  <input
                    type="url"
                    value={pdfUrlInput}
                    onChange={(e) => setPdfUrlInput(e.target.value)}
                    placeholder="https://example.com/files/pattern-42-164-A4.pdf"
                    className="w-full px-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
                  />
                </div>
              )}

              {/* Индикатор совпадения имени файла (P0-3) */}
              {(() => {
                const modalExpected = product && selectedVariant
                  ? `${product.slug}-${selectedVariant.size?.code}-${selectedVariant.height?.code}-${selectedVariant.format?.code}.pdf`
                  : "";
                const currentName = pdfUploadType === "file"
                  ? pdfFileName.trim()
                  : (pdfUrlInput.trim().split("/").pop()?.split("?")[0] || "").trim();

                if (!currentName || !modalExpected) return null;

                const isExactMatch = currentName === modalExpected;
                const isCaseMatch = currentName.toLowerCase() === modalExpected.toLowerCase();
                const isAllowed = isExactMatch || isCaseMatch || autoCanonicalRename;

                return (
                  <div className="space-y-2">
                    <div
                      className={`p-2.5 rounded text-xs flex items-center space-x-2 ${
                        isAllowed
                          ? "bg-emerald-50 text-emerald-900 border border-emerald-300"
                          : "bg-red-50 text-red-900 border border-red-300"
                      }`}
                    >
                      {isExactMatch ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>✓ Имя файла точно соответствует стандарту ({currentName})</span>
                        </>
                      ) : isAllowed ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            ✓ Файл &quot;{currentName}&quot; будет сохранён как: <strong className="font-mono">{modalExpected}</strong>
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                          <span>
                            ❌ Несоответствие: выбран &quot;{currentName}&quot;, требуется &quot;{modalExpected}&quot;.
                          </span>
                        </>
                      )}
                    </div>

                    <label className="flex items-center space-x-2 text-xs text-atelier-charcoal cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoCanonicalRename}
                        onChange={(e) => setAutoCanonicalRename(e.target.checked)}
                        className="rounded border-atelier-border text-brand-900 focus:ring-brand-500"
                      />
                      <span>Привести имя файла к каноническому стандарту (<code className="font-mono font-bold text-[11px]">{modalExpected}</code>)</span>
                    </label>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                  Примечание к версии (Changelog)
                </label>
                <input
                  type="text"
                  value={pdfChangelog}
                  onChange={(e) => setPdfChangelog(e.target.value)}
                  placeholder="Например: Первоначальный релиз или Исправлена длина рукава"
                  className="w-full px-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex flex-wrap sm:flex-nowrap justify-end gap-2 pt-2 border-t border-atelier-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] px-4 text-xs sm:h-9 sm:min-h-0 sm:px-3"
                  onClick={() => setSelectedVariant(null)}
                >
                  Отмена
                </Button>
                {(() => {
                  const modalExpected = product && selectedVariant
                    ? `${product.slug}-${selectedVariant.size?.code}-${selectedVariant.height?.code}-${selectedVariant.format?.code}.pdf`
                    : "";
                  const currentName = pdfUploadType === "file"
                    ? pdfFileName.trim()
                    : (pdfUrlInput.trim().split("/").pop()?.split("?")[0] || "").trim();
                  const isMatching = !currentName || (
                    currentName === modalExpected ||
                    currentName.toLowerCase() === modalExpected.toLowerCase() ||
                    autoCanonicalRename
                  );

                  return (
                    <Button
                      type="submit"
                      size="sm"
                      isLoading={isUploadingPdf}
                      disabled={
                        isUploadingPdf ||
                        !currentName ||
                        !isMatching ||
                        (pdfUploadType === "file" ? !pdfFileBase64 : !pdfUrlInput.trim())
                      }
                      className="min-h-[44px] px-5 text-xs sm:h-9 sm:min-h-0 sm:px-4 bg-brand-900 hover:bg-brand-950 text-white disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      <Upload className="w-3.5 h-3.5 mr-1" />
                      Сохранить в хранилище
                    </Button>
                  );
                })()}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО РЕДАКТИРОВАНИЯ ЦЕНЫ ВАРИАНТА (Stage 5.25) */}
      {priceModalVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-sm border border-atelier-border max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-atelier-border pb-3">
              <div>
                <h3 className="font-serif text-base font-bold text-brand-950">
                  Установка цены варианта
                </h3>
                <p className="text-xs text-atelier-muted">
                  Размер {priceModalVariant.size?.code} | Рост {priceModalVariant.height?.code} см | Формат {priceModalVariant.format?.code}
                </p>
              </div>
              <button
                onClick={() => setPriceModalVariant(null)}
                className="text-atelier-muted hover:text-brand-950 min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-atelier-charcoal space-y-2 bg-atelier-surface/60 p-3 rounded border border-atelier-border">
              <div className="flex justify-between">
                <span className="text-atelier-muted">Артикул (SKU):</span>
                <span className="font-mono font-bold">{priceModalVariant.sku}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-atelier-muted">Базовая цена выкройки:</span>
                <span className="font-semibold">{product?.basePrice} сом</span>
              </div>
              {product?.bundlePrice && priceModalVariant.size?.code === "ALL" && (
                <div className="flex justify-between">
                  <span className="text-atelier-muted">Цена комплекта (bundle):</span>
                  <span className="font-semibold">{product.bundlePrice} сом</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-atelier-muted">Текущая цена варианта:</span>
                <span className="font-semibold text-brand-950">
                  {priceModalVariant.priceOverride !== null && priceModalVariant.priceOverride !== undefined
                    ? `${priceModalVariant.priceOverride} сом (индивидуальная)`
                    : `${priceModalVariant.size?.code === "ALL" && product?.bundlePrice ? product.bundlePrice : product?.basePrice} сом (наследуется)`}
                </span>
              </div>
            </div>

            {priceError && (
              <div className="p-2.5 rounded text-xs bg-red-50 text-red-900 border border-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{priceError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const num = parseFloat(priceInputValue.trim());
                if (isNaN(num) || num <= 0) {
                  setPriceError("Введите корректную положительную цену больше нуля");
                  return;
                }
                handleSaveVariantPrice(priceModalVariant.id, num);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                  Индивидуальная цена (сом) *
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={priceInputValue}
                  onChange={(e) => {
                    setPriceInputValue(e.target.value);
                    setPriceError(null);
                  }}
                  placeholder={`Например: ${product?.basePrice || 350}`}
                  className="w-full px-3 py-2 min-h-[44px] text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500 font-mono"
                  autoFocus
                />
                <p className="text-[11px] text-atelier-muted mt-1">
                  Укажите индивидуальную цену для этого размера и формата.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row justify-between gap-2 pt-2 border-t border-atelier-border">
                {priceModalVariant.priceOverride !== null && priceModalVariant.priceOverride !== undefined ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSavingPrice}
                    className="min-h-[44px] px-4 text-xs sm:h-9 sm:min-h-0 sm:px-3 text-red-700 hover:bg-red-50 border-red-200"
                    onClick={() => handleSaveVariantPrice(priceModalVariant.id, null)}
                  >
                    Сбросить к базовой
                  </Button>
                ) : <span />}

                <div className="flex flex-wrap sm:flex-nowrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] px-4 text-xs sm:h-9 sm:min-h-0 sm:px-3"
                    onClick={() => setPriceModalVariant(null)}
                  >
                    Отмена
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    isLoading={isSavingPrice}
                    className="min-h-[44px] px-5 text-xs sm:h-9 sm:min-h-0 sm:px-4 bg-brand-900 hover:bg-brand-950 text-white font-medium"
                  >
                    Сохранить цену
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО МАССОВОЙ УСТАНОВКИ ЦЕН ПО ФОРМАТУ (Stage 5.25) */}
      {isFormatPriceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-sm border border-atelier-border max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-atelier-border pb-3">
              <div>
                <h3 className="font-serif text-base font-bold text-brand-950">
                  Установка цен по формату выкройки
                </h3>
                <p className="text-xs text-atelier-muted">
                  Массово обновить цену для всех размеров выбранного формата
                </p>
              </div>
              <button
                onClick={() => setIsFormatPriceModalOpen(false)}
                className="text-atelier-muted hover:text-brand-950 min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formatPriceError && (
              <div className="p-2.5 rounded text-xs bg-red-50 text-red-900 border border-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{formatPriceError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!selectedFormatForPricing) {
                  setFormatPriceError("Выберите формат выкройки");
                  return;
                }
                const num = parseFloat(formatPriceInputValue.trim());
                if (isNaN(num) || num <= 0) {
                  setFormatPriceError("Введите корректную положительную цену больше нуля");
                  return;
                }
                handleSaveFormatPrices(selectedFormatForPricing, num);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                  Формат выкройки *
                </label>
                <select
                  value={selectedFormatForPricing}
                  onChange={(e) => {
                    setSelectedFormatForPricing(e.target.value);
                    setFormatPriceError(null);
                  }}
                  className="w-full px-3 py-2 min-h-[44px] text-sm border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-500"
                >
                  <option value="">-- Выберите формат --</option>
                  {uniqueFormats.map((fmt) => (
                    <option key={fmt.id} value={fmt.id}>
                      {fmt.label || fmt.code} ({fmt.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                  Новая цена для всех размеров этого формата (сом) *
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={formatPriceInputValue}
                  onChange={(e) => {
                    setFormatPriceInputValue(e.target.value);
                    setFormatPriceError(null);
                  }}
                  placeholder={`Например: 450`}
                  className="w-full px-3 py-2 min-h-[44px] text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500 font-mono"
                />
                <p className="text-[11px] text-atelier-muted mt-1">
                  Цена будет установлена для всех вариантов указанного формата (например, Plotter 900).
                </p>
              </div>

              <div className="flex flex-col sm:flex-row justify-between gap-2 pt-2 border-t border-atelier-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSavingFormatPrices || !selectedFormatForPricing}
                  className="min-h-[44px] px-4 text-xs sm:h-9 sm:min-h-0 sm:px-3 text-red-700 hover:bg-red-50 border-red-200"
                  onClick={() => {
                    if (selectedFormatForPricing) {
                      handleSaveFormatPrices(selectedFormatForPricing, null);
                    }
                  }}
                >
                  Сбросить к базовой
                </Button>

                <div className="flex flex-wrap sm:flex-nowrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] px-4 text-xs sm:h-9 sm:min-h-0 sm:px-3"
                    onClick={() => setIsFormatPriceModalOpen(false)}
                  >
                    Отмена
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    isLoading={isSavingFormatPrices}
                    disabled={isSavingFormatPrices || !selectedFormatForPricing}
                    className="min-h-[44px] px-5 text-xs sm:h-9 sm:min-h-0 sm:px-4 bg-brand-900 hover:bg-brand-950 text-white font-medium"
                  >
                    Применить ко всем
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}