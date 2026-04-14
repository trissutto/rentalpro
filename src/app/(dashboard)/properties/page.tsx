"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Home, MapPin, Users, Bed, Bath, DollarSign,
  Edit2, X, Loader2, ChevronDown, Star, Camera, Trash2, Image, Tag, Wifi, Key,
} from "lucide-react";
import Link from "next/link";
import { apiRequest } from "@/hooks/useAuth";
import { cn, formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import { useAuthStore } from "@/hooks/useAuth";

// ─── Cômodos disponíveis ──────────────────────────────────────────────────────
const ALL_ROOMS = [
  { value: "Cozinha",       emoji: "🍳" },
  { value: "Sala de Estar", emoji: "🛋️" },
  { value: "Quarto",        emoji: "🛏️" },
  { value: "Banheiro",      emoji: "🚿" },
  { value: "Área Gourmet",  emoji: "🍖" },
  { value: "Piscina",       emoji: "🏊" },
  { value: "Garagem",       emoji: "🚗" },
  { value: "Área Externa",  emoji: "🌿" },
  { value: "Geral",         emoji: "🏠" },
];

// ─── Modal de Fotos ───────────────────────────────────────────────────────────
function PhotoModal({ property, onClose }: { property: Property; onClose: () => void }) {
  const [photos,    setPhotos]    = useState<string[]>([]);
  const [cover,     setCover]     = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    apiRequest(`/api/properties/${property.id}/photos`)
      .then(r => r.json())
      .then(d => { setPhotos(d.photos || []); setCover(d.coverPhoto || null); })
      .finally(() => setLoading(false));
  }, [property.id]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("propertyId", property.id);
      Array.from(files).forEach(f => fd.append("files", f));

      const uploadRes  = await fetch("/api/upload", { method: "POST", body: fd });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error);

      const saveRes  = await apiRequest(`/api/properties/${property.id}/photos`, {
        method: "POST",
        body: JSON.stringify({ urls: uploadData.urls }),
      });
      const saveData = await saveRes.json();
      setPhotos(saveData.photos || []);
      setCover(saveData.coverPhoto || null);
      toast.success(`${uploadData.urls.length} foto(s) adicionada(s)!`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const setCoverPhoto = async (url: string) => {
    const res  = await apiRequest(`/api/properties/${property.id}/photos`, {
      method: "PUT", body: JSON.stringify({ action: "set_cover", url }),
    });
    const data = await res.json();
    setCover(data.coverPhoto);
    toast.success("Capa definida!");
  };

  const deletePhoto = async (url: string) => {
    if (!confirm("Remover esta foto?")) return;
    const res  = await apiRequest(`/api/properties/${property.id}/photos`, {
      method: "PUT", body: JSON.stringify({ action: "delete", url }),
    });
    const data = await res.json();
    setPhotos(data.photos || []);
    setCover(data.coverPhoto || null);
    toast.success("Foto removida!");
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900">📷 Fotos — {property.name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{photos.length} foto(s) · clique na estrela para definir a capa</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">
              <Image size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhuma foto ainda</p>
              <p className="text-sm mt-1">Clique em "Adicionar Fotos" para começar</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map((url) => {
                const isCover = url === cover;
                return (
                  <motion.div
                    key={url}
                    layout
                    className={cn(
                      "relative rounded-2xl overflow-hidden border-2 group transition-all",
                      isCover ? "border-yellow-400 shadow-lg shadow-yellow-100" : "border-transparent hover:border-slate-200"
                    )}
                  >
                    {/* Foto */}
                    <img
                      src={url}
                      alt=""
                      className="w-full h-36 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'%3E%3Crect width='200' height='150' fill='%23f1f5f9'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%2394a3b8' font-size='32'%3E🏠%3C/text%3E%3C/svg%3E"; }}
                    />

                    {/* Badge CAPA */}
                    {isCover && (
                      <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Star size={9} fill="currentColor" /> CAPA
                      </div>
                    )}

                    {/* Ações (hover) */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      {!isCover && (
                        <button
                          onClick={() => setCoverPhoto(url)}
                          className="bg-yellow-400 text-yellow-900 p-2 rounded-xl hover:bg-yellow-300 transition"
                          title="Definir como capa"
                        >
                          <Star size={15} fill="currentColor" />
                        </button>
                      )}
                      <button
                        onClick={() => deletePhoto(url)}
                        className="bg-red-500 text-white p-2 rounded-xl hover:bg-red-600 transition"
                        title="Remover foto"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer upload */}
        <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <label className={cn(
            "flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed text-sm font-semibold cursor-pointer transition",
            uploading
              ? "border-blue-300 bg-blue-50 text-blue-400 cursor-not-allowed"
              : "border-blue-400 text-blue-600 hover:bg-blue-50"
          )}>
            {uploading ? (
              <><span className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" /> Enviando...</>
            ) : (
              <><Camera size={16} /> Adicionar Fotos (múltiplas)</>
            )}
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={handleUpload}
            />
          </label>
          <p className="text-[10px] text-slate-400 text-center mt-2">
            JPG, PNG, WEBP · Múltiplas fotos de uma vez · Passe o mouse sobre a foto para ver as opções
          </p>
        </div>
      </motion.div>
    </div>
  );
}

interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  capacity: number;
  bedrooms: number;
  bathrooms: number;
  basePrice: number | string;
  cleaningFee: number | string;
  commissionRate: number | string;
  amenities: string[] | string;
  rooms: string[] | string;
  photos: string[] | string;
  coverPhoto?: string | null;
  active: boolean;
  owner: { id: string; name: string };
  _count?: { reservations: number };
}

interface Owner {
  id: string;
  name: string;
  email: string;
}

export default function PropertiesPage() {
  const { user } = useAuthStore();
  const [properties,    setProperties]    = useState<Property[]>([]);
  const [owners,        setOwners]        = useState<Owner[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showModal,     setShowModal]     = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [photoProperty, setPhotoProperty] = useState<Property | null>(null);

  const canEdit = user?.role !== "OWNER";

  function parseJSON(val: string[] | string): string[] {
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
  }

  useEffect(() => {
    loadData();
    if (canEdit) {
      apiRequest("/api/auth/users?role=OWNER").then((r) => r.json()).then((d) => setOwners(d.users ?? []));
    }
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await apiRequest("/api/properties");
      const data = await res.json();
      setProperties(data.properties);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(id: string, active: boolean) {
    try {
      await apiRequest(`/api/properties/${id}`, {
        method: "PUT",
        body: JSON.stringify({ active: !active }),
      });
      setProperties((prev) => prev.map((p) => p.id === id ? { ...p, active: !active } : p));
      toast.success(active ? "Imóvel desativado" : "Imóvel ativado");
    } catch {
      toast.error("Erro ao atualizar");
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 pt-4 max-w-2xl mx-auto">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 pt-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Imóveis</h1>
          <p className="text-sm text-slate-400">{properties.length} imóvel(eis) cadastrado(s)</p>
        </div>
        {canEdit && (
          <button onClick={() => { setEditingProperty(null); setShowModal(true); }} className="btn-primary py-2 px-4 text-sm">
            <Plus size={16} /> Novo
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="space-y-4">
        {properties.map((prop, i) => (
          <motion.div
            key={prop.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn("card", !prop.active && "opacity-60")}
          >
            {/* Foto de capa */}
            {prop.coverPhoto ? (
              <div className="relative -mx-5 -mt-5 mb-4 h-40 overflow-hidden rounded-t-2xl">
                <img src={prop.coverPhoto} alt={prop.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <span className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Star size={9} fill="currentColor" /> CAPA
                </span>
              </div>
            ) : null}

            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className="w-12 h-12 bg-brand-50 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Home size={22} className="text-brand-600" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 justify-between">
                  <h3 className="font-bold text-slate-900 truncate">{prop.name}</h3>
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0",
                    prop.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                  )}>
                    {prop.active ? "Ativo" : "Inativo"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 mt-1">
                  <MapPin size={12} className="text-slate-400" />
                  <p className="text-sm text-slate-500 truncate">{prop.city}, {prop.state}</p>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Users size={11} /> {prop.capacity} hósp.</span>
                  <span className="flex items-center gap-1"><Bed size={11} /> {prop.bedrooms} qts.</span>
                  <span className="flex items-center gap-1"><Bath size={11} /> {prop.bathrooms} ban.</span>
                </div>

                {/* Pricing */}
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1">
                    <DollarSign size={12} className="text-green-500" />
                    <span className="text-sm font-bold text-green-600">{formatCurrency(Number(prop.basePrice))}<span className="text-slate-400 font-normal text-xs">/noite</span></span>
                  </div>
                  <span className="text-xs text-slate-400">Limpeza: {formatCurrency(Number(prop.cleaningFee))}</span>
                </div>

                {/* Owner */}
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-slate-400">Dono: <span className="text-slate-600 font-medium">{prop.owner.name}</span></p>
                  <p className="text-xs text-brand-500">{prop._count?.reservations ?? 0} reservas</p>
                </div>
              </div>
            </div>

            {/* Cômodos */}
            {parseJSON(prop.rooms ?? "[]").length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
                {parseJSON(prop.rooms ?? "[]").map((r) => {
                  const room = ALL_ROOMS.find((ar) => ar.value === r);
                  return (
                    <span key={r} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      {room?.emoji} {r}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Amenities */}
            {parseJSON(prop.amenities).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {parseJSON(prop.amenities).slice(0, 4).map((a) => (
                  <span key={a} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{a}</span>
                ))}
                {parseJSON(prop.amenities).length > 4 && (
                  <span className="text-[10px] text-slate-400">+{parseJSON(prop.amenities).length - 4}</span>
                )}
              </div>
            )}

            {/* Actions */}
            {canEdit && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setPhotoProperty(prop)}
                    className="flex-1 py-2 rounded-xl text-xs font-medium bg-amber-50 text-amber-600 hover:bg-amber-100 flex items-center justify-center gap-1.5"
                  >
                    <Camera size={12} />
                    Fotos
                    {parseJSON(prop.photos ?? "[]").length > 0 && (
                      <span className="bg-amber-200 text-amber-800 text-[10px] font-bold px-1.5 rounded-full">
                        {parseJSON(prop.photos ?? "[]").length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => { setEditingProperty(prop); setShowModal(true); }}
                    className="flex-1 py-2 rounded-xl text-xs font-medium bg-slate-50 text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-1.5"
                  >
                    <Edit2 size={12} /> Editar
                  </button>
                  <button
                    onClick={() => toggleActive(prop.id, prop.active)}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5",
                      prop.active ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-green-50 text-green-600 hover:bg-green-100"
                    )}
                  >
                    {prop.active ? "Desativar" : "Ativar"}
                  </button>
                </div>
                <Link
                  href={`/properties/${prop.id}/pricing`}
                  className="w-full py-2 rounded-xl text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 flex items-center justify-center gap-1.5"
                >
                  <Tag size={12} /> Precificação Dinâmica
                </Link>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Modal de Fotos */}
      <AnimatePresence>
        {photoProperty && (
          <PhotoModal
            property={photoProperty}
            onClose={() => { setPhotoProperty(null); loadData(); }}
          />
        )}
      </AnimatePresence>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <PropertyModal
            property={editingProperty}
            owners={owners}
            onClose={() => setShowModal(false)}
            onSaved={() => { setShowModal(false); loadData(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PropertyModal({ property, owners, onClose, onSaved }: {
  property: Property | null;
  owners: Owner[];
  onClose: () => void;
  onSaved: () => void;
}) {
  function parseJSON(val: string[] | string | undefined): string[] {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
  }

  const [selectedRooms, setSelectedRooms] = useState<string[]>(
    parseJSON(property?.rooms)
  );

  const [form, setForm] = useState({
    name: property?.name ?? "",
    address: property?.address ?? "",
    city: property?.city ?? "",
    state: property?.state ?? "",
    zipCode: "",
    capacity: property?.capacity ?? 4,
    bedrooms: property?.bedrooms ?? 2,
    bathrooms: property?.bathrooms ?? 1,
    basePrice: String(property?.basePrice ?? ""),
    cleaningFee: String(property?.cleaningFee ?? ""),
    commissionRate: String(property?.commissionRate ?? "10"),
    idealGuests: String((property as unknown as Record<string, number>)?.idealGuests ?? "2"),
    maxGuests: String((property as unknown as Record<string, number>)?.maxGuests ?? "6"),
    extraGuestFee: String((property as unknown as Record<string, number>)?.extraGuestFee ?? "0"),
    description: "",
    rules: "",
    ownerId: property?.owner.id ?? "",
    amenities: parseJSON(property?.amenities).join(", "),
    checkInTime: (property as unknown as Record<string, string>)?.checkInTime ?? "14:00",
    checkOutTime: (property as unknown as Record<string, string>)?.checkOutTime ?? "12:00",
    accessInstructions: (property as unknown as Record<string, string>)?.accessInstructions ?? "",
    wifiName: (property as unknown as Record<string, string>)?.wifiName ?? "",
    wifiPassword: (property as unknown as Record<string, string>)?.wifiPassword ?? "",
  });
  const [loading, setLoading] = useState(false);

  function toggleRoom(room: string) {
    setSelectedRooms((prev) =>
      prev.includes(room) ? prev.filter((r) => r !== room) : [...prev, room]
    );
  }

  const set = (f: string, v: string | number) => setForm((p) => ({ ...p, [f]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body = {
        ...form,
        capacity: Number(form.capacity),
        bedrooms: Number(form.bedrooms),
        bathrooms: Number(form.bathrooms),
        basePrice: Number(form.basePrice),
        cleaningFee: Number(form.cleaningFee),
        commissionRate: Number(form.commissionRate),
        idealGuests: Number(form.idealGuests),
        maxGuests: Number(form.maxGuests),
        extraGuestFee: Number(form.extraGuestFee),
        amenities: form.amenities.split(",").map((a) => a.trim()).filter(Boolean),
        rooms: selectedRooms,
      };
      const res = await apiRequest(
        property ? `/api/properties/${property.id}` : "/api/properties",
        { method: property ? "PUT" : "POST", body: JSON.stringify(body) }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(property ? "Imóvel atualizado!" : "Imóvel criado!");
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
        className="modal-content max-h-[90vh] overflow-y-auto"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-900">{property ? "Editar Imóvel" : "Novo Imóvel"}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome do Imóvel *</label>
            <input className="input-base" placeholder="Ex: Apartamento Beira-Mar" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Proprietário *</label>
            <select className="input-base" value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)} required>
              <option value="">Selecionar proprietário...</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Endereço *</label>
            <input className="input-base" placeholder="Rua, número, complemento" value={form.address} onChange={(e) => set("address", e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Cidade *</label>
              <input className="input-base" placeholder="Florianópolis" value={form.city} onChange={(e) => set("city", e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado *</label>
              <input className="input-base" placeholder="SC" value={form.state} onChange={(e) => set("state", e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Capacidade</label>
              <input type="number" className="input-base" min={1} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Quartos</label>
              <input type="number" className="input-base" min={0} value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Banheiros</label>
              <input type="number" className="input-base" min={0} value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} />
            </div>
          </div>

          {/* Guest capacity */}
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-xs font-semibold text-amber-700 mb-2.5 flex items-center gap-1.5">
              <span>👥</span> Hospedes & Excedente
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Ideal (base)</label>
                <input
                  type="number"
                  className="input-base text-center"
                  min={1}
                  value={form.idealGuests}
                  onChange={(e) => set("idealGuests", e.target.value)}
                />
                <p className="text-[10px] text-slate-400 mt-1 text-center">Preço base cobre</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Limite (max)</label>
                <input
                  type="number"
                  className="input-base text-center"
                  min={1}
                  value={form.maxGuests}
                  onChange={(e) => set("maxGuests", e.target.value)}
                />
                <p className="text-[10px] text-slate-400 mt-1 text-center">Máximo permitido</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Taxa extra (R$)</label>
                <input
                  type="number"
                  className="input-base text-center"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={form.extraGuestFee}
                  onChange={(e) => set("extraGuestFee", e.target.value)}
                />
                <p className="text-[10px] text-slate-400 mt-1 text-center">Por hóspede/noite</p>
              </div>
            </div>
            {Number(form.extraGuestFee) > 0 && (
              <p className="text-[11px] text-amber-700 mt-2 bg-amber-100 rounded-lg px-2 py-1.5">
                Ex: {Number(form.idealGuests) + 1} hóspedes por 3 noites → +{" "}
                {formatCurrency(Number(form.extraGuestFee) * 3)} de excedente
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Preço/noite (R$) *</label>
              <input type="number" className="input-base" min={0} step="0.01" placeholder="350.00" value={form.basePrice} onChange={(e) => set("basePrice", e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Taxa limpeza (R$)</label>
              <input type="number" className="input-base" min={0} step="0.01" placeholder="80.00" value={form.cleaningFee} onChange={(e) => set("cleaningFee", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Comissão da administração (%)
              <span className="ml-2 text-xs text-slate-400 font-normal">Percentual descontado do valor da reserva</span>
            </label>
            <div className="relative">
              <input
                type="number"
                className="input-base pr-8"
                min={0}
                max={100}
                step="0.5"
                placeholder="10"
                value={form.commissionRate}
                onChange={(e) => set("commissionRate", e.target.value)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium pointer-events-none">%</span>
            </div>
            {form.basePrice && (
              <p className="text-xs text-slate-400 mt-1.5">
                Exemplo: reserva de {formatCurrency(Number(form.basePrice))}/noite →
                comissão de {formatCurrency(Number(form.basePrice) * Number(form.commissionRate || 0) / 100)}/noite
              </p>
            )}
          </div>

          {/* Cômodos */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Cômodos do imóvel
              <span className="ml-2 text-xs text-slate-400 font-normal">({selectedRooms.length} selecionado{selectedRooms.length !== 1 ? "s" : ""})</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ALL_ROOMS.map((room) => {
                const active = selectedRooms.includes(room.value);
                return (
                  <button
                    key={room.value}
                    type="button"
                    onClick={() => toggleRoom(room.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 text-center transition-all",
                      active
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    )}
                  >
                    <span className="text-xl">{room.emoji}</span>
                    <span className="text-[10px] font-medium leading-tight">{room.value}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Usado para organizar o checklist de inventário por cômodo.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Comodidades (separadas por vírgula)</label>
            <input className="input-base" placeholder="WiFi, Piscina, Ar-condicionado, Churrasqueira" value={form.amenities} onChange={(e) => set("amenities", e.target.value)} />
          </div>

          {/* Check-in / Check-out times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Horário de check-in</label>
              <input type="time" className="input-base" value={form.checkInTime} onChange={(e) => set("checkInTime", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Horário de check-out</label>
              <input type="time" className="input-base" value={form.checkOutTime} onChange={(e) => set("checkOutTime", e.target.value)} />
            </div>
          </div>

          {/* Access instructions */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Key size={13} className="text-slate-400" /> Instruções de acesso
              <span className="text-xs text-slate-400 font-normal ml-1">(enviadas ao hóspede no check-in)</span>
            </label>
            <textarea
              rows={3}
              className="input-base resize-none"
              placeholder={"Ex: A chave está na caixinha de segurança.\nCódigo: 1234. Portão azul na entrada."}
              value={form.accessInstructions}
              onChange={(e) => set("accessInstructions", e.target.value)}
            />
          </div>

          {/* WiFi */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Wifi size={13} className="text-slate-400" /> Nome da rede Wi-Fi
              </label>
              <input className="input-base" placeholder="MinhaRede_5G" value={form.wifiName} onChange={(e) => set("wifiName", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha do Wi-Fi</label>
              <input className="input-base" placeholder="senha123" value={form.wifiPassword} onChange={(e) => set("wifiPassword", e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : "Salvar"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
