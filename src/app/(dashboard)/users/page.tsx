"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Shield, X, Loader2, Crown, Wrench,
  Phone, Mail, Edit2, Trash2, Check, Eye, EyeOff,
} from "lucide-react";
import { apiRequest, useAuthStore } from "@/hooks/useAuth";
import { cn, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface UserItem {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  specialty?: string;
  createdAt: string;
}

// ─── Especialidades de Equipe ─────────────────────────────────────────────────
const SPECIALTIES = [
  { value: "Limpeza",      emoji: "🧹", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  { value: "Manutenção",   emoji: "🔧", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { value: "Jardinagem",   emoji: "🌿", color: "bg-green-50 text-green-700 border-green-200" },
  { value: "Piscina",      emoji: "🏊", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "Segurança",    emoji: "🔐", color: "bg-slate-50 text-slate-700 border-slate-200" },
  { value: "Recepção",     emoji: "🛎️", color: "bg-pink-50 text-pink-700 border-pink-200" },
  { value: "Almoxarifado", emoji: "📦", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "Outros",       emoji: "👤", color: "bg-gray-50 text-gray-700 border-gray-200" },
];

function getSpecialty(value?: string) {
  return SPECIALTIES.find((s) => s.value === value) || SPECIALTIES[SPECIALTIES.length - 1];
}

const ROLE_CONFIG = {
  ADMIN: { label: "Administrador", icon: Shield, badge: "bg-purple-100 text-purple-700", desc: "Acesso total ao sistema" },
  OWNER: { label: "Proprietário",  icon: Crown,  badge: "bg-amber-100 text-amber-700",  desc: "Visualiza calendário e financeiro dos seus imóveis" },
  TEAM:  { label: "Equipe",        icon: Wrench, badge: "bg-blue-100 text-blue-700",    desc: "Gestão operacional (reservas e limpeza)" },
};

// ─── Modal Criar / Editar ─────────────────────────────────────────────────────
function UserModal({
  user: editing,
  onClose,
  onSaved,
}: {
  user?: UserItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user: me } = useAuthStore();
  const [form, setForm] = useState({
    name:      editing?.name      || "",
    email:     editing?.email     || "",
    phone:     editing?.phone     || "",
    password:  "",
    role:      editing?.role      || "TEAM",
    specialty: editing?.specialty || "Limpeza",
  });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const set = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));
  const isEdit = !!editing;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const url    = isEdit ? `/api/auth/users/${editing!.id}` : "/api/auth/users";
      const method = isEdit ? "PUT" : "POST";
      const res    = await apiRequest(url, { method, body: JSON.stringify(form) });
      const data   = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(isEdit ? "Usuário atualizado!" : "Usuário cadastrado!");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        className="modal-content max-h-[92vh] overflow-y-auto"
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-900">
            {isEdit ? "Editar Usuário" : "Novo Usuário"}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Perfil de acesso */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Perfil de acesso *</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(ROLE_CONFIG).map(([role, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <button
                    key={role} type="button"
                    onClick={() => set("role", role)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                      form.role === role
                        ? role === "ADMIN" ? "border-purple-400 bg-purple-50 text-purple-700"
                          : role === "OWNER" ? "border-amber-400 bg-amber-50 text-amber-700"
                          : "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    )}
                  >
                    <Icon size={18} />
                    <span className="text-xs font-semibold">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Função da equipe */}
          <AnimatePresence>
            {form.role === "TEAM" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <label className="block text-sm font-semibold text-slate-700 mb-2">Função / Especialidade *</label>
                <div className="grid grid-cols-2 gap-2">
                  {SPECIALTIES.map((s) => (
                    <button
                      key={s.value} type="button"
                      onClick={() => set("specialty", s.value)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left",
                        form.specialty === s.value
                          ? `${s.color} border-current font-semibold`
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      )}
                    >
                      <span className="text-lg">{s.emoji}</span>
                      <span className="text-sm">{s.value}</span>
                      {form.specialty === s.value && <Check size={14} className="ml-auto" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome completo *</label>
            <input className="input-base" placeholder="João Silva" value={form.name}
              onChange={(e) => set("name", e.target.value)} required />
          </div>

          {/* E-mail (readonly se edição) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail *</label>
            <input type="email" className={cn("input-base", isEdit && "bg-slate-50 cursor-not-allowed")}
              placeholder="joao@email.com" value={form.email}
              onChange={(e) => set("email", e.target.value)}
              readOnly={isEdit} required />
            {isEdit && <p className="text-xs text-slate-400 mt-1">O e-mail não pode ser alterado.</p>}
          </div>

          {/* Telefone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Telefone / WhatsApp</label>
            <input type="tel" className="input-base" placeholder="(11) 99999-9999" value={form.phone}
              onChange={(e) => set("phone", e.target.value)} />
          </div>

          {/* Senha */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {isEdit ? "Nova senha (deixe em branco para não alterar)" : "Senha *"}
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                className="input-base pr-10"
                placeholder={isEdit ? "••••••" : "Mínimo 6 caracteres"}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                required={!isEdit}
                minLength={isEdit ? 0 : 6}
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : isEdit ? "Salvar" : "Cadastrar"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Card de usuário ──────────────────────────────────────────────────────────
function UserCard({
  u,
  currentUserId,
  onEdit,
  onDelete,
}: {
  u: UserItem;
  currentUserId?: string;
  onEdit: (u: UserItem) => void;
  onDelete: (u: UserItem) => void;
}) {
  const roleCfg = ROLE_CONFIG[u.role as keyof typeof ROLE_CONFIG];
  const spec = u.role === "TEAM" ? getSpecialty(u.specialty) : null;
  const isMe = u.id === currentUserId;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-100 p-4 flex items-start gap-3 hover:shadow-sm transition group"
    >
      {/* Avatar */}
      <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center text-base font-bold flex-shrink-0", roleCfg?.badge)}>
        {spec ? spec.emoji : u.name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-semibold text-slate-900">{u.name}</p>
          {isMe && <span className="text-[10px] bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded-full font-medium">Você</span>}
          {spec && (
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-semibold", spec.color)}>
              {spec.emoji} {spec.value}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-3 mt-1">
          <a href={`mailto:${u.email}`} className="text-xs text-slate-400 flex items-center gap-1 hover:text-brand-600 transition">
            <Mail size={10} /> {u.email}
          </a>
          {u.phone && (
            <a href={`https://wa.me/55${u.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
              className="text-xs text-slate-400 flex items-center gap-1 hover:text-green-600 transition">
              <Phone size={10} /> {u.phone}
            </a>
          )}
        </div>
        <p className="text-[10px] text-slate-300 mt-1">desde {formatDate(u.createdAt, "MMM/yy")}</p>
      </div>

      {/* Ações */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
        <button onClick={() => onEdit(u)} className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-400 hover:text-blue-600 transition">
          <Edit2 size={14} />
        </button>
        {!isMe && (
          <button onClick={() => onDelete(u)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function UsersPage() {
  const { user: me } = useAuthStore();
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | undefined>();

  useEffect(() => {
    if (me && me.role !== "ADMIN") { router.push("/"); return; }
    loadUsers();
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = roleFilter ? `?role=${roleFilter}` : "";
      const res = await apiRequest(`/api/auth/users${params}`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => { if (!loading) loadUsers(); }, [roleFilter]);

  // ─── Filtros ───────────────────────────────────────────────────────────────
  const filtered = users.filter((u) => {
    if (specialtyFilter && u.specialty !== specialtyFilter) return false;
    return true;
  });

  const grouped = {
    ADMIN: filtered.filter((u) => u.role === "ADMIN"),
    OWNER: filtered.filter((u) => u.role === "OWNER"),
    TEAM:  filtered.filter((u) => u.role === "TEAM"),
  };

  // Especialidades que têm pelo menos 1 membro
  const activeSpecialties = SPECIALTIES.filter((s) =>
    users.some((u) => u.role === "TEAM" && u.specialty === s.value)
  );

  // ─── Ações ────────────────────────────────────────────────────────────────
  const handleDelete = async (u: UserItem) => {
    if (!confirm(`Desativar "${u.name}"?`)) return;
    try {
      const res = await apiRequest(`/api/auth/users/${u.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success("Usuário desativado!");
      loadUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao desativar");
    }
  };

  const openEdit = (u: UserItem) => { setEditingUser(u); setShowModal(true); };
  const openNew  = ()            => { setEditingUser(undefined); setShowModal(true); };

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 pt-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Usuários</h1>
          <p className="text-sm text-slate-400">{users.length} usuário(s) cadastrado(s)</p>
        </div>
        <button onClick={openNew} className="btn-primary py-2 px-4 text-sm flex items-center gap-1.5">
          <Plus size={16} /> Novo
        </button>
      </div>

      {/* Filtro por papel */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {[
          { value: "", label: "Todos" },
          { value: "ADMIN", label: "Admins" },
          { value: "OWNER", label: "Proprietários" },
          { value: "TEAM",  label: "Equipe" },
        ].map((f) => (
          <button key={f.value} onClick={() => { setRoleFilter(f.value); setSpecialtyFilter(""); }}
            className={cn("px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all",
              roleFilter === f.value ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200"
            )}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Filtro por especialidade (só quando "Equipe" selecionada ou nenhum filtro) */}
      <AnimatePresence>
        {(roleFilter === "TEAM" || (!roleFilter && activeSpecialties.length > 0)) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSpecialtyFilter("")}
                className={cn("flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium border transition",
                  !specialtyFilter ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200"
                )}>
                Todas funções
              </button>
              {activeSpecialties.map((s) => (
                <button key={s.value} onClick={() => setSpecialtyFilter(s.value === specialtyFilter ? "" : s.value)}
                  className={cn("flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border transition",
                    specialtyFilter === s.value ? `${s.color} border-current` : "bg-white text-slate-600 border-slate-200"
                  )}>
                  {s.emoji} {s.value}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista de usuários */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {(roleFilter ? [roleFilter] : ["ADMIN", "OWNER", "TEAM"]).map((role) => {
            const cfg = ROLE_CONFIG[role as keyof typeof ROLE_CONFIG];
            const Icon = cfg.icon;
            const list = grouped[role as keyof typeof grouped];
            if (list.length === 0 && roleFilter) return null;

            return (
              <div key={role}>
                {/* Cabeçalho da seção */}
                <div className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl border mb-3",
                  role === "ADMIN" ? "bg-purple-50 border-purple-200 text-purple-700"
                  : role === "OWNER" ? "bg-amber-50 border-amber-200 text-amber-700"
                  : "bg-blue-50 border-blue-200 text-blue-700"
                )}>
                  <Icon size={14} />
                  <span className="text-sm font-semibold">{cfg.label}s</span>
                  <span className="ml-auto text-xs font-bold opacity-60">{list.length}</span>
                </div>

                {list.length === 0 ? (
                  <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-2xl">
                    <p className="text-sm text-slate-400">Nenhum {cfg.label.toLowerCase()} cadastrado</p>
                    <button onClick={openNew}
                      className="mt-2 text-xs text-brand-600 font-medium hover:underline">
                      + Adicionar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {list.map((u) => (
                      <UserCard key={u.id} u={u} currentUserId={me?.id}
                        onEdit={openEdit} onDelete={handleDelete} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legenda de especialidades */}
      {(roleFilter === "" || roleFilter === "TEAM") && users.some((u) => u.role === "TEAM") && (
        <div className="mt-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
          <p className="text-xs font-semibold text-slate-500 mb-3">FUNÇÕES DE EQUIPE</p>
          <div className="grid grid-cols-2 gap-2">
            {SPECIALTIES.map((s) => (
              <div key={s.value} className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border text-xs", s.color)}>
                <span>{s.emoji}</span>
                <span className="font-medium">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <UserModal
            user={editingUser}
            onClose={() => { setShowModal(false); setEditingUser(undefined); }}
            onSaved={() => { setShowModal(false); setEditingUser(undefined); loadUsers(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
