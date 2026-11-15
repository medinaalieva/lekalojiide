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
  ShieldCheck,
  Printer,
  FileCheck,
  AlertCircle,
  Clock,
  Sparkles,
  Scissors,
  CheckCircle,
} from "lucide-react";

const getEntId = (e: any) => e?.entitlementId || e?.id || "";
const getEntTitle = (e: any) => e?.productTitle || e?.product?.title || "Выкройка";
const getEntSize = (e: any) =>
  e?.size ||
  (typeof e?.productVariant?.size === "object"
    ? e?.productVariant?.size?.label
    : e?.productVariant?.size) ||
  "";
const getEntHeight = (e: any) =>
  e?.height ||
  (typeof e?.productVariant?.height === "object"
    ? e?.productVariant?.height?.label
    : e?.productVariant?.height) ||
  "";
const getEntFormat = (e: any) =>
  e?.format ||
  (typeof e?.productVariant?.format === "object"
    ? e?.productVariant?.format?.label
    : e?.productVariant?.format) ||
  "";

export default function DownloadsCenterPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [entitlements, setEntitlements] = useState<PurchaseEntitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeEntitlementId, setActiveEntitlementId] = useState<string>("");
  const [selectedVersion, setSelectedVersion] = useState<number | undefined>(undefined);
  const [downloadResult, setDownloadResult] = useState<DownloadUrlResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      try {
        const res = await api.get<{ success: boolean; data: PurchaseEntitlement[] }>(
          "/api/v1/cabinet/library"
        );
        if (res.success && res.data) {
          setEntitlements(res.data);
          if (res.data.length > 0) {
            setActiveEntitlementId(getEntId(res.data[0]));
          }
        }
      } catch (err) {
        console.error("Failed to load downloads data:", err);
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      loadData();
    }
  }, [user]);

  const activeEntitlement = entitlements.find(
    (e) => getEntId(e) === activeEntitlementId
  );

  const handleGenerateUrl = async () => {
    if (!activeEntitlementId) return;
    setIsGenerating(true);
    setError(null);
    setDownloadResult(null);

    try {
      const payload = selectedVersion ? { versionNumber: selectedVersion } : {};
      const res = await api.post<{ success: boolean; data: DownloadUrlResponse }>(
        `/api/v1/cabinet/files/${activeEntitlementId}/download-url`,
        payload
      );

      if (res.success && res.data) {
        setDownloadResult(res.data);
        window.open(res.data.downloadUrl, "_blank");
      }
    } catch (err: any) {
      setError(err.message || "Не удалось создать безопасную ссылку для скачивания.");
    } finally {
      setIsGenerating(false);
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
        <div className="border-b border-atelier-border pb-4 mb-8">
          <span className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
            Безопасная загрузка
          </span>
          <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
            Центр скачивания цифровых выкроек
          </h1>
          <p className="text-xs text-atelier-muted mt-1">
            Генерация одноразовых подписанных ссылок с защитой от прямого неавторизованного доступа
          </p>
        </div>

        {entitlements.length === 0 && !loading ? (
          <div className="bg-white border border-atelier-border rounded-sm p-12 text-center max-w-lg mx-auto">
            <Download className="w-12 h-12 text-atelier-muted mx-auto mb-3" />
            <h3 className="font-serif text-lg font-bold text-brand-950">
              Нет доступных файлов для скачивания
            </h3>
            <p className="text-xs text-atelier-muted mt-2">
              После оплаты заказа выкройки автоматически появятся в этом разделе.
            </p>
            <Link href="/catalog" className="inline-block mt-6">
              <Button>Перейти в каталог</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Select Pattern & Generate Link - 7 cols */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white p-6 border border-atelier-border rounded-sm space-y-5">
                <h2 className="font-serif text-base font-bold text-brand-950 border-b border-atelier-border pb-3 flex items-center justify-between">
                  <span>1. Выберите модель для скачивания</span>
                  <span className="text-xs font-normal text-atelier-muted">
                    Всего доступно: {entitlements.length}
                  </span>
                </h2>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-sm flex items-start space-x-2 text-xs text-red-800">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Pattern selector */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-2">
                    Приобретенное лекало
                  </label>
                  <select
                    value={activeEntitlementId}
                    onChange={(e) => {
                      setActiveEntitlementId(e.target.value);
                      setSelectedVersion(undefined);
                      setDownloadResult(null);
                    }}
                    className="w-full text-xs border border-atelier-border rounded-sm px-3 py-2.5 bg-white focus:outline-none focus:border-brand-500"
                  >
                    {entitlements.map((e) => {
                      const id = getEntId(e);
                      const title = getEntTitle(e);
                      const s = getEntSize(e);
                      const h = getEntHeight(e);
                      const f = getEntFormat(e);
                      return (
                        <option key={id} value={id}>
                          {title} — {s} RU / {h} см / {f}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {activeEntitlement && (
                  <div className="p-4 bg-atelier-subtle rounded-sm text-xs space-y-2 border border-atelier-border/60">
                    <div className="flex justify-between">
                      <span className="text-atelier-muted">Модель:</span>
                      <strong className="text-brand-950 font-medium">
                        {getEntTitle(activeEntitlement)}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-atelier-muted">Размер и ростовка:</span>
                      <span>
                        {getEntSize(activeEntitlement)} RU · {getEntHeight(activeEntitlement)} см
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-atelier-muted">Формат файла:</span>
                      <span className="font-medium">
                        {getEntFormat(activeEntitlement)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-atelier-muted">Статус лицензии:</span>
                      <span className="text-emerald-700 font-semibold">
                        {activeEntitlement.status === "ACTIVE" ? "АКТИВНА" : "ОТОЗВАНА"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Generate Button */}
                <div className="pt-2">
                  <Button
                    onClick={handleGenerateUrl}
                    disabled={isGenerating || !activeEntitlementId}
                    isLoading={isGenerating}
                    size="lg"
                    className="w-full text-base"
                  >
                    <Download className="w-5 h-5 mr-2" />
                    <span>Сгенерировать безопасную ссылку и скачать</span>
                  </Button>
                </div>

                {/* Download Result Link Box */}
                {downloadResult && (
                  <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-sm space-y-3">
                    <div className="flex items-center space-x-2 text-xs font-bold text-emerald-900">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span>Ссылка успешно создана и готова к скачиванию!</span>
                    </div>
                    <p className="text-xs text-emerald-800">
                      Файл: <strong>{downloadResult.fileName}</strong>{downloadResult.versionNumber ? ` (версия v${downloadResult.versionNumber})` : ""}
                    </p>
                    <div className="flex items-center space-x-2 text-[11px] text-emerald-700">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        Ссылка действительна {downloadResult.expiresAt ? `до ${new Date(downloadResult.expiresAt).toLocaleTimeString("ru-RU")}` : `в течение ${Math.round((downloadResult.expiresInSeconds || 600) / 60)} минут`} ({downloadResult.expiresInSeconds || 600} секунд)
                      </span>
                    </div>
                    <a
                      href={downloadResult.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block mt-2"
                    >
                      <Button variant="primary" size="sm" className="w-full">
                        Прямое скачивание PDF
                      </Button>
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Print & Sewing Guide Instructions - 5 cols */}
            <div className="lg:col-span-5 space-y-6">
              {/* Security info card */}
              <div className="bg-white p-6 border border-atelier-border rounded-sm space-y-3">
                <div className="flex items-center space-x-2 text-brand-900">
                  <ShieldCheck className="w-5 h-5 text-brand-700" />
                  <h3 className="font-serif font-bold text-base text-brand-950">
                    Защита контента
                  </h3>
                </div>
                <p className="text-xs text-atelier-muted leading-relaxed">
                  Все файлы хранятся в защищенном хранилище и не имеют постоянного публичного URL. Ссылки формируются индивидуально для вашего аккаунта и действуют ограниченное время.
                </p>
              </div>

              {/* Printing advice card */}
              <div className="bg-white p-6 border border-atelier-border rounded-sm space-y-4">
                <div className="flex items-center space-x-2 text-brand-900">
                  <Printer className="w-5 h-5 text-brand-700" />
                  <h3 className="font-serif font-bold text-base text-brand-950">
                    Памятка по печати лекал
                  </h3>
                </div>

                <ul className="space-y-3 text-xs text-atelier-charcoal">
                  <li className="flex items-start space-x-2">
                    <span className="font-bold text-brand-800">1.</span>
                    <span>
                      Печатайте на листах А4 строго в масштабе <strong>100%</strong> («Реальный размер» / «Custom Scale 100%»). Не включайте опцию «Подогнать под размер страницы».
                    </span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold text-brand-800">2.</span>
                    <span>
                      Сначала распечатайте <strong>первый лист</strong> с тестовым квадратом и измерьте его линейкой (он должен быть ровно 10 × 10 см).
                    </span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold text-brand-800">3.</span>
                    <span>
                      Склейте листы встык или по рамке в соответствии со схематическим планом раскладки.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
