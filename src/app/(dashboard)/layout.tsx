"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Calendar, Sparkles, Home, DollarSign,
  Users, Settings, Bell, LogOut, ChevronRight, UserCog, Package, DoorOpen, ClipboardList,
  BarChart2, Receipt, CreditCard,
} from "lucide-react";
import { useAuthStore } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Início" },
  { href: "/calendar", icon: Calendar, label: "Calendário" },
  { href: "/cleaning", icon: Sparkles, label: "Limpeza" },
  { href: "/properties", icon: Home, label: "Imóveis" },
  { href: "/financial", icon: DollarSign, label: "Financeiro" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  // Aguarda o Zustand carregar o token do localStorage antes de redirecionar
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.push("/login");
  }, [hydrated, isAuthenticated, router]);

  // Mostra tela de carregamento enquanto hidrata
  if (!hydrated) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-400 text-sm">Carregando...</p>
      </div>
    </div>
  );

  if (!isAuthenticated) return null;

  const isAdmin = user?.role === "ADMIN";
  const isOwner = user?.role === "OWNER";

  const visibleNav = navItems.filter((item) => {
    if (isOwner && item.href === "/cleaning") return false;
    if (isOwner && item.href === "/") return true;
    return true;
  });

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 flex-col z-30">
        {/* Logo */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center">
              <Home className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900">RentalPro</p>
              <p className="text-xs text-slate-400">Gestão de Imóveis</p>
            </div>
          </div>
        </div>

        {/* User info */}
        <div className="px-4 py-3 mx-3 mt-3 bg-slate-50 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{user?.name}</p>
              <p className="text-xs text-slate-400 capitalize">{user?.role?.toLowerCase()}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon className={cn("w-4.5 h-4.5", active ? "text-brand-600" : "text-slate-400")} size={18} />
                {item.label}
                {active && <ChevronRight className="ml-auto w-4 h-4 text-brand-400" />}
              </Link>
            );
          })}

          {isAdmin && (
            <>
              {/* Divider */}
              <div className="pt-1 pb-0.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3">Financeiro</p>
              </div>
              <Link
                href="/analytics"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  pathname === "/analytics"
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <BarChart2 size={18} className={pathname === "/analytics" ? "text-brand-600" : "text-slate-400"} />
                Analytics
                {pathname === "/analytics" && <ChevronRight className="ml-auto w-4 h-4 text-brand-400" />}
              </Link>
              <Link
                href="/expenses"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  pathname === "/expenses"
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Receipt size={18} className={pathname === "/expenses" ? "text-brand-600" : "text-slate-400"} />
                Despesas
                {pathname === "/expenses" && <ChevronRight className="ml-auto w-4 h-4 text-brand-400" />}
              </Link>
              <Link
                href="/payments"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  pathname === "/payments"
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <CreditCard size={18} className={pathname === "/payments" ? "text-brand-600" : "text-slate-400"} />
                Parcelamentos
                {pathname === "/payments" && <ChevronRight className="ml-auto w-4 h-4 text-brand-400" />}
              </Link>
              {/* Divider */}
              <div className="pt-1 pb-0.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3">Inventário</p>
              </div>
              <Link
                href="/items"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  pathname === "/items"
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Package size={18} className={pathname === "/items" ? "text-brand-600" : "text-slate-400"} />
                Almoxarifado
                {pathname === "/items" && <ChevronRight className="ml-auto w-4 h-4 text-brand-400" />}
              </Link>
              <Link
                href="/checklist"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  pathname === "/checklist"
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <ClipboardList size={18} className={pathname === "/checklist" ? "text-brand-600" : "text-slate-400"} />
                Por Casa
                {pathname === "/checklist" && <ChevronRight className="ml-auto w-4 h-4 text-brand-400" />}
              </Link>
              <Link
                href="/rooms"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  pathname === "/rooms"
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <DoorOpen size={18} className={pathname === "/rooms" ? "text-brand-600" : "text-slate-400"} />
                Cômodos
                {pathname === "/rooms" && <ChevronRight className="ml-auto w-4 h-4 text-brand-400" />}
              </Link>
            </>
          )}

          {isAdmin && (
            <Link
              href="/users"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                pathname === "/users"
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <UserCog size={18} className="text-slate-400" />
              Usuários
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/settings"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                pathname === "/settings"
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Settings size={18} className="text-slate-400" />
              Configurações
            </Link>
          )}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-slate-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut size={18} className="text-slate-400" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="md:ml-64 min-h-screen">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-sm border-b border-slate-200 px-4 py-3 md:hidden flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
              <Home className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">RentalPro</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 relative">
              <Bell size={18} className="text-slate-600" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <button
              onClick={handleLogout}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50"
            >
              <LogOut size={18} className="text-slate-500" />
            </button>
          </div>
        </header>

        {/* Page */}
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="page-container"
        >
          {children}
        </motion.div>
      </main>

      {/* Bottom navigation (mobile) */}
      <nav className="bottom-nav md:hidden">
        {visibleNav.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={cn("bottom-nav-item", active && "active")}>
              <Icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
