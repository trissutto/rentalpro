"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, User, ChevronLeft, CreditCard, Calendar } from "lucide-react";
import toast from "react-hot-toast";

interface GuestForm {
  name: string;
  birthDate: string;
  docType: "CPF" | "RG";
  docNumber: string;
}

interface ReservationInfo {
  code: string;
  guestName: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  property?: { name: string };
}

function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatRG(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,1})$/, "$1-$2");
}

function GuestCard({
  index,
  guest,
  onChange,
}: {
  index: number;
  guest: GuestForm;
  onChange: (g: GuestForm) => void;
}) {
  const today = new Date().toISOString().split("T")[0];

  function handleDocNumber(raw: string) {
    const formatted = guest.docType === "CPF" ? formatCPF(raw) : formatRG(raw);
    onChange({ ...guest, docNumber: formatted });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm">
          {index + 1}
        </div>
        <h3 className="font-semibold text-slate-800">
          {index === 0 ? "Responsável pela reserva" : `Hóspede ${index + 1}`}
        </h3>
      </div>

      <div className="space-y-3">
        {/* Nome */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Nome completo *</label>
          <div className="relative">
            <User size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={guest.name}
              onChange={(e) => onChange({ ...guest, name: e.target.value })}
              placeholder="Nome como no documento"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
              required
            />
          </div>
        </div>

        {/* Data de nascimento */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Data de nascimento *</label>
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="date"
              value={guest.birthDate}
              max={today}
              onChange={(e) => onChange({ ...guest, birthDate: e.target.value })}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
              required
            />
          </div>
        </div>

        {/* Documento */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Documento *</label>
          <div className="flex gap-2">
            <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => onChange({ ...guest, docType: "CPF", docNumber: "" })}
                className={`px-3 py-2 font-medium transition ${
                  guest.docType === "CPF"
                    ? "bg-brand-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                CPF
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...guest, docType: "RG", docNumber: "" })}
                className={`px-3 py-2 font-medium transition ${
                  guest.docType === "RG"
                    ? "bg-brand-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                RG
              </button>
            </div>
            <div className="relative flex-1">
              <CreditCard size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={guest.docNumber}
                onChange={(e) => handleDocNumber(e.target.value)}
                placeholder={guest.docType === "CPF" ? "000.000.000-00" : "00.000.000-0"}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                required
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function GuestsPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  const [reservation, setReservation] = useState<ReservationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [guests, setGuests] = useState<GuestForm[]>([]);

  useEffect(() => {
    fetch(`/api/public/reservation/${code}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.reservation) {
          const res = d.reservation;
          setReservation(res);
          const count = res.guestCount || 1;
          setGuests(
            Array.from({ length: count }, (_, i) => ({
              name: i === 0 ? res.guestName : "",
              birthDate: "",
              docType: "CPF",
              docNumber: "",
            }))
          );
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [code]);

  function updateGuest(index: number, g: GuestForm) {
    setGuests((prev) => {
      const next = [...prev];
      next[index] = g;
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validar todos os campos
    for (let i = 0; i < guests.length; i++) {
      const g = guests[i];
      if (!g.name.trim()) {
        toast.error(`Informe o nome do hóspede ${i + 1}`);
        return;
      }
      if (!g.birthDate) {
        toast.error(`Informe a data de nascimento do hóspede ${i + 1}`);
        return;
      }
      if (!g.docNumber.trim()) {
        toast.error(`Informe o documento do hóspede ${i + 1}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/reservation/${code}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guests }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDone(true);
      toast.success("Dados dos hóspedes salvos!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500 mx-auto" />
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <p className="text-slate-400 text-lg">Reserva não encontrada.</p>
        <button onClick={() => router.push("/imoveis")} className="mt-4 text-brand-600 hover:underline">
          Voltar às propriedades
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto text-center py-12"
      >
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Tudo certo!</h2>
        <p className="text-slate-500 mb-6">
          Dados de {guests.length} hóspede{guests.length > 1 ? "s" : ""} registrados com sucesso.
        </p>

        <div className="bg-brand-50 rounded-2xl p-4 mb-6 text-left">
          <p className="text-xs text-brand-400 font-semibold mb-2 uppercase tracking-wide">Hóspedes cadastrados</p>
          {guests.map((g, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 border-b border-brand-100 last:border-0">
              <div className="w-6 h-6 rounded-full bg-brand-200 flex items-center justify-center text-brand-700 text-xs font-bold">
                {i + 1}
              </div>
              <p className="text-sm text-slate-700 font-medium">{g.name}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <a
            href={`/reserva/${code}`}
            className="block bg-brand-600 text-white font-semibold py-3 rounded-xl hover:bg-brand-700 transition-colors"
          >
            Ver reserva →
          </a>
          <button
            onClick={() => router.push("/imoveis")}
            className="text-slate-400 hover:text-slate-600 text-sm"
          >
            Voltar à listagem
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 mb-5 text-sm"
      >
        <ChevronLeft size={16} /> Voltar
      </button>

      {/* Cabeçalho */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Dados dos hóspedes</h1>
        <p className="text-slate-500 text-sm">
          Reserva <span className="font-mono font-bold text-brand-600">{code}</span>
          {reservation.property && ` · ${reservation.property.name}`}
        </p>
      </div>

      {/* Barra de progresso */}
      <div className="bg-brand-50 rounded-2xl p-4 mb-6 flex items-center justify-between text-sm">
        <span className="text-brand-700 font-medium flex items-center gap-1.5">
          <User size={14} />
          {guests.length} hóspede{guests.length > 1 ? "s" : ""}
        </span>
        <span className="text-brand-500 text-xs">Preencha os dados de cada pessoa</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-4 mb-6">
          {guests.map((guest, i) => (
            <GuestCard
              key={i}
              index={i}
              guest={guest}
              onChange={(g) => updateGuest(i, g)}
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Salvando...
            </>
          ) : (
            "Salvar dados dos hóspedes"
          )}
        </button>

        <p className="text-[10px] text-slate-400 text-center mt-3">
          Informações necessárias para check-in
        </p>
      </form>
    </div>
  );
}
