"use client";

import React, { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { User } from "../../../types";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import {
  Users,
  Search,
  RefreshCw,
  AlertCircle,
  Shield,
  ShieldAlert,
  UserCheck,
  UserX,
  Filter,
  CheckCircle2,
  X,
} from "lucide-react";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Action / Modal State
  const [roleModalUser, setRoleModalUser] = useState<User | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<string>("CUSTOMER");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchUsers = async (pageNum: number = page) => {
    setIsLoading(true);
    setError(null);
    try {
      let url = `/api/v1/admin/users?page=${pageNum}&limit=${limit}`;
      if (roleFilter !== "ALL") {
        url += `&role=${roleFilter}`;
      }
      if (statusFilter !== "ALL") {
        url += `&isActive=${statusFilter === "ACTIVE"}`;
      }
      if (search.trim()) {
        url += `&search=${encodeURIComponent(search.trim())}`;
      }

      const res = await api.get<{
        success: boolean;
        data: { users: User[]; total: number; page: number; limit: number };
      }>(url);

      if (res.success && res.data) {
        setUsers(res.data.users || []);
        setTotal(res.data.total || 0);
        setPage(res.data.page || 1);
      }
    } catch (err: any) {
      setError(err?.message || "Не удалось загрузить список пользователей");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(1);
  }, [roleFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(1);
  };

  const handleUpdateRole = async () => {
    if (!roleModalUser) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await api.patch(`/api/v1/admin/users/${roleModalUser.id}/role`, {
        role: selectedNewRole,
      });

      setUsers((prev) =>
        prev.map((u) =>
          u.id === roleModalUser.id ? { ...u, role: selectedNewRole as any } : u
        )
      );

      setActionSuccess(`Роль пользователя ${roleModalUser.email} изменена на ${selectedNewRole}`);
      setRoleModalUser(null);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      alert(`Ошибка изменения роли: ${err?.message || "Действие отклонено"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus = !user.isActive;
    const confirmMsg = newStatus
      ? `Разблокировать пользователя ${user.email}?`
      : `Вы уверены, что хотите заблокировать доступ пользователю ${user.email}?`;

    if (!confirm(confirmMsg)) return;

    try {
      await api.patch(`/api/v1/admin/users/${user.id}/status`, {
        isActive: newStatus,
      });

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: newStatus } : u))
      );

      setActionSuccess(
        `Статус пользователя ${user.email} обновлен: ${newStatus ? "Активен" : "Заблокирован"}`
      );
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      alert(`Ошибка смены статуса активности: ${err?.message || "Действие отклонено"}`);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-atelier-border pb-6">
        <div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-brand-700 font-semibold">
            Управление доступом
          </span>
          <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
            Пользователи системы
          </h1>
          <p className="text-xs text-atelier-muted mt-1">
            Всего учётных записей: {total}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchUsers(page)}
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

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-sm text-xs text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-sm text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchUsers(page)} className="text-xs">
            Повторить
          </Button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 border border-atelier-border rounded-sm shadow-sm flex flex-col md:flex-row items-center gap-4 justify-between">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-atelier-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Поиск по email, имени или телефону..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
            />
          </div>
          <Button type="submit" size="sm" variant="outline" className="text-xs">
            Найти
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto text-xs">
          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-atelier-muted" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900"
            >
              <option value="ALL">Все роли</option>
              <option value="CUSTOMER">CUSTOMER (Покупатели)</option>
              <option value="CONTENT_MANAGER">CONTENT_MANAGER</option>
              <option value="ADMIN">ADMIN (Администраторы)</option>
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900"
          >
            <option value="ALL">Все статусы</option>
            <option value="ACTIVE">Только активные</option>
            <option value="INACTIVE">Заблокированные</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-atelier-border rounded-sm shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-atelier-muted">
              Загрузка списка пользователей...
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-xs text-atelier-muted space-y-2">
              <Users className="w-8 h-8 mx-auto text-atelier-muted stroke-1" />
              <p>Пользователи не найдены</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-atelier-surface text-atelier-muted uppercase tracking-wider text-[10px] border-b border-atelier-border">
                <tr>
                  <th className="py-3 px-4">Пользователь</th>
                  <th className="py-3 px-4">Телефон</th>
                  <th className="py-3 px-4">Роль</th>
                  <th className="py-3 px-4">Заказов</th>
                  <th className="py-3 px-4">Статус</th>
                  <th className="py-3 px-4">Регистрация</th>
                  <th className="py-3 px-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-atelier-border">
                {users.map((u) => {
                  const isActive = u.isActive !== false;
                  return (
                    <tr key={u.id} className="hover:bg-atelier-subtle transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-brand-950">{u.email}</div>
                        <div className="text-[11px] text-atelier-muted">
                          {[u.firstName, u.lastName].filter(Boolean).join(" ") || "Имя не указано"}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-atelier-charcoal font-mono">
                        {u.phone || "—"}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                            u.role === "ADMIN"
                              ? "bg-purple-100 text-purple-800 border border-purple-200"
                              : u.role === "CONTENT_MANAGER"
                              ? "bg-blue-100 text-blue-800 border border-blue-200"
                              : "bg-gray-100 text-gray-700 border border-gray-200"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-atelier-charcoal font-medium">
                        {u._count?.orders || 0}
                      </td>

                      <td className="py-3 px-4">
                        <Badge variant={isActive ? "success" : "neutral"}>
                          {isActive ? "Активен" : "Заблокирован"}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-atelier-muted">
                        {u.createdAt
                          ? new Date(u.createdAt).toLocaleDateString("ru-RU")
                          : "—"}
                      </td>

                      <td className="py-3 px-4 text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRoleModalUser(u);
                            setSelectedNewRole(u.role);
                          }}
                          className="h-7 px-2 text-[11px]"
                          title="Изменить роль"
                        >
                          <Shield className="w-3.5 h-3.5 mr-1 text-brand-700" />
                          Роль
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleStatus(u)}
                          className="h-7 px-2 text-[11px]"
                          title={isActive ? "Заблокировать" : "Разблокировать"}
                        >
                          {isActive ? (
                            <>
                              <UserX className="w-3.5 h-3.5 mr-1 text-red-600" />
                              Блок
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                              Разблок
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
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
                onClick={() => fetchUsers(page - 1)}
                className="text-xs"
              >
                Назад
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isLoading}
                onClick={() => fetchUsers(page + 1)}
                className="text-xs"
              >
                Вперёд
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Role Change Modal */}
      {roleModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-atelier-border rounded-sm max-w-sm w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-atelier-border pb-3">
              <h3 className="font-serif text-lg font-bold text-brand-950 flex items-center space-x-2">
                <Shield className="w-5 h-5 text-brand-800" />
                <span>Изменение роли</span>
              </h3>
              <button
                type="button"
                onClick={() => setRoleModalUser(null)}
                className="text-atelier-muted hover:text-brand-950"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs space-y-2">
              <p className="text-atelier-muted">
                Пользователь:{" "}
                <strong className="text-brand-950 block">{roleModalUser.email}</strong>
              </p>
              <p className="text-atelier-muted">
                Текущая роль: <Badge variant="neutral">{roleModalUser.role}</Badge>
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                Выберите новую роль:
              </label>
              <select
                value={selectedNewRole}
                onChange={(e) => setSelectedNewRole(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900"
              >
                <option value="CUSTOMER">CUSTOMER — Покупатель</option>
                <option value="CONTENT_MANAGER">CONTENT_MANAGER — Контент-менеджер</option>
                <option value="ADMIN">ADMIN — Полный администратор</option>
              </select>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-atelier-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRoleModalUser(null)}
                disabled={isSubmitting}
              >
                Отмена
              </Button>
              <Button
                size="sm"
                onClick={handleUpdateRole}
                disabled={isSubmitting || selectedNewRole === roleModalUser.role}
              >
                {isSubmitting ? "Сохранение..." : "Применить роль"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
