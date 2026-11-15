"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { PurchaseEntitlement, DownloadUrlResponse } from "../../../types";
import { api } from "../../../lib/api";
import { Button } from "../../../components/ui/Button";
import {
  Download,
  FileText,
  Scissors,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  History,
  Clock,
  Sparkles,
} from "lucide-react";

export default function CabinetLibraryPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [entitlements, setEntitlements] = useState<PurchaseEntitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Active download state / modal
  const [downloadResult, setDownloadResult] = useState<DownloadUrlResponse | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    async function loadLibrary() {
      if (!user) return;
      try {
        const res = await api.get<{ success: boolean; data: PurchaseEntitlement[] }>(
          "/api/v1/cabinet/library"
        );
        if (res.success && res.data) {
          setEntitlements(res.data);
        }
      } catch (err) {
        console.error("Failed to load user pattern library:", err);
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      loadLibrary();
    }
  }, [user]);

  const handleDownloadFile = async (
    entitlementId: string,
    versionNumber?: number
  ) => {
    setDownloadingId(entitlementId);
    setDownloadError(null);
    setDownloadResult(null);

    try {
      const res = await api.post<{ success: boolean; data: DownloadUrlResponse }>(
        `/api/v1/cabinet/files/${entitlementId}/download-url`,
        versionNumber ? { versionNumber } : {}
      );

      if (res.success && res.data) {
        setDownloadResult(res.data);
        // Automatically open or trigger link
        window.open(res.data.downloadUrl, "_blank");
      }
    } catch (err: any) {
      setDownloadError(
        err.message || "Не удалось сгенерировать ссылку для скачивания."
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadInstruction = async (instructionId: string) => {
    setDownloadError(null);
    try {
      const res = await api.get<{
        success: boolean;
        data: { downloadUrl: string; fileName: string; expiresAt: string };
      }>(`/api/v1/cabinet/instructions/${instructionId}/download-url`);

      if (res.success && res.data) {
        window.open(res.data.downloadUrl, "_blank");
      }
    } catch (err: any) {
      alert(err.message || "Не удалось скачать инструкцию.");
    }
  };

  if (authLoading || (!user && loading)) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="h-40 bg-atelier-subtle animate-pulse rounded-sm" />
      </div>
    );
  }

  return (
    <div className="bg-atelier-surface min-h-screen py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Breadcrumbs & Title */}
        <div className="border-b border-atelier-border pb-4 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
              Личная библиотека
            </span>
            <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
              Мои купленные выкройки
            </h1>
            <p className="text-xs text-atelier-muted mt-1">
              Бессрочный доступ ко всем приобретенным электронным лекалам и обновлениям версий
            </p>
          </div>

          <Link href="/cabinet/downloads">
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1.5" />
              Центр прямой загрузки
            </Button>
          </Link>
        </div>

        {/* Global Download Error Notice */}
        {downloadError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-sm flex items-start space-x-2 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Ошибка скачивания</p>
              <p className="mt-0.5">{downloadError}</p>
            </div>
          </div>
        )}

        {/* Success Modal / Banner */}
        {downloadResult && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-sm flex items-center justify-between text-xs text-emerald-900">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Ссылка сформирована для <strong>{downloadResult.fileName}</strong>{downloadResult.versionNumber ? ` (версия v${downloadResult.versionNumber})` : ""}.
                Действительна {downloadResult.expiresAt ? `до ${new Date(downloadResult.expiresAt).toLocaleTimeString("ru-RU")}` : `в течение ${Math.round((downloadResult.expiresInSeconds || 600) / 60)} минут`} (TTL {downloadResult.expiresInSeconds || 600} секунд).
              </span>
            </div>
            <a
              href={downloadResult.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline ml-4 hover:text-emerald-950"
            >
              Скачать файл снова →
            </a>
          </div>
        )}

        {/* Library Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-44 bg-white border border-atelier-border animate-pulse rounded-sm"
              />
            ))}
          </div>
        ) : entitlements.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {entitlements.map((item) => {
              const entitlementId = item.entitlementId || item.id || "";
              const isDownloading = downloadingId === entitlementId;
              const title = item.productTitle || item.product?.title || "Выкройка";
              const coverUrl = item.coverUrl || item.product?.coverImage;
              const sizeStr =
                item.size ||
                (typeof item.productVariant?.size === "object"
                  ? (item.productVariant?.size as any)?.label
                  : item.productVariant?.size) ||
                "";
              const heightStr =
                item.height ||
                (typeof item.productVariant?.height === "object"
                  ? (item.productVariant?.height as any)?.label
                  : item.productVariant?.height) ||
                "";
              const formatStr =
                item.format ||
                (typeof item.productVariant?.format === "object"
                  ? (item.productVariant?.format as any)?.label
                  : item.productVariant?.format) ||
                "";
              const version = item.currentVersion || item.file?.currentVersion || 1;
              const instructionId =
                item.instructionId || item.product?.instructions?.[0]?.id;
              const slug = item.product?.slug;

              return (
                <div
                  key={entitlementId}
                  className="bg-white border border-atelier-border rounded-sm p-6 flex flex-col justify-between shadow-sm hover:border-brand-300 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-14 bg-brand-50 border border-atelier-border rounded-sm overflow-hidden flex items-center justify-center shrink-0">
                          {coverUrl ? (
                            <img
                              src={coverUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Scissors className="w-5 h-5 text-brand-800" />
                          )}
                        </div>
                        <div>
                          {slug ? (
                            <Link
                              href={`/catalog/${slug}`}
                              className="font-serif font-bold text-base text-brand-950 hover:text-brand-800 transition-colors line-clamp-1"
                            >
                              {title}
                            </Link>
                          ) : (
                            <h3 className="font-serif font-bold text-base text-brand-950 line-clamp-1">
                              {title}
                            </h3>
                          )}
                          <div className="flex items-center space-x-2 mt-1">
                            {sizeStr && (
                              <span className="text-[11px] font-medium text-brand-800 bg-brand-100 px-2 py-0.5 rounded-sm">
                                Размер: {sizeStr} RU
                              </span>
                            )}
                            {(heightStr || formatStr) && (
                              <span className="text-[11px] text-atelier-muted">
                                {[
                                  heightStr ? `Рост ${heightStr} см` : "",
                                  formatStr,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {item.status === "ACTIVE" ? (
                        <span className="inline-flex items-center text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-sm">
                          Активно
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-sm">
                          Отозвано
                        </span>
                      )}
                    </div>

                    {/* Version & file info */}
                    <div className="p-3 bg-atelier-subtle/80 rounded-sm text-xs space-y-1 mb-4">
                      <div className="flex justify-between text-atelier-charcoal">
                        <span>Файл лекала:</span>
                        <span className="font-medium truncate max-w-[200px]">
                          {title} ({sizeStr} / {heightStr})
                        </span>
                      </div>
                      <div className="flex justify-between text-atelier-muted text-[11px]">
                        <span>Актуальная версия:</span>
                        <span>v{version}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Instructions */}
                  <div className="space-y-2 pt-2 border-t border-atelier-border/60">
                    <Button
                      onClick={() => handleDownloadFile(entitlementId)}
                      disabled={isDownloading || item.status !== "ACTIVE"}
                      isLoading={isDownloading}
                      className="w-full"
                      size="sm"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      <span>Скачать выкройку (PDF)</span>
                    </Button>

                    {/* Sewing instructions */}
                    {instructionId && (
                      <div className="pt-2">
                        <span className="text-[10px] uppercase tracking-wider text-atelier-muted block mb-1 font-semibold">
                          Инструкции по пошиву:
                        </span>
                        <button
                          onClick={() =>
                            handleDownloadInstruction(instructionId)
                          }
                          className="w-full text-left p-2 border border-atelier-border/80 hover:bg-brand-50 rounded-sm text-xs text-brand-950 flex items-center justify-between transition-colors"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <FileText className="w-3.5 h-3.5 text-brand-700 shrink-0" />
                            <span className="truncate">
                              Инструкция по сборке и пошиву (PDF)
                            </span>
                          </div>
                          <Download className="w-3.5 h-3.5 text-atelier-muted shrink-0 ml-2" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-atelier-border rounded-sm p-12 text-center max-w-xl mx-auto shadow-sm">
            <Scissors className="w-12 h-12 text-atelier-muted mx-auto mb-4 stroke-[1.2]" />
            <h2 className="font-serif text-xl font-bold text-brand-950">
              Ваша библиотека выкроек пуста
            </h2>
            <p className="text-xs text-atelier-muted mt-2 leading-relaxed">
              Вы еще не приобрели ни одной выкройки. После успешного оформления заказа ваши файлы PDF появятся на этой странице автоматически.
            </p>
            <Link href="/catalog" className="inline-block mt-6">
              <Button size="lg">Перейти в каталог выкроек</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
