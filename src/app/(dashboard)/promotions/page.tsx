"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Megaphone, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  X, Save, Calendar, Link as LinkIcon, Eye, EyeOff,
  ImagePlus, ImageOff, Loader2,
} from "lucide-react";
import { apiRequest } from "@/hooks/useAuth";
import toast from "react-hot-toast";

interface Promotion {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  emoji: string;
  bgGradient: string;
  textColor: string;
  ctaText: string;
  ctaUrl: string;
  imageUrl: string | null;
  showAsPopup: boolean;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  order: number;
  createdAt: string;
}

const GRADIENT_OPTIONS = [
  { label: "Teal → Ciano",       value: "from-teal-500 to-cyan-600",     css: "linear-gradient(135deg, #14b8a6, #0891b2)" },
  { label: "Roxo → Rosa",        value: "from-purple-500 to-pink-600",   css: "linear-gradient(135deg, #a855f7, #db2777)" },
  { label: "Laranja → Vermelho", value: "from-orange-400 to-red-500",    css: "linear-gradient(135deg, #fb923c, #ef4444)" },
  { label: "Azul → Índigo",      value: "from-blue-500 to-indigo-600",   css: "linear-gradient(135deg, #3b82f6, #4f46e5)" },
  { label: "Verde → Esmeralda",  value: "from-green-500 to-emerald-600", css: "linear-gradient(135deg, #22c55e, #059669)" },
  { label: "Amarelo → Laranja",  value: "from-yellow-400 to-orange-500", css: "linear-gradient(135deg, #facc15, #f97316)" },
  { label: "Rosa → Fúcsia",      value: "from-pink-500 to-fuchsia-600",  css: "linear-gradient(135deg, #ec4899, #c026d3)" },
  { label: "Ardósia → Cinza",    value: "from-slate-600 to-gray-700",    css: "linear-gradient(135deg, #475569, #374151)" },
  { label: "Âmbar → Marrom",     value: "from-amber-500 to-brown-600",   css: "linear-gradient(135deg, #f59e0b, #92400e)" },
  { label: "Violeta → Púrpura",  value: "from-violet-500 to-purple-600", css: "linear-gradient(135deg, #8b5cf6, #9333ea)" },
];

function getGradientCSS(key: string) {
  return GRADIENT_OPTIONS.find((g) => g.value === key)?.css ?? "linear-gradient(135deg, #14b8a6, #0891b2)";
}

const EMOJI_OPTIONS = ["🎉", "🎄", "🎆", "🏖️", "🌅", "🏡", "💎", "🔥", "⭐", "🎁", "🌴", "🍾", "🎊", "✨", "🌊", "🦀"];

const EMPTY_FORM = {
  title: "",
  subtitle: "",
  description: "",
  emoji: "🎉",
  bgGradient: "from-teal-500 to-cyan-600",
  textColor: "white",
  ctaText: "Ver imóveis",
  ctaUrl: "/imoveis",
  imageUrl: "",
  showAsPopup: false,
  startDate: "",
  endDate: "",
  active: true,
  order: 0,
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const backdropMouseDownRef = useRef(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiRequest("/api/admin/promotions");
      const data = await res.json();
      setPromotions(data.promotions ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }

  function openEdit(p: Promotion) {
    setEditingId(p.id);
    setForm({
      title: p.title,
      subtitle: p.subtitle ?? "",
      description: p.description ?? "",
      emoji: p.emoji,
      bgGradient: p.bgGradient,
      textColor: p.textColor,
      ctaText: p.ctaText,
      ctaUrl: p.ctaUrl,
      imageUrl: p.imageUrl ?? "",
      showAsPopup: p.showAsPopup ?? false,
      startDate: p.startDate ? p.startDate.slice(0, 10) : "",
      endDate: p.endDate ? p.endDate.slice(0, 10) : "",
      active: p.active,
      order: p.order,
    });
    setShowModal(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = localStorage.getItem("token");
      // Não usar apiRequest aqui — ele força Content-Type: application/json
      // que quebra o multipart/form-data do FormData
      const res = await fetch("/api/admin/promotions/upload-image", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (data.url) setForm((f) => ({ ...f, imageUrl: data.url }));
      else alert(data.error ?? "Erro ao fazer upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error("Título obrigatório"); return; }
    setSaving(true);
    try {
      const body = {
        ...form,
        subtitle: form.subtitle || null,
        description: form.description || null,
        imageUrl: form.imageUrl || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        order: Number(form.order),
      };
      let res: Response;
      if (editingId) {
        res = await apiRequest(`/api/admin/promotions/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        res = await apiRequest("/api/admin/promotions", { method: "POST", body: JSON.stringify(body) });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erro ${res.status}`);
      }
      toast.success(editingId ? "Promoção atualizada!" : "Promoção criada!");
      setShowModal(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar promoção");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta promoção?")) return;
    setDeletingId(id);
    try {
      const res = await apiRequest(`/api/admin/promotions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erro ${res.status}`);
      }
      toast.success("Promoção excluída");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(p: Promotion) {
    setTogglingId(p.id);
    try {
      const res = await apiRequest(`/api/admin/promotions/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !p.active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erro ${res.status}`);
      }
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao alterar status");
    } finally {
      setTogglingId(null);
    }
  }

  const activeCount = promotions.filter((p) => p.active).length;
  const now = new Date();
  const liveCount = promotions.filter((p) => {
    if (!p.active) return false;
    if (p.startDate && new Date(p.startDate) > now) return false;
    if (p.endDate && new Date(p.endDate) < now) return false;
    return true;
  }).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Megaphone className="text-brand-600" size={24} />
            Promoções
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Banners e campanhas exibidos na página pública de imóveis
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Nova Promoção
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Total</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{promotions.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Ativas</p>
          <p className="text-3xl font-bold text-emerald-600 mt-1">{activeCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Ao Vivo</p>
          <p className="text-3xl font-bold text-brand-600 mt-1">{liveCount}</p>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : promotions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <Megaphone size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Nenhuma promoção cadastrada</p>
          <p className="text-slate-400 text-sm mt-1">Crie banners para Natal, Ano Novo, Feriados e muito mais</p>
          <button
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors"
          >
            <Plus size={14} />
            Criar primeira promoção
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {promotions.map((promo) => {
            const isLive = promo.active && (!promo.startDate || new Date(promo.startDate) <= now) && (!promo.endDate || new Date(promo.endDate) >= now);
            return (
              <motion.div
                key={promo.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
              >
                <div className="flex items-stretch">
                  {/* Color strip / image preview */}
                  {promo.imageUrl ? (
                    <div
                      className="w-20 flex-shrink-0 bg-cover bg-center"
                      style={{ backgroundImage: `url(${promo.imageUrl})` }}
                    />
                  ) : (
                    <div className="w-2 flex-shrink-0 rounded-l-2xl" style={{ background: getGradientCSS(promo.bgGradient) }} />
                  )}

                  {/* Main content */}
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-3xl flex-shrink-0">{promo.emoji}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-900 truncate">{promo.title}</p>
                            {isLive && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-wide">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                Ao vivo
                              </span>
                            )}
                            {!promo.active && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-bold uppercase tracking-wide">
                                Inativa
                              </span>
                            )}
                            {promo.active && !isLive && (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold uppercase tracking-wide">
                                Agendada
                              </span>
                            )}
                            {promo.imageUrl && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold uppercase tracking-wide">
                                📷 Com imagem
                              </span>
                            )}
                          </div>
                          {promo.subtitle && (
                            <p className="text-sm text-slate-500 truncate mt-0.5">{promo.subtitle}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                            {(promo.startDate || promo.endDate) && (
                              <span className="flex items-center gap-1">
                                <Calendar size={11} />
                                {fmtDate(promo.startDate)} → {fmtDate(promo.endDate)}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <LinkIcon size={11} />
                              {promo.ctaUrl}
                            </span>
                            <span className="text-slate-300">ordem: {promo.order}</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleToggle(promo)}
                          disabled={togglingId === promo.id}
                          title={promo.active ? "Desativar" : "Ativar"}
                          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-50 transition-colors"
                        >
                          {promo.active
                            ? <ToggleRight size={22} className="text-emerald-500" />
                            : <ToggleLeft size={22} className="text-slate-300" />}
                        </button>
                        <button
                          onClick={() => openEdit(promo)}
                          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-brand-50 text-slate-400 hover:text-brand-600 transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(promo.id)}
                          disabled={deletingId === promo.id}
                          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onMouseDown={(e) => { backdropMouseDownRef.current = e.target === e.currentTarget; }}
            onMouseUp={(e) => { if (backdropMouseDownRef.current && e.target === e.currentTarget) setShowModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">
                  {editingId ? "Editar Promoção" : "Nova Promoção"}
                </h2>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100">
                  <X size={18} />
                </button>
              </div>

              {/* Preview mini banner */}
              <div className="px-6 pt-4">
                <div
                  className="rounded-2xl p-5 text-white relative overflow-hidden min-h-[120px]"
                  style={
                    form.imageUrl
                      ? {
                          backgroundImage: `linear-gradient(135deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.2) 100%), url(${form.imageUrl})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : { background: getGradientCSS(form.bgGradient) }
                  }
                >
                  <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-8 -translate-x-6 pointer-events-none" />
                  <div className="relative z-10">
                    <span className="text-3xl">{form.emoji || "🎉"}</span>
                    <p className="font-bold text-lg mt-1 leading-tight drop-shadow">{form.title || "Título da promoção"}</p>
                    {form.subtitle && <p className="text-sm opacity-80 mt-0.5 drop-shadow">{form.subtitle}</p>}
                    <div className="mt-3 inline-block px-4 py-1.5 bg-white/20 rounded-xl text-sm font-semibold backdrop-blur-sm border border-white/30">
                      {form.ctaText || "Ver imóveis"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Form */}
              <div className="p-6 space-y-5">
                {/* Image upload */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Imagem de Fundo (opcional)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-brand-400 hover:text-brand-600 transition-colors text-sm font-medium"
                    >
                      {uploading ? (
                        <><Loader2 size={16} className="animate-spin" /> Enviando...</>
                      ) : (
                        <><ImagePlus size={16} /> {form.imageUrl ? "Trocar imagem" : "Escolher imagem"}</>
                      )}
                    </button>
                    {form.imageUrl && (
                      <>
                        <img
                          src={form.imageUrl}
                          alt="preview"
                          className="w-14 h-10 rounded-lg object-cover border border-slate-200"
                        />
                        <button
                          onClick={() => setForm((f) => ({ ...f, imageUrl: "" }))}
                          className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
                        >
                          <ImageOff size={14} /> Remover
                        </button>
                      </>
                    )}
                  </div>
                  {form.imageUrl && (
                    <p className="text-xs text-slate-400 mt-1.5">
                      Com imagem, ela será usada como fundo do banner (com overlay escuro para legibilidade)
                    </p>
                  )}
                  {!form.imageUrl && (
                    <p className="text-xs text-slate-400 mt-1.5">
                      Sem imagem, o banner usa a cor de fundo selecionada abaixo
                    </p>
                  )}
                </div>

                {/* Emoji + Title */}
                <div className="grid grid-cols-[auto,1fr] gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Emoji</label>
                    <select
                      value={form.emoji}
                      onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                      className="h-10 px-2 border border-slate-200 rounded-xl text-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                    >
                      {EMOJI_OPTIONS.map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Título *</label>
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="Ex: Promoção de Natal"
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                  </div>
                </div>

                {/* Subtitle */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Subtítulo</label>
                  <input
                    value={form.subtitle}
                    onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                    placeholder="Ex: Reserve agora e garanta sua estadia"
                    className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Descrição (opcional)</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Detalhes adicionais da promoção..."
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
                  />
                </div>

                {/* Gradient (shown only when no image) */}
                {!form.imageUrl && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Cor de Fundo</label>
                    <div className="grid grid-cols-5 gap-2">
                      {GRADIENT_OPTIONS.map((g) => (
                        <button
                          key={g.value}
                          onClick={() => setForm({ ...form, bgGradient: g.value })}
                          title={g.label}
                          style={{ background: g.css }}
                          className={`h-10 rounded-xl transition-all ${form.bgGradient === g.value ? "ring-2 ring-offset-2 ring-brand-500 scale-105" : "opacity-70 hover:opacity-100"}`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* CTA */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Texto do Botão</label>
                    <input
                      value={form.ctaText}
                      onChange={(e) => setForm({ ...form, ctaText: e.target.value })}
                      placeholder="Ver imóveis"
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">URL do Botão</label>
                    <input
                      value={form.ctaUrl}
                      onChange={(e) => setForm({ ...form, ctaUrl: e.target.value })}
                      placeholder="/imoveis"
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Data Início</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Data Fim</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400 -mt-3">Deixe em branco para exibir sempre (sem prazo)</p>

                {/* Popup toggle */}
                <div
                  onClick={() => setForm({ ...form, showAsPopup: !form.showAsPopup })}
                  className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${form.showAsPopup ? "border-brand-400 bg-brand-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${form.showAsPopup ? "bg-brand-100" : "bg-slate-200"}`}>
                    🖼️
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${form.showAsPopup ? "text-brand-700" : "text-slate-600"}`}>
                      Exibir como Popup (1080×1080)
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Aparece para o visitante após 10 segundos na página, 1× por sessão
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${form.showAsPopup ? "bg-brand-500 border-brand-500" : "border-slate-300"}`}>
                    {form.showAsPopup && <svg viewBox="0 0 20 20" fill="white"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                  </div>
                </div>

                {/* Order + Active */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Ordem de exibição</label>
                    <input
                      type="number"
                      value={form.order}
                      onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
                      min={0}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => setForm({ ...form, active: !form.active })}
                      className={`w-full h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${form.active ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                    >
                      {form.active ? <><Eye size={15} /> Ativa</> : <><EyeOff size={15} /> Inativa</>}
                    </button>
                  </div>
                </div>

                {/* Save button */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 h-11 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {saving ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <><Save size={15} /> Salvar</>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
