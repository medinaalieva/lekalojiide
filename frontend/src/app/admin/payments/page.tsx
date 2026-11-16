"use client";

import React, { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { AdminPaymentWebhookEvent } from "../../../types";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import {
  CreditCard,
  RefreshCw,
  AlertCircle,
  Filter,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  X,
  Code,
} from "lucide-react";

export default function AdminPaymentsPage() {
  const [events, setEvents] = useState<AdminPaymentWebhookEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [gatewayFilter, setGatewayFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Raw payload modal
  const [selectedEvent, setSelectedEvent] = useState<AdminPaymentWebhookEvent | null>(null);

  const fetchEvents = async (pageNum: number = page) => {
    setIsLoading(true);
    setError(null);
    try {
      let url = `/api/v1/admin/webhook-events?page=${pageNum}&limit=${limit}`;
      if (gatewayFilter !== "ALL") {
        url += `&gateway=${gatewayFilter}`;
      }
      if (statusFilter !== "ALL") {
        url += `&status=${statusFilter}`;
      }

      const res = await api.get<{
        success: boolean;
        data: { events: AdminPaymentWebhookEvent[]; total: number; page: number; limit: number };
      }>(url);

      if (res.success && res.data) {
        setEvents(res.data.events || []);
        setTotal(res.data.total || 0);
        setPage(res.data.page || 1);
      }
    } catch (err: any) {
      setError(err?.message || "Не удалось загрузить журнал событий платежей");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents(1);
  }, [gatewayFilter, statusFilter]);

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-atelier-border pb-6">
        <div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-brand-700 font-semibold">
            Эквайринг и интеграции
          </span>
          <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
            События платежей (Вебхуки)
          </h1>
          <p className="text-xs text-atelier-muted mt-1">
            Журнал входящих уведомлений платёжных шлюзов (Freedom Pay, MBank, Demir Bank)
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchEvents(page)}
            disabled={isLoading}
            className="text-xs"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`}
            />
            Обновить
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-sm text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchEvents(page)} className="text-xs">
            Повторить
          </Button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 border border-atelier-border rounded-sm shadow-sm flex flex-wrap items-center gap-3 justify-between text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-atelier-muted" />
            <select
              value={gatewayFilter}
              onChange={(e) => setGatewayFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900"
            >
              <option value="ALL">Все платёжные шлюзы</option>
              <option value="FREEDOM_PAY">Freedom Pay</option>
              <option value="MBANK">MBank (QR / ЭЛСОМ)</option>
              <option value="DEMIR">Demir Bank</option>
              <option value="OPTIMA">Optima Bank</option>
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900"
          >
            <option value="ALL">Все статусы обработки</option>
            <option value="PROCESSED">Успешно обработан (PROCESSED)</option>
            <option value="RECEIVED">Получен (RECEIVED)</option>
            <option value="FAILED">Ошибка (FAILED)</option>
            <option value="IGNORED">Пропущен (IGNORED)</option>
          </select>
        </div>

        <span className="text-atelier-muted text-[11px]">
          Всего зарегистрировано событий: <strong>{total}</strong>
        </span>
      </div>

      {/* Events Table */}
      <div className="bg-white border border-atelier-border rounded-sm shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-atelier-muted">
              Загрузка журнала событий...
            </div>
          ) : events.length === 0 ? (
            <div className="p-12 text-center text-xs text-atelier-muted space-y-2">
              <CreditCard className="w-8 h-8 mx-auto text-atelier-muted stroke-1" />
              <p>Входящих событий вебхуков пока не зафиксировано</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-atelier-surface text-atelier-muted uppercase tracking-wider text-[10px] border-b border-atelier-border">
                <tr>
                  <th className="py-3 px-4">Время</th>
                  <th className="py-3 px-4">Шлюз</th>
                  <th className="py-3 px-4">Тип события</th>
                  <th className="py-3 px-4">Внешний ID платежа</th>
                  <th className="py-3 px-4">Статус</th>
                  <th className="py-3 px-4 text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-atelier-border font-mono text-[11px]">
                {events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-atelier-subtle transition-colors">
                    <td className="py-3 px-4 text-atelier-muted font-sans text-xs">
                      {new Date(evt.createdAt).toLocaleString("ru-RU")}
                    </td>

                    <td className="py-3 px-4 font-sans font-semibold text-brand-950">
                      {evt.gateway}
                    </td>

                    <td className="py-3 px-4 text-atelier-charcoal">
                      {evt.eventType || "PAYMENT_NOTIFICATION"}
                    </td>

                    <td className="py-3 px-4 text-atelier-muted truncate max-w-[180px]">
                      {evt.externalPaymentId || "—"}
                    </td>

                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          evt.status === "PROCESSED"
                            ? "success"
                            : evt.status === "FAILED"
                            ? "danger"
                            : "warning"
                        }
                      >
                        {evt.status}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedEvent(evt)}
                        className="h-7 px-2 font-sans text-xs"
                      >
                        <Code className="w-3.5 h-3.5 mr-1" />
                        JSON
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-atelier-border flex items-center justify-between text-xs text-atelier-muted">
            <span>
              Страница {page} из {totalPages}
            </span>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => fetchEvents(page - 1)}
                className="text-xs"
              >
                Назад
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isLoading}
                onClick={() => fetchEvents(page + 1)}
                className="text-xs"
              >
                Вперёд
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Raw JSON Payload Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-atelier-border rounded-sm max-w-2xl w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-atelier-border pb-3">
              <div>
                <h3 className="font-serif text-lg font-bold text-brand-950">
                  Сырые данные события (Webhook Payload)
                </h3>
                <p className="text-[11px] text-atelier-muted font-mono">
                  {selectedEvent.gateway} • ID: {selectedEvent.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="text-atelier-muted hover:text-brand-950"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-brand-950 text-brand-100 p-4 rounded-sm text-xs font-mono max-h-[60vh] overflow-auto">
              <pre>
                {JSON.stringify(
                  selectedEvent.rawPayload || {
                    id: selectedEvent.id,
                    gateway: selectedEvent.gateway,
                    eventType: selectedEvent.eventType,
                    externalPaymentId: selectedEvent.externalPaymentId,
                    status: selectedEvent.status,
                    processedAt: selectedEvent.processedAt,
                    errorMessage: selectedEvent.errorMessage,
                  },
                  null,
                  2
                )}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedEvent(null)}
              >
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
