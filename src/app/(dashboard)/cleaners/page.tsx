"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Phone, MapPin, Sparkles, X, Loader2 } from "lucide-react";
import { apiRequest } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface Cleaner {
  id: string;
  name: string;
  phone: string;
  email?: string;
  region?: string;
  active: boolean;
  _count?: { cleanings: number };
}

export default function CleanersPage() {
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    apiRequest("/api/cleaners").then((r) => r.json()).then((d) => {
      setCleaners(d.cleaners);
      setLoading(false);
    });
  }, []);

  async function handleCreate(data: { name: string; phone: string; email: string; region: string }) {
    const res = await apiRequest("/api/cleaners", { method: "POST", body: JSON.stringify(data) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error);
    setCleaners((prev) => [...prev, d.cleaner]);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5 pt-1">
        <h1 className="text-2xl font-bold text-slate-900">Faxineiras</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary py-2 px-4 text-sm">
          <Plus size={16} /> Nova
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {cleaners.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card"
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 font-bold text-lg">
                  {c.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900">{c.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-brand-600">
                      <Phone size={11} /> {c.phone}
                    </a>
                    {c.region && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <MapPin size={11} /> {c.region}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-1 justify-center">
                    <Sparkles size={13} className="text-yellow-500" />
                    <span className="text-sm font-bold text-slate-700">{c._count?.cleanings ?? 0}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">tarefas</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <CleanerModal
            onClose={() => setShowModal(false)}
            onCreated={handleCreate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CleanerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (d: { name: string; phone: string; email: string; region: string }) => Promise<void> }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", region: "" });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await onCreated(form);
      toast.success("Faxineira cadastrada!");
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao cadastrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        className="modal-content"
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold">Nova Faxineira</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { f: "name", l: "Nome *", t: "text", p: "Nome completo" },
            { f: "phone", l: "Telefone *", t: "tel", p: "(48) 99999-9999" },
            { f: "email", l: "E-mail", t: "email", p: "email@exemplo.com" },
            { f: "region", l: "Região", t: "text", p: "Florianópolis" },
          ].map(({ f, l, t, p }) => (
            <div key={f}>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{l}</label>
              <input type={t} className="input-base" placeholder={p} value={(form as Record<string, string>)[f]}
                onChange={(e) => setForm((prev) => ({ ...prev, [f]: e.target.value }))}
                required={f === "name" || f === "phone"} />
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : "Cadastrar"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
