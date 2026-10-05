"use client";

import { useEffect, useState, useRef, useCallback, useMemo, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X, Minus, Search, Package, ExternalLink, Loader2, LayoutGrid, Camera, Trash2 } from "lucide-react";
import { apiRequest } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import Link from "next/link";
import { lerFotos, MAX_FOTOS_POR_ITEM, type FotoInventario } from "@/lib/inventory-photos";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Property { id: string; name: string; city: string; }
interface Item { id: string; name: string; category: string; unit: string; icon: string; }
interface Room { id: string; name: string; type: string; floor: number; order: number; }
interface PropItem {
  id: string; itemId: string; roomId: string | null; quantity: number; item: Item; photos?: string;
}

const ROOM_ICONS: Record<string, string> = {
  kitchen: "🍳", living: "🛋️", bedroom: "🛏️", bathroom: "🚿",
  gourmet: "🍖", pool: "🏊", garage: "🚗", outdoor: "🌿", other: "📦",
};

// ── Sub-components (outside parent to avoid re-creation) ──────────────────────

/**
 * Foto de celular chega com 3–12 MB. Reduzir no aparelho antes de enviar
 * poupa o 4G de quem está na casa; o servidor ainda reconverte para WebP leve.
 * Se o navegador não conseguir decodificar (ex.: HEIC fora do Safari), envia
 * o original e o servidor resolve.
 */
async function reduzirFoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

const ItemCard = memo(function ItemCard({ pi, savingId, onQty, onRemove, onPhotos }: {
  pi: PropItem;
  savingId: string | null;
  onQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onPhotos: (pi: PropItem) => void;
}) {
  const saving = savingId === pi.id;
  const fotos = useMemo(() => lerFotos(pi.photos), [pi.photos]);
  const capa = fotos[fotos.length - 1];
  const temp = pi.id.startsWith("temp-");
  return (
    <div className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 rounded-xl px-2.5 py-2 group transition-colors">
      <span className="text-base leading-none flex-shrink-0">{pi.item.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-800 truncate">{pi.item.name}</p>
        <p className="text-[10px] text-slate-400">{pi.item.unit}</p>
      </div>
      <button onClick={() => onPhotos(pi)} disabled={temp}
        title={fotos.length ? `${fotos.length} foto(s)` : "Fotografar item"}
        aria-label={`Fotos de ${pi.item.name}`}
        className="relative w-6 h-6 rounded-md flex-shrink-0 overflow-hidden bg-white border border-slate-200 hover:border-brand-400 flex items-center justify-center transition disabled:opacity-40">
        {capa
          ? <img src={capa.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
          : <Camera size={13} className="text-slate-500" />}
        {fotos.length > 1 && (
          <span className="absolute bottom-0 right-0 bg-brand-600 text-white text-[8px] font-bold leading-none px-1 py-0.5 rounded-tl">
            {fotos.length}
          </span>
        )}
      </button>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onQty(pi.id, pi.quantity - 1)} disabled={saving}
          className="w-5 h-5 rounded-full bg-white border border-slate-200 hover:bg-red-50 flex items-center justify-center transition-colors">
          <Minus size={8} className="text-slate-500" />
        </button>
        <span className="text-xs font-bold text-slate-700 min-w-[20px] text-center">
          {saving ? <Loader2 size={10} className="animate-spin mx-auto text-slate-400" /> : pi.quantity}
        </span>
        <button onClick={() => onQty(pi.id, pi.quantity + 1)} disabled={saving}
          className="w-5 h-5 rounded-full bg-white border border-slate-200 hover:bg-green-50 flex items-center justify-center transition-colors">
          <Plus size={8} className="text-slate-500" />
        </button>
      </div>
      <button onClick={() => onRemove(pi.id)}
        className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center transition flex-shrink-0">
        <X size={9} className="text-red-400" />
      </button>
    </div>
  );
});

const RoomColumn = memo(function RoomColumn({ room, items, savingId, onOpen, onQty, onRemove, onPhotos }: {
  room: Room;
  items: PropItem[];
  savingId: string | null;
  onOpen: (roomId: string | null, label: string) => void;
  onQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onPhotos: (pi: PropItem) => void;
}) {
  const isGeral = room.id === "NONE";
  const icon = ROOM_ICONS[room.type] || "📦";
  return (
    <div className={cn(
      "flex-shrink-0 flex flex-col bg-white rounded-2xl border shadow-sm",
      isGeral ? "border-slate-200 border-dashed" : "border-slate-100"
    )} style={{ width: 264 }}>
      {/* Header */}
      <div className={cn("px-3 py-3 border-b flex items-center gap-2.5 rounded-t-2xl",
        isGeral ? "bg-slate-50 border-slate-100" : "bg-white border-slate-100")}>
        <span className="text-xl leading-none">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{room.name}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {items.length} {items.length === 1 ? "item" : "itens"}
            {!isGeral && room.floor > 0 && ` · ${room.floor === 1 ? "Térreo" : `${room.floor}º andar`}`}
          </p>
        </div>
        {items.length > 0 && (
          <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
            {items.length}
          </span>
        )}
      </div>
      {/* Items */}
      <div className="flex-1 p-2 space-y-1.5 overflow-y-auto" style={{ maxHeight: 380 }}>
        {items.length === 0 && <p className="text-xs text-slate-300 text-center py-6">Vazio</p>}
        {items.map(pi => (
          <ItemCard key={pi.id} pi={pi} savingId={savingId} onQty={onQty} onRemove={onRemove} onPhotos={onPhotos} />
        ))}
      </div>
      {/* Add */}
      <div className="p-2 pt-1 flex-shrink-0">
        <button
          onClick={() => onOpen(isGeral ? null : room.id, room.name)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold text-brand-600 hover:bg-brand-50 transition-colors border border-dashed border-brand-200 hover:border-brand-400"
        >
          <Plus size={13} /> Adicionar item
        </button>
      </div>
    </div>
  );
});

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InventarioPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProp, setSelectedProp] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [propItems, setPropItems] = useState<PropItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRoomId, setDrawerRoomId] = useState<string | null>(null);
  const [drawerLabel, setDrawerLabel] = useState("");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [photoItemId, setPhotoItemId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [viewing, setViewing] = useState<FotoInventario | null>(null);

  // ── Load on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      apiRequest("/api/properties").then(r => r.json()),
      apiRequest("/api/items").then(r => r.json()),
    ]).then(([pd, id]) => {
      const props: Property[] = pd.properties || [];
      setProperties(props);
      setAllItems(id.items || []);
      if (props.length > 0) setSelectedProp(props[0].id);
    }).catch(() => toast.error("Erro ao carregar dados"));
  }, []);

  useEffect(() => {
    if (!selectedProp) return;
    setLoading(true);
    setPropItems([]);
    Promise.all([
      apiRequest(`/api/rooms?propertyId=${selectedProp}`).then(r => r.json()),
      apiRequest(`/api/property-items?propertyId=${selectedProp}`).then(r => r.json()),
    ]).then(([rd, pid]) => {
      setRooms(rd.rooms || []);
      setPropItems(pid.propertyItems || []);
    }).catch(() => toast.error("Erro ao carregar inventário"))
      .finally(() => setLoading(false));
  }, [selectedProp]);

  useEffect(() => {
    if (drawerOpen) {
      setSearch("");
      setTimeout(() => { searchRef.current?.focus(); }, 120);
    }
  }, [drawerOpen]);

  // ── Stable callbacks ───────────────────────────────────────────────────────
  const openDrawer = useCallback((roomId: string | null, label: string) => {
    setDrawerRoomId(roomId);
    setDrawerLabel(label);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // remove defined first so updateQty can call it
  const removeItem = useCallback(async (propItemId: string) => {
    // Optimistic remove
    setPropItems(prev => prev.filter(pi => pi.id !== propItemId));
    try {
      await apiRequest(`/api/property-items/${propItemId}`, { method: "DELETE" });
    } catch {
      toast.error("Erro ao remover item");
    }
  }, []);

  const updateQty = useCallback(async (propItemId: string, quantity: number) => {
    if (quantity < 1) {
      removeItem(propItemId);
      return;
    }
    setSavingId(propItemId);
    setPropItems(prev => prev.map(pi => pi.id === propItemId ? { ...pi, quantity } : pi));
    try {
      const res = await apiRequest(`/api/property-items/${propItemId}`, {
        method: "PUT", body: JSON.stringify({ quantity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPropItems(prev => prev.map(pi => pi.id === propItemId ? data.propertyItem : pi));
    } catch {
      toast.error("Erro ao atualizar");
    } finally {
      setSavingId(null);
    }
  }, [removeItem]);

  const pendingIdsRef = useRef<string[]>([]);

  const addItem = useCallback(async (itemId: string, roomId: string | null, currentAllItems: Item[], currentPropId: string) => {
    if (pendingIdsRef.current.includes(itemId)) return;
    pendingIdsRef.current = [...pendingIdsRef.current, itemId];
    setPendingIds([...pendingIdsRef.current]);

    const foundItem = currentAllItems.find(i => i.id === itemId);
    const tempId = `temp-${Date.now()}`;
    const optimistic: PropItem = {
      id: tempId, itemId, roomId, quantity: 1,
      item: foundItem || { id: itemId, name: "...", category: "", unit: "un", icon: "📦" },
    };
    setPropItems(prev => [...prev, optimistic]);

    try {
      const res = await apiRequest("/api/property-items", {
        method: "POST",
        body: JSON.stringify({ propertyId: currentPropId, itemId, roomId, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPropItems(prev => prev.map(pi => pi.id === tempId ? data.propertyItem : pi));
    } catch {
      setPropItems(prev => prev.filter(pi => pi.id !== tempId));
      toast.error("Erro ao adicionar item");
    } finally {
      pendingIdsRef.current = pendingIdsRef.current.filter(id => id !== itemId);
      setPendingIds([...pendingIdsRef.current]);
    }
  }, []);

  // ── Fotos ──────────────────────────────────────────────────────────────────
  // Sem foto ainda: abre a câmera direto. Com foto: abre a galeria do item.
  const openPhotos = useCallback((pi: PropItem) => {
    setPhotoItemId(pi.id);
    if (lerFotos(pi.photos).length === 0) cameraRef.current?.click();
  }, []);

  const uploadPhotos = useCallback(async (propItemId: string, files: File[]) => {
    setPhotoItemId(propItemId);
    setUploading(n => n + files.length);
    // Uma por vez: no 4G, várias em paralelo competem e todas demoram
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append("file", await reduzirFoto(file), "foto.jpg");
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/property-items/${propItemId}/photos`, {
          method: "POST", body: fd, cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setPropItems(prev => prev.map(pi => pi.id === propItemId ? data.propertyItem : pi));
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : "Erro ao enviar foto");
      } finally {
        setUploading(n => n - 1);
      }
    }
  }, []);

  const deletePhoto = useCallback(async (propItemId: string, url: string) => {
    if (!confirm("Apagar esta foto?")) return;
    try {
      const res = await apiRequest(`/api/property-items/${propItemId}/photos`, {
        method: "DELETE", body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPropItems(prev => prev.map(pi => pi.id === propItemId ? data.propertyItem : pi));
      setViewing(null);
    } catch {
      toast.error("Erro ao apagar foto");
    }
  }, []);

  const photoItem = photoItemId ? propItems.find(pi => pi.id === photoItemId) : undefined;
  const photoList = useMemo(() => lerFotos(photoItem?.photos), [photoItem?.photos]);

  // ── Derived data (memoized) ────────────────────────────────────────────────
  const columns: Room[] = useMemo(() => [
    ...rooms,
    { id: "NONE", name: "Geral", type: "other", floor: 0, order: 9999 },
  ], [rooms]);

  const itemsByRoom = useMemo(() => {
    const map: Record<string, PropItem[]> = {};
    for (const pi of propItems) {
      const key = pi.roomId !== null && pi.roomId !== undefined ? pi.roomId : "NONE";
      if (!map[key]) map[key] = [];
      map[key].push(pi);
    }
    return map;
  }, [propItems]);

  const drawerGroups = useMemo(() => {
    const inRoom = propItems
      .filter(pi => pi.roomId === drawerRoomId)
      .map(pi => pi.itemId);
    const q = search.toLowerCase();
    const available = allItems.filter(item =>
      !inRoom.includes(item.id) &&
      (!q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q))
    );
    const groups: Record<string, Item[]> = {};
    for (const item of available) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [allItems, propItems, drawerRoomId, search]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-full">
      <div className="flex items-center justify-between mb-5 pt-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventário por Casa</h1>
          <p className="text-sm text-slate-400 mt-0.5">Destine os itens do almoxarifado para cada cômodo</p>
        </div>
        <Link href="/items"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-600 transition">
          <Package size={14} /> Almoxarifado <ExternalLink size={11} className="opacity-50 ml-0.5" />
        </Link>
      </div>

      {/* Property tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
        {properties.map(p => (
          <button key={p.id} onClick={() => setSelectedProp(p.id)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 flex items-center gap-2",
              selectedProp === p.id ? "bg-brand-600 text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200 hover:border-brand-300"
            )}>
            {p.name}
            <span className={cn("text-xs font-normal", selectedProp === p.id ? "text-brand-200" : "text-slate-400")}>
              {p.city}
            </span>
          </button>
        ))}
      </div>

      {/* Stats */}
      {!loading && rooms.length > 0 && (
        <div className="flex items-center gap-3 mb-5 px-4 py-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <LayoutGrid size={16} className="text-brand-500 flex-shrink-0" />
          <span className="text-sm text-slate-600">
            <strong className="text-slate-900">{propItems.length}</strong> itens em{" "}
            <strong className="text-slate-900">{rooms.length}</strong> cômodos nesta casa
          </span>
        </div>
      )}

      {/* Kanban */}
      {loading ? (
        <div className="flex gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton rounded-2xl flex-shrink-0" style={{ width: 264, height: 300 }} />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
          <div className="text-5xl mb-3">🏠</div>
          <p className="text-slate-500 font-medium">Nenhum cômodo cadastrado neste imóvel</p>
          <p className="text-slate-400 text-sm mt-1 mb-4">Cadastre os cômodos primeiro</p>
          <Link href="/rooms"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition">
            <Plus size={14} /> Cadastrar cômodos
          </Link>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {columns.map(room => (
            <RoomColumn
              key={room.id}
              room={room}
              items={itemsByRoom[room.id] || []}
              savingId={savingId}
              onOpen={openDrawer}
              onQty={updateQty}
              onRemove={removeItem}
              onPhotos={openPhotos}
            />
          ))}
        </div>
      )}

      {/* Item picker drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeDrawer(); }}>
            <motion.div
              className="modal-content"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
              onClick={e => e.stopPropagation()}
              style={{ maxHeight: "80vh", display: "flex", flexDirection: "column" }}
            >
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Adicionando em</p>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                    <span>{ROOM_ICONS[rooms.find(r => r.id === drawerRoomId)?.type || "other"] || "📦"}</span>
                    {drawerLabel}
                  </h3>
                </div>
                <button onClick={closeDrawer}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                  <X size={16} />
                </button>
              </div>

              <div className="relative mb-4 flex-shrink-0">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input ref={searchRef} type="text" placeholder="Buscar item no almoxarifado..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>

              <div className="overflow-y-auto flex-1">
                {Object.keys(drawerGroups).length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-3xl mb-2">📭</p>
                    <p className="text-slate-400 text-sm">
                      {search ? `Nenhum item para "${search}"` : "Todos os itens já estão neste cômodo"}
                    </p>
                  </div>
                ) : (
                  Object.entries(drawerGroups).map(([category, catItems]) => (
                    <div key={category} className="mb-5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">
                        {category}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {catItems.map(item => {
                          const isPending = pendingIds.includes(item.id);
                          return (
                            <button key={item.id}
                              onClick={() => !isPending && addItem(item.id, drawerRoomId, allItems, selectedProp)}
                              disabled={isPending}
                              className="flex items-center gap-2.5 p-3 bg-slate-50 hover:bg-brand-50 border border-transparent hover:border-brand-200 rounded-xl text-left transition-colors group disabled:opacity-60">
                              <span className="text-2xl leading-none w-7 flex items-center justify-center flex-shrink-0">
                                {isPending ? <Loader2 size={18} className="animate-spin text-brand-400" /> : item.icon}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-slate-800 group-hover:text-brand-700 truncate leading-tight">
                                  {item.name}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{item.unit}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex-shrink-0 pt-3 border-t border-slate-100 mt-2">
                <Link href="/items" onClick={closeDrawer}
                  className="flex items-center gap-1.5 text-xs text-brand-600 hover:underline">
                  <Plus size={12} /> Criar novo item no almoxarifado
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* capture="environment": no celular abre direto a câmera traseira */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (photoItemId && files.length) uploadPhotos(photoItemId, files);
        }} />

      {/* Galeria do item */}
      <AnimatePresence>
        {photoItem && (photoList.length > 0 || uploading > 0) && (
          <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPhotoItemId(null); }}>
            <motion.div
              className="modal-content"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
              onClick={e => e.stopPropagation()}
              style={{ maxHeight: "85vh", display: "flex", flexDirection: "column" }}
            >
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Fotos do item</p>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                    <span>{photoItem.item.icon}</span>{photoItem.item.name}
                  </h3>
                </div>
                <button onClick={() => setPhotoItemId(null)}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                  <X size={16} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 grid grid-cols-3 gap-2 content-start">
                {photoList.map(f => (
                  <button key={f.url} onClick={() => setViewing(f)}
                    className="relative aspect-square rounded-xl overflow-hidden bg-slate-100">
                    <img src={f.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-black/45 text-white text-[9px] px-1.5 py-0.5 text-left">
                      {new Date(f.at).toLocaleDateString("pt-BR")}
                    </span>
                  </button>
                ))}
                {Array.from({ length: uploading }).map((_, i) => (
                  <div key={`up-${i}`} className="aspect-square rounded-xl bg-slate-100 flex items-center justify-center">
                    <Loader2 size={18} className="animate-spin text-brand-400" />
                  </div>
                ))}
              </div>

              <div className="flex-shrink-0 pt-3 border-t border-slate-100 mt-3">
                <button onClick={() => cameraRef.current?.click()}
                  disabled={photoList.length + uploading >= MAX_FOTOS_POR_ITEM}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition disabled:opacity-50">
                  <Camera size={16} /> Tirar outra foto
                </button>
                <p className="text-[10px] text-slate-400 text-center mt-2">
                  {photoList.length} de {MAX_FOTOS_POR_ITEM} fotos
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Foto em tamanho grande */}
      {viewing && photoItem && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col" onClick={() => setViewing(null)}>
          <div className="flex items-center justify-between p-3 text-white" onClick={e => e.stopPropagation()}>
            <span className="text-sm">
              {photoItem.item.name} · {new Date(viewing.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </span>
            <div className="flex gap-2">
              <button onClick={() => deletePhoto(photoItem.id, viewing.url)}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-red-500/80 flex items-center justify-center" aria-label="Apagar foto">
                <Trash2 size={16} />
              </button>
              <button onClick={() => setViewing(null)}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-3 min-h-0">
            <img src={viewing.url} alt={photoItem.item.name} className="max-w-full max-h-full object-contain rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
