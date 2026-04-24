"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Calendar, Sparkles, Home, DollarSign,
  Users, Settings, Bell, LogOut, ChevronDown, UserCog, Package, DoorOpen, ClipboardList,
  BarChart2, Receipt, CreditCard, Megaphone, Menu, X,
} from "lucide-react";
import { useAuthStore } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/* ─── Nav structure with collapsible groups ─── */
interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  adminOnly?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  items: NavItem[];
}

const topItems: NavItem[] = [
  { href: "/", icon: LayoutDashboard, label: "Painel" },
  { href: "/calendar", icon: Calendar, label: "Calendário" },
  { href: "/reservations", icon: ClipboardList, label: "Reservas" },
  { href: "/properties", icon: Home, label: "Imóveis" },
];

const groups: NavGroup[] = [
  {
    id: "operations",
    label: "Operações",
    icon: Sparkles,
    items: [
      { href: "/cleaning", icon: Sparkles, label: "Limpeza" },
      { href: "/promotions", icon: Megaphone, label: "Promoções", adminOnly: true },
    ],
  },
  {
    id: "financial",
    label: "Financeiro",
    icon: DollarSign,
    adminOnly: true,
    items: [
      { href: "/financial", icon: DollarSign, label: "Resumo" },
      { href: "/analytics", icon: BarChart2, label: "Analytics" },
      { href: "/expenses", icon: Receipt, label: "Despesas" },
      { href: "/payments", icon: CreditCard, label: "Parcelamentos" },
    ],
  },
  {
    id: "inventory",
    label: "Inventário",
    icon: Package,
    adminOnly: true,
    items: [
      { href: "/items", icon: Package, label: "Almoxarifado" },
      { href: "/checklist", icon: ClipboardList, label: "Por Casa" },
      { href: "/rooms", icon: DoorOpen, label: "Cômodos" },
    ],
  },
];

const bottomItems: NavItem[] = [
  { href: "/users", icon: UserCog, label: "Usuários", adminOnly: true },
  { href: "/settings", icon: Settings, label: "Configurações", adminOnly: true },
];

/* ─── Sidebar Link ─── */
function SidebarLink({ item, pathname, collapsed }: { item: NavItem; pathname: string; collapsed?: boolean }) {
  const Icon = item.icon;
  const active = pathname === item.href;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200",
        active
          ? "bg-white/10 text-white shadow-sm shadow-white/5"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
      )}
    >
      <Icon size={17} className={cn("flex-shrink-0 transition-colors", active ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {active && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
    </Link>
  );
}

/* ─── Collapsible Group ─── */
function SidebarGroup({ group, pathname, isAdmin }: { group: NavGroup; pathname: string; isAdmin: boolean }) {
  const hasActiveChild = group.items.some(i => pathname === i.href);
  const [open, setOpen] = useState(hasActiveChild);
  const Icon = group.icon;

  const visibleItems = group.items.filter(i => !i.adminOnly || isAdmin);
  if (visibleItems.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200",
          hasActiveChild
            ? "text-slate-200"
            : "text-slate-400 hover:bg-white/5 hover:text-slate-300"
        )}
      >
        <Icon size={17} className={cn("flex-shrink-0", hasActiveChild ? "text-blue-400" : "text-slate-500")} />
        <span className="truncate">{group.label}</span>
        <ChevronDown
          size={14}
          className={cn(
            "ml-auto transition-transform duration-300 text-slate-500",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="ml-3 pl-3 border-l border-white/10 space-y-0.5 py-1">
              {visibleItems.map(item => (
                <SidebarLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Main Layout ─── */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => { if (hydrated && !isAuthenticated) router.push("/login"); }, [hydrated, isAuthenticated, router]);
  useEffect(() => { setMobileOpen(false); }, [pathname]);

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

  const visibleTopItems = topItems.filter(item => {
    if (isOwner && item.href === "/cleaning") return false;
    return !item.adminOnly || isAdmin;
  });

  const visibleGroups = groups.filter(g => !g.adminOnly || isAdmin);
  const visibleBottomItems = bottomItems.filter(i => !i.adminOnly || isAdmin);

  function handleLogout() { logout(); router.push("/login"); }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Home className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm tracking-wide">RentalPro</p>
            <p className="text-[10px] text-slate-500 tracking-wider uppercase">Gestão de Imóveis</p>
          </div>
        </div>
      </div>

      {/* User */}
      <div className="mx-4 mb-4 p-3 rounded-xl bg-white/5 border border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-xs shadow-sm">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-200 truncate">{user?.name}</p>
            <p className="text-[10px] text-slate-500">
              {user?.role === "ADMIN" ? "Administrador" : user?.role === "OWNER" ? "Proprietário" : "Equipe"}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto scrollbar-thin">
        {/* Top items */}
        {visibleTopItems.map(item => (
          <SidebarLink key={item.href} item={item} pathname={pathname} />
        ))}

        {/* Separator */}
        <div className="py-2">
          <div className="h-px bg-white/5" />
        </div>

        {/* Groups */}
        <div className="space-y-1">
          {visibleGroups.map(group => (
            <SidebarGroup key={group.id} group={group} pathname={pathname} isAdmin={isAdmin} />
          ))}
        </div>

        {/* Separator */}
        {visibleBottomItems.length > 0 && (
          <div className="py-2">
            <div className="h-px bg-white/5" />
          </div>
        )}

        {/* Bottom items */}
        {visibleBottomItems.map(item => (
          <SidebarLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-white/5">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200"
        >
          <LogOut size={17} />
          Sair
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-60 bg-[#0f172a] flex-col z-30">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 h-full w-[260px] bg-[#0f172a] flex flex-col z-50 md:hidden shadow-2xl"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-5 w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="md:ml-60 min-h-screen">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-sm border-b border-slate-200 px-4 py-3 md:hidden flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100"
            >
              <Menu size={20} className="text-slate-700" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <Home className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-slate-900 text-sm">RentalPro</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 relative">
              <Bell size={18} className="text-slate-600" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
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
        {visibleTopItems.slice(0, 5).map((item) => {
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
