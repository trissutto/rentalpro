"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Clock, Users, FileText, Home, Plus, Trash2, Wifi, Key, Info } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";

interface Guest {
  name: string;
  birthDate: string;
  docType: string;
  docNumber: string;
}

interface AccessInfo {
  instructions: string | null;
  wifiName: string | null;
  wifiPassword: string | null;
  checkInTime: string | null;
}

interface ReservationInfo {
  guestName: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  property: { name: string };
}

export default function CheckinPage() {
  const { code } = useParams();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [accessInfo, setAccessInfo] = useState<AccessInfo | null>(null);
  const [reservation, setReservation] = useState<ReservationInfo | null>(null);
  const [loadingRes, setLoadingRes] = useState(true);

  const [arrivalTime, setArrivalTime] = useState("");
  const [observations, setObservations] = useState("");
  const [guests, setGuests] = useState<Guest[]>([
    { name: "", birthDate: "", docType: "CPF", docNumber: "" },
  ]);

  useEffect(() => {
    fetch(`/api/public/reservation?code=${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.reservation) setReservation(data.reservation);
      })
      .finally(() => setLoadingRes(false));
  }, [code]);

  function addGuest() {
    setGuests((prev) => [...prev, { name: "", birthDate: "", docType: "CPF", docNumber: "" }]);
  }

  function removeGuest(i: number) {
    setGuests((prev) => prev.filter((_, idx) => idx !== i));
  }

  function setGuest(i: number, field: keyof Guest, value: string) {
    setGuests((prev) => prev.map((g, idx) => idx === i ? { ...g, [field]: value } : g));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!arrivalTime) { toast.error("Informe o horário de chegada"); return; }
    if (guests.some((g) => !g.name || !g.docNumber)) {
      toast.error("Preencha nome e documento de todos os hóspedes");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, guests, arrivalTime, observations }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAccessInfo(data.access);
      setDone(true);
      toast.success("Check-in registrado!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar");
    } finally {
      setSubmitting(false);
    }
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");

  if (done && accessInfo) return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-md mx-auto py-8"
    >
      {/* Success header */}
      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Check-in Confirmado!</h2>
        <p className="text-slate-500 text-sm">Tudo pronto para sua chegada 🎉</p>
      </div>

      {/* Access instructions */}
      {accessInfo.instructions && (
        <div className="bg-brand-50 border border-brand-100 rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Key size={16} className="text-brand-600" />
            <p className="font-semibold text-brand-800 text-sm">Como acessar o imóvel</p>
          </div>
          <p className="text-sm text-brand-700 whitespace-pre-line leading-relaxed">{accessInfo.instructions}</p>
        </div>
      )}

      {/* WiFi */}
      {(accessInfo.wifiName || accessInfo.wifiPassword) && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Wifi size={16} className="text-slate-600" />
            <p className="font-semibold text-slate-800 text-sm">Wi-Fi</p>
          </div>
          {accessInfo.wifiName && (
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-500">Rede:</span>
              <span className="font-semibold text-slate-800 font-mono">{accessInfo.wifiName}</span>
            </div>
          )}
          {accessInfo.wifiPassword && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Senha:</span>
              <span className="font-semibold text-slate-800 font-mono">{accessInfo.wifiPassword}</span>
            </div>
          )}
        </div>
      )}

      {/* Check-in time */}
      {accessInfo.checkInTime && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-4 text-sm text-amber-800">
          <Clock size={15} className="flex-shrink-0" />
          Horário de check-in: <strong>{accessInfo.checkInTime}</strong>
        </div>
      )}

      {/* No access info fallback */}
      {!accessInfo.instructions && !accessInfo.wifiName && (
        <div className="flex items-start gap-2 bg-blue-50 rounded-2xl p-4 mb-4 text-sm text-blue-700">
          <Info size={15} className="flex-shrink-0 mt-0.5" />
          As instruções de acesso serão enviadas por WhatsApp próximo à sua chegada.
        </div>
      )}

      {/* Contract link */}
      <div className="flex gap-3">
        <Link href={`/reserva/${code}`}
          className="flex-1 block text-center bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 rounded-2xl transition-colors text-sm">
          Ver reserva
        </Link>
        <a href={`/api/public/contract/${code}`} target="_blank" rel="noreferrer"
          className="flex-1 block text-center border border-slate-200 hover:border-brand-400 hover:text-brand-700 text-slate-600 font-semibold py-3.5 rounded-2xl transition-colors text-sm">
          📄 Contrato PDF
        </a>
      </div>
    </motion.div>
  );

  return (
    <div className="max-w-md mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Home className="w-8 h-8 text-brand-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Check-in Online</h1>
          <p className="text-slate-500 mt-1 text-sm">Reserva <span className="font-mono font-bold text-brand-600">{code}</span></p>
        </div>

        {/* Reservation summary */}
        {!loadingRes && reservation && (
          <div className="bg-slate-50 rounded-2xl p-4 mb-5 text-sm">
            <p className="font-semibold text-slate-700 mb-2">{reservation.property.name}</p>
            <div className="flex gap-4 text-slate-500">
              <span>Check-in: <strong className="text-slate-700">{fmtDate(reservation.checkIn)}</strong></span>
              <span>Check-out: <strong className="text-slate-700">{fmtDate(reservation.checkOut)}</strong></span>
            </div>
          </div>
        )}

        <div className="bg-blue-50 rounded-2xl p-4 mb-6 border border-blue-100">
          <p className="text-sm text-blue-700">
            🎉 Preencha os dados de chegada com antecedência para que tudo esteja pronto ao chegar!
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Arrival time */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              <Clock size={14} className="inline mr-1.5 text-slate-400" />
              Horário previsto de chegada *
            </label>
            <input
              type="time"
              value={arrivalTime}
              onChange={(e) => setArrivalTime(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400 text-slate-800"
              required
            />
          </div>

          {/* Guests */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-700">
                <Users size={14} className="inline mr-1.5 text-slate-400" />
                Dados dos hóspedes *
              </label>
              <button type="button" onClick={addGuest}
                className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800 transition">
                <Plus size={13} /> Adicionar
              </button>
            </div>

            <div className="space-y-3">
              {guests.map((g, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Hóspede {i + 1}
                    </p>
                    {i > 0 && (
                      <button type="button" onClick={() => removeGuest(i)}
                        className="text-red-400 hover:text-red-600 transition">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Nome completo *"
                      value={g.name}
                      onChange={(e) => setGuest(i, "name", e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                      required
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        placeholder="Data de nascimento"
                        value={g.birthDate}
                        onChange={(e) => setGuest(i, "birthDate", e.target.value)}
                        className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                      />
                      <select
                        value={g.docType}
                        onChange={(e) => setGuest(i, "docType", e.target.value)}
                        className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                      >
                        <option value="CPF">CPF</option>
                        <option value="RG">RG</option>
                        <option value="PASSAPORTE">Passaporte</option>
                        <option value="CNH">CNH</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText size={13} className="text-slate-400 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder={`Número do ${g.docType} *`}
                        value={g.docNumber}
                        onChange={(e) => setGuest(i, "docNumber", e.target.value)}
                        className="flex-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Observations */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Observações / pedidos especiais
            </label>
            <textarea
              rows={3}
              placeholder="Berço, cadeira alta, alergias, necessidades especiais..."
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400 text-slate-800 resize-none text-sm"
            />
          </div>

          {/* Terms */}
          <div className="p-4 bg-slate-50 rounded-2xl text-xs text-slate-500 leading-relaxed">
            Ao confirmar, você concorda com as regras do imóvel e com os horários estabelecidos.
            Os dados dos hóspedes são coletados conforme exigência legal para hospedagem.
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 text-base"
          >
            {submitting
              ? <><Loader2 size={18} className="animate-spin" /> Confirmando...</>
              : "✅ Confirmar chegada"
            }
          </button>
        </form>
      </motion.div>
    </div>
  );
}
