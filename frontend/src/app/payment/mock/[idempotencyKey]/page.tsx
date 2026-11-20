"use client";

import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth-context";
import { Button } from "../../../../components/ui/Button";
import {
  CreditCard,
  CheckCircle,
  XCircle,
  RotateCcw,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  AlertCircle,
  Clock,
  Download,
} from "lucide-react";

export default function MockPaymentPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const idempotencyKey = params.idempotencyKey as string;
  const orderId = searchParams.get("orderId") || "";
  const orderNumber = searchParams.get("order") || `LZ-${idempotencyKey?.slice(0, 8)}`;
  const amountStr = searchParams.get("amount") || "";
  const currency = searchParams.get("currency") || "KGS";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<{
    status: "SUCCEEDED" | "FAILED" | "CANCELED" | null;
    message: string;
  } | null>(null);

  const [verifiedStatus, setVerifiedStatus] = useState<string | null>(null);

  // If orderId is available, fetch latest payment status
  useEffect(() => {
    if (!orderId || !user) return;
    async function checkStatus() {
      try {
        const res = await api.get<{
          success: boolean;
          data: { orderStatus: string; isPaid: boolean };
        }>(`/api/v1/orders/${orderId}/payment-status`);
        if (res.success && res.data) {
          setVerifiedStatus(res.data.orderStatus);
          if (res.data.isPaid) {
            setPaymentResult({
              status: "SUCCEEDED",
              message: "Заказ уже успешно оплачен.",
            });
          }
        }
      } catch (e) {
        // Ignore
      }
    }
    checkStatus();
  }, [orderId, user]);

  const handleSimulate = async (status: "SUCCEEDED" | "FAILED" | "CANCELED") => {
    if (!orderId) {
      setError("Не указан идентификатор заказа (orderId).");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.post<{
        success: boolean;
        data: any;
      }>(`/api/v1/orders/${orderId}/mock-simulate`, { status });

      if (res.success) {
        if (status === "SUCCEEDED") {
          setPaymentResult({
            status: "SUCCEEDED",
            message: "Платёж успешно проведён! Цифровые права на выкройки начислены.",
          });
          setVerifiedStatus("PAID");
        } else if (status === "FAILED") {
          setPaymentResult({
            status: "FAILED",
            message: "Банк отклонил транзакцию. Платёж переведён в статус FAILED.",
          });
          setVerifiedStatus("PENDING");
        } else {
          setPaymentResult({
            status: "CANCELED",
            message: "Платёж отменён пользователем.",
          });
          setVerifiedStatus("PENDING");
        }
      }
    } catch (err: any) {
      setError(err.message || "Ошибка при обработке тестового платежа");
    } finally {
      setLoading(false);
    }
  };

  const isPaid = verifiedStatus === "PAID" || paymentResult?.status === "SUCCEEDED";

  return (
    <div className="bg-atelier-surface min-h-screen py-12 px-4 sm:px-6">
      <div className="max-w-xl mx-auto">
        <div className="bg-white border border-atelier-border rounded-sm shadow-md overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-brand-950 via-brand-900 to-brand-950 text-white p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-[0.25em] text-brand-300">
                KGS Sandbox • Тестовый платёжный шлюз
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-sm">
                Песочница
              </span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold mt-2 text-white">
              LEKALO ZHIIDE PAY
            </h1>
            <p className="text-xs text-brand-200 mt-1">
              Безопасная обработка электронных платежей в сомах (KGS)
            </p>
          </div>

          {/* Order Details Body */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="bg-atelier-subtle p-4 rounded-sm border border-atelier-border space-y-2 text-xs">
              <div className="flex justify-between text-atelier-charcoal">
                <span>Номер заказа:</span>
                <span className="font-bold text-brand-950 font-mono text-sm">
                  {orderNumber}
                </span>
              </div>
              {amountStr && (
                <div className="flex justify-between items-baseline pt-1 border-t border-atelier-border/60">
                  <span className="font-semibold text-atelier-charcoal">Сумма к оплате:</span>
                  <span className="font-serif text-xl font-bold text-brand-950">
                    {Number(amountStr).toLocaleString("ru-RU")} {currency}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-atelier-muted text-[11px]">
                <span>Ключ идемпотентности:</span>
                <span className="font-mono truncate max-w-[200px]">
                  {idempotencyKey}
                </span>
              </div>
              {verifiedStatus && (
                <div className="flex justify-between text-[11px] pt-1 border-t border-atelier-border/60">
                  <span>Текущий статус заказа:</span>
                  <span
                    className={`font-bold px-2 py-0.2 rounded-sm ${
                      verifiedStatus === "PAID"
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {verifiedStatus}
                  </span>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-sm text-xs text-red-800 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Results feedback */}
            {paymentResult && (
              <div
                className={`p-4 rounded-sm text-xs leading-relaxed border ${
                  paymentResult.status === "SUCCEEDED"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                    : paymentResult.status === "FAILED"
                    ? "bg-red-50 border-red-200 text-red-950"
                    : "bg-amber-50 border-amber-200 text-amber-950"
                }`}
              >
                <div className="font-bold flex items-center space-x-2 mb-1">
                  {paymentResult.status === "SUCCEEDED" ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  ) : paymentResult.status === "FAILED" ? (
                    <XCircle className="w-4 h-4 text-red-600" />
                  ) : (
                    <RotateCcw className="w-4 h-4 text-amber-600" />
                  )}
                  <span>
                    {paymentResult.status === "SUCCEEDED"
                      ? "Платёж успешно проведён!"
                      : paymentResult.status === "FAILED"
                      ? "Платёж отклонён"
                      : "Платёж отменён"}
                  </span>
                </div>
                <p>{paymentResult.message}</p>
              </div>
            )}

            {/* Simulation controls */}
            {!isPaid ? (
              <div className="space-y-4">
                <p className="text-xs text-atelier-charcoal leading-relaxed">
                  Выберите тестовый сценарий для отправки подписанного банковского вебхука в систему:
                </p>

                <div className="flex flex-col space-y-2.5">
                  <Button
                    size="lg"
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm justify-center"
                    isLoading={loading}
                    disabled={loading}
                    onClick={() => handleSimulate("SUCCEEDED")}
                  >
                    <span>✅ Эмулировать успешную оплату (200 OK)</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full border-red-300 text-red-700 hover:bg-red-50 font-semibold text-sm justify-center"
                    isLoading={loading}
                    disabled={loading}
                    onClick={() => handleSimulate("FAILED")}
                  >
                    <span>❌ Эмулировать отказ банка (Declined)</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="md"
                    className="w-full border-atelier-border text-atelier-charcoal hover:bg-atelier-subtle text-xs justify-center"
                    isLoading={loading}
                    disabled={loading}
                    onClick={() => handleSimulate("CANCELED")}
                  >
                    <span>↩️ Отменить операцию</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <Link href="/cabinet/library" className="block">
                  <Button size="lg" className="w-full text-base bg-emerald-700 hover:bg-emerald-800">
                    <Download className="w-4 h-4 mr-2" />
                    <span>Скачать выкройки в Личном кабинете</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>

                <Link href="/checkout" className="block text-center text-xs text-brand-800 hover:text-brand-950 underline">
                  Вернуться к деталям заказа
                </Link>
              </div>
            )}

            {/* Footer security notice */}
            <div className="pt-4 border-t border-atelier-border/80 flex items-center justify-center space-x-2 text-[11px] text-atelier-muted">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Тестовый контур • HMAC-SHA256 подпись вебхуков активна</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
