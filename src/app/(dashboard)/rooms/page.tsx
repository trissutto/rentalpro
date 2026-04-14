"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DoorOpen, Plus, Edit2, Trash2, X, Check,
  ChevronUp, ChevronDown, Home, Layers, StickyNote,
} from "lucide-react";
import { apiRequest } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

// ─── Tipos de cômodo ──────────────────────────────────────────────────────────
const ROOM_TYPES = [
  { value: "Cozinha",       emoji: "🍳", color: "bg-orange-50 border-orange-200 text-orange-700" },
  { value: "Sala de Estar", emoji: "🛋️", color: "bg-amber-50 border-amber-200 text-amber-700" },
  { value: "Quarto",        emoji: "🛏️", color: "bg-indigo-50 border-indigo-200 text-indigo-700" },
  { value: "Banheiro",      emoji: "🚿", color: "bg-cyan-50 border-cyan-200 text-cyan-700" },
  { value: "Área Gourmet",  emoji: "🍖", color: "bg-red-50 border-red-200 text-red-700" },
  { value: "Piscina",       emoji: "🏊", color: "bg-blue-50 border-blue-200 text-blue-700" },
  { value: "Garagem",       emoji: "🚗", color: "bg-slate-50 border-slate-200 text-slate-700" },
  { value: "Área Externa",  emoji: "🌿", color: "bg-green-50 border-green-200 text-green-700" },
  { value: "Geral",         emoji: "🏠", color: "bg-gray-50 border-gray-200 text-gray-700" },
];

function getRoomType(value: string) {
  return ROOM_TYPES.find((r) => r.value === value) || ROOM_TYPES[ROOM_TYPES.length - 1];
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Property { id: string; name: string; city: string; }
interface Room {
  id: string;
  propertyId: string;
  name: string;
  type: string;
  floor: number;
  order: number;
  notes?: string;
  _count?: { propertyItems: number };
}

// ─── Modal de Cômodo ──────────────────────────────────────────────────────────
function RoomModal({
  room,
  propertyId,
  onClose,
  onSaved,
}: {
  room?: Room;
  propertyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name:  room?.name  || "",
    type:  room?.type  || "Quarto",
    floor: room?.floor || 1,
    notes: room?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const isEdit = !!room;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url    = isEdit ? `/api/rooms/${room!.id}` : "/api/rooms";
      const method = isEdit ? "PUT" : "POST";
      const res = await apiRequest(url, {
        method,
        body: JSON.stringify({ ...form, propertyId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success(isEdit ? "Cômodo atualizado!" : "Cômodo criado!");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const selectedType = getRoomType(form.type);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-slate-900">
            {isEdit ? "Editar Cômodo" : "Novo Cômodo"}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
              Tipo de cômodo *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ROOM_TYPES.map((rt) => (
                <button
                  key={rt.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: rt.value }))}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition-all text-center",
                    form.type === rt.value
                      ? `${rt.color} border-current`
                      : "border-slate-200 text-slate-400 hover:border-slate-300"
                  )}
                >
                  <span className="text-xl">{rt.emoji}</span>
                  <span className="text-[9px] font-semibold leading-tight">{rt.value}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Nome personalizado */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
              Nome do cômodo *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-lg pointer-events-none">{selectedType.emoji}</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={`Ex: ${form.type} Master, ${form.type} 1...`}
                className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Sugestões: {form.type} 1 · {form.type} Master · {form.type} Social · {form.type} Suite
            </p>
          </div>

          {/* Andar */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
              Andar / Pavimento
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setForm((fm) => ({ ...fm, floor: f }))}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all",
                    form.floor === f
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-slate-200 text-slate-500 hover:border-blue-300"
                  )}
                >
                  {f === 1 ? "Térreo" : `${f}º`}
                </button>
              ))}
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
              Observações (opcional)
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Ex: Cama king size, vista para o mar..."
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
              {saving
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Check size={15} />}
              {isEdit ? "Salvar" : "Criar Cômodo"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function RoomsPage() {
  const [properties, setProperties]       = useState<Property[]>([]);
  const [selectedId,  setSelectedId]      = useState<string>("");
  const [rooms,       setRooms]           = useState<Room[]>([]);
  const [loading,     setLoading]         = useState(false);
  const [showModal,   setShowModal]       = useState(false);
  const [editingRoom, setEditingRoom]     = useState<Room | undefined>();

  // Carregar propriedades
  useEffect(() => {
    apiRequest("/api/properties")
      .then((r) => r.json())
      .then((d) => {
        setProperties(d.properties ?? []);
        if (d.properties?.length > 0) setSelectedId(d.properties[0].id);
      });
  }, []);

  // Carregar cômodos do imóvel selecionado
  const loadRooms = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/api/rooms?propertyId=${selectedId}`);
      const data = await res.json();
      setRooms(data.rooms ?? []);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // ─── Mover ordem ────────────────────────────────────────────────────────────
  const moveRoom = async (room: Room, dir: "up" | "down") => {
    const same = rooms.filter((r) => r.floor === room.floor);
    const idx  = same.findIndex((r) => r.id === room.id);
    const swap = dir === "up" ? same[idx - 1] : same[idx + 1];
    if (!swap) return;

    await Promise.all([
      apiRequest(`/api/rooms/${room.id}`, { method: "PUT", body: JSON.stringify({ ...room, order: swap.order }) }),
      apiRequest(`/api/rooms/${swap.id}`, { method: "PUT", body: JSON.stringify({ ...swap, order: room.order }) }),
    ]);
    loadRooms();
  };

  // ─── Remover ─────────────────────────────────────────────────────────────
  const handleDelete = async (room: Room) => {
    if (!confirm(`Remover "${room.name}"?`)) return;
    try {
      const res = await apiRequest(`/api/rooms/${room.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Cômodo removido!");
      loadRooms();
    } catch {
      toast.error("Erro ao remover cômodo");
    }
  };

  // ─── Agrupar por andar ────────────────────────────────────────────────────
  const floors = [...new Set(rooms.map((r) => r.floor))].sort();
  const floorLabel = (f: number) => f === 1 ? "Térreo" : `${f}º Andar`;

  const selectedProperty = properties.find((p) => p.id === selectedId);

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 pt-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <DoorOpen size={22} className="text-blue-600" />
            Cômodos
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Gerencie os ambientes de cada imóvel
          </p>
        </div>
        <button
          onClick={() => { setEditingRoom(undefined); setShowModal(true); }}
          disabled={!selectedId}
          className="btn-primary py-2 px-4 text-sm disabled:opacity-40"
        >
          <Plus size={15} /> Novo Cômodo
        </button>
      </div>

      {/* Seletor de imóvel */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5">
        <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
          <Home size={12} className="inline mr-1" /> Imóvel
        </label>
        <div className="flex flex-wrap gap-2">
          {properties.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={cn(
                "px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all",
                selectedId === p.id
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              )}
            >
              🏠 {p.name}
              <span className="ml-1 text-xs opacity-60">{p.city}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      {!selectedId ? (
        <div className="text-center py-16 text-slate-400">
          <Home size={40} className="mx-auto mb-3 opacity-30" />
          <p>Selecione um imóvel acima</p>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl">
          <DoorOpen size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="font-medium text-slate-500">Nenhum cômodo cadastrado</p>
          <p className="text-sm text-slate-400 mt-1">
            Adicione os ambientes de <strong>{selectedProperty?.name}</strong>
          </p>
          <button
            onClick={() => { setEditingRoom(undefined); setShowModal(true); }}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
          >
            + Adicionar primeiro cômodo
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {floors.map((floor) => {
            const floorRooms = rooms
              .filter((r) => r.floor === floor)
              .sort((a, b) => a.order - b.order);

            return (
              <div key={floor}>
                {/* Header do andar */}
                <div className="flex items-center gap-2 mb-3">
                  <Layers size={14} className="text-slate-400" />
                  <span className="text-sm font-semibold text-slate-600">{floorLabel(floor)}</span>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {floorRooms.length} cômodo{floorRooms.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="space-y-2">
                  <AnimatePresence>
                    {floorRooms.map((room, idx) => {
                      const rt = getRoomType(room.type);
                      return (
                        <motion.div
                          key={room.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3 hover:shadow-sm transition group"
                        >
                          {/* Ícone do tipo */}
                          <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-xl border-2 flex-shrink-0", rt.color)}>
                            {rt.emoji}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900">{room.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", rt.color)}>
                                {rt.value}
                              </span>
                              {(room._count?.propertyItems ?? 0) > 0 && (
                                <span className="text-[10px] text-slate-400">
                                  📦 {room._count?.propertyItems} iten{(room._count?.propertyItems ?? 0) !== 1 ? "s" : ""}
                                </span>
                              )}
                              {room.notes && (
                                <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                  <StickyNote size={9} /> {room.notes}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Reordenar */}
                          <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => moveRoom(room, "up")}
                              disabled={idx === 0}
                              className="p-1 hover:bg-slate-100 rounded-lg disabled:opacity-20 transition"
                            >
                              <ChevronUp size={13} className="text-slate-400" />
                            </button>
                            <button
                              onClick={() => moveRoom(room, "down")}
                              disabled={idx === floorRooms.length - 1}
                              className="p-1 hover:bg-slate-100 rounded-lg disabled:opacity-20 transition"
                            >
                              <ChevronDown size={13} className="text-slate-400" />
                            </button>
                          </div>

                          {/* Editar / Deletar */}
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => { setEditingRoom(room); setShowModal(true); }}
                              className="p-1.5 hover:bg-blue-50 rounded-xl text-slate-400 hover:text-blue-600 transition"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(room)}
                              className="p-1.5 hover:bg-red-50 rounded-xl text-slate-400 hover:text-red-500 transition"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}

          {/* Resumo */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <p className="text-sm font-semibold text-blue-700 mb-1">
              📊 {selectedProperty?.name} — {rooms.length} cômodo{rooms.length !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ROOM_TYPES.filter((rt) => rooms.some((r) => r.type === rt.value)).map((rt) => {
                const count = rooms.filter((r) => r.type === rt.value).length;
                return (
                  <span key={rt.value} className={cn("text-xs px-2 py-1 rounded-lg border font-medium", rt.color)}>
                    {rt.emoji} {rt.value} ({count})
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && selectedId && (
          <RoomModal
            room={editingRoom}
            propertyId={selectedId}
            onClose={() => { setShowModal(false); setEditingRoom(undefined); }}
            onSaved={() => { setShowModal(false); setEditingRoom(undefined); loadRooms(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
