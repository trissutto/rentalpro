"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Check,
  Filter,
  Tag,
  ChevronDown,
} from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Item {
  id: string;
  name: string;
  category: string;
  description?: string;
  unit: string;
  icon: string;
  active: boolean;
}

// ─── Cômodos (categorias por ambiente) ───────────────────────────────────────
const CATEGORIES = [
  { value: "Cozinha",       label: "Cozinha",       emoji: "🍳" },
  { value: "Sala de Estar", label: "Sala de Estar", emoji: "🛋️" },
  { value: "Quarto",        label: "Quarto",        emoji: "🛏️" },
  { value: "Banheiro",      label: "Banheiro",      emoji: "🚿" },
  { value: "Área Gourmet",  label: "Área Gourmet",  emoji: "🍖" },
  { value: "Piscina",       label: "Piscina",       emoji: "🏊" },
  { value: "Garagem",       label: "Garagem",       emoji: "🚗" },
  { value: "Área Externa",  label: "Área Externa",  emoji: "🌿" },
  { value: "Geral",         label: "Geral",         emoji: "🏠" },
];

const UNITS = ["un", "par", "jogo", "kit", "L", "kg", "m"];

const ICONS = [
  // Cozinha
  "🍴","🔪","🥄","🍳","🥘","🫕","🍽️","🥗","🧊","🫗",
  "🍵","☕","🥤","🍶","🫖","🧃","🪣","🏺","🫙","🪤",
  // Sala / Quarto
  "🛏️","🛋️","🪑","🖼️","🕯️","🪞","🪟","🚪","📺","❄️",
  "🔌","💡","🔋","📱","💻","🎵","🎮","📚","🖥️","🪆",
  // Banheiro
  "🚿","🛁","🧻","🧼","🪥","🧴","🫧","🪠","🩺","🧽",
  // Área Gourmet / Piscina / Externa
  "🍖","🔥","🌡️","🏊","🛟","🌿","🪴","⛱️","🎾","🏓",
  // Garagem / Geral
  "🚗","🔧","🔩","🪛","🧯","🔐","🔑","🗝️","📦","🏠",
];

// ─── Modal de Item ────────────────────────────────────────────────────────────
function ItemModal({
  item,
  onClose,
  onSave,
}: {
  item?: Item;
  onClose: () => void;
  onSave: (data: Partial<Item>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: item?.name || "",
    category: item?.category || "Cozinha",
    description: item?.description || "",
    unit: item?.unit || "un",
    icon: item?.icon || "📦",
  });
  const [saving, setSaving] = useState(false);
  const [showIcons, setShowIcons] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">
            {item ? "Editar Item" : "Novo Item"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Ícone + Nome */}
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <label className="block text-xs font-medium text-gray-500 mb-1">Ícone</label>
              <button
                type="button"
                onClick={() => setShowIcons(!showIcons)}
                className="w-12 h-12 rounded-xl border-2 border-gray-200 flex items-center justify-center text-2xl hover:border-blue-400 transition"
              >
                {form.icon}
              </button>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Nome *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Garfo de mesa"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Picker de ícones */}
          <AnimatePresence>
            {showIcons && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="grid grid-cols-10 gap-1 p-3 bg-gray-50 rounded-xl border border-gray-200 overflow-hidden"
              >
                {ICONS.map((ico) => (
                  <button
                    key={ico}
                    type="button"
                    onClick={() => { setForm({ ...form, icon: ico }); setShowIcons(false); }}
                    className={`text-xl p-1 rounded-lg hover:bg-white transition ${form.icon === ico ? "bg-blue-100 ring-2 ring-blue-400" : ""}`}
                  >
                    {ico}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Categoria */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Categoria *</label>
            <div className="relative">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Unidade */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Unidade</label>
            <div className="flex gap-2 flex-wrap">
              {UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setForm({ ...form, unit: u })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                    form.unit === u
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Descrição (opcional)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Detalhes adicionais sobre o item..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Check size={16} />
              )}
              Salvar
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todos");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | undefined>();
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/items");
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      showToast("error", "Erro ao carregar itens");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // ─── Filtro ───────────────────────────────────────────────────────────────
  const filtered = items.filter((item) => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "Todos" || item.category === categoryFilter;
    return matchSearch && matchCat;
  });

  // Agrupar por categoria
  const grouped = CATEGORIES.reduce((acc, cat) => {
    const catItems = filtered.filter((i) => i.category === cat.value);
    if (catItems.length > 0) acc[cat.value] = { ...cat, items: catItems };
    return acc;
  }, {} as Record<string, typeof CATEGORIES[0] & { items: Item[] }>);

  // ─── Ações ────────────────────────────────────────────────────────────────
  const handleSave = async (data: Partial<Item>) => {
    try {
      if (editingItem) {
        const res = await fetch(`/api/items/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error();
        showToast("success", "Item atualizado com sucesso!");
      } else {
        const res = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error();
        showToast("success", "Item criado com sucesso!");
      }
      setShowModal(false);
      setEditingItem(undefined);
      fetchItems();
    } catch {
      showToast("error", editingItem ? "Erro ao atualizar item" : "Erro ao criar item");
    }
  };

  const handleDelete = async (item: Item) => {
    if (!confirm(`Remover "${item.name}"?`)) return;
    try {
      const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      showToast("success", "Item removido!");
      fetchItems();
    } catch {
      showToast("error", "Erro ao remover item");
    }
  };

  const openEdit = (item: Item) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const openNew = () => {
    setEditingItem(undefined);
    setShowModal(true);
  };

  // ─── Contadores ───────────────────────────────────────────────────────────
  const totalByCategory = CATEGORIES.map((cat) => ({
    ...cat,
    count: items.filter((i) => i.category === cat.value).length,
  })).filter((c) => c.count > 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium text-white ${
              toast.type === "success" ? "bg-green-500" : "bg-red-500"
            }`}
          >
            {toast.type === "success" ? <Check size={16} /> : <X size={16} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Package size={22} className="text-blue-600" />
                Itens do Inventário
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {items.length} itens cadastrados · base para checklists das casas
              </p>
            </div>
            <button
              onClick={openNew}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition shadow-sm shadow-blue-200"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Novo Item</span>
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar item ou categoria..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* Filtros por categoria */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setCategoryFilter("Todos")}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              categoryFilter === "Todos"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
            }`}
          >
            Todos ({items.length})
          </button>
          {totalByCategory.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                categoryFilter === cat.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
              }`}
            >
              {cat.emoji} {cat.label} ({cat.count})
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Package size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Nenhum item encontrado</p>
            <p className="text-gray-400 text-sm mt-1">
              {search ? "Tente uma busca diferente" : "Clique em \"Novo Item\" para começar"}
            </p>
            {!search && (
              <button
                onClick={openNew}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
              >
                + Adicionar primeiro item
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.values(grouped).map((group) => (
              <div key={group.value}>
                {/* Cabeçalho da categoria */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{group.emoji}</span>
                  <h2 className="font-semibold text-gray-700 text-sm">{group.label}</h2>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {group.items.length}
                  </span>
                </div>

                {/* Grid de itens */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <AnimatePresence>
                    {group.items.map((item, idx) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-3 hover:shadow-md transition group"
                      >
                        {/* Ícone */}
                        <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-2xl flex-shrink-0">
                          {item.icon}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-800 text-sm truncate">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{item.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                              {item.unit}
                            </span>
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => openEdit(item)}
                            className="p-1.5 hover:bg-blue-50 rounded-lg transition text-gray-400 hover:text-blue-600"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="p-1.5 hover:bg-red-50 rounded-lg transition text-gray-400 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dica */}
        {items.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
            <Tag size={18} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-700">Próximo passo</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Com os itens cadastrados, acesse cada <strong>imóvel</strong> para definir quantos de cada item ele deve ter. Isso vai gerar o checklist de verificação automático.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <ItemModal
            item={editingItem}
            onClose={() => { setShowModal(false); setEditingItem(undefined); }}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
