"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Calendar, MapPin, Users, CheckCircle2, Clock,
  Home, Phone, MessageCircle, ChevronLeft, AlertCircle,
} from "lucide-react";
import { formatDate, formatCurrency, getStatusColor, getStatusLabel, cn } from "@/lib/utils";
import Link from "next/link";

interface Reservation {
  id: string;
  code: string;
  guestName: string;
  guestPhone: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  status: string;
  notes: string;
  property: {
    name: string;
    address: string;
    city: string;
    state: string;
    description: string;
    amenities: string | string[];
    rules: string;
    capacity: number;
    bedrooms: number;
    bathrooms: number;
  };
  cleaning?: { status: string; completedAt: string } | null;
}

function parseJSON(val: string | string[]): string[] {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

const STATUS_STEPS = [
  { key: "PENDING", label: "Solicitada", icon: Clock },
  { key: "CONFIRMED", label: "Confirmada", icon: CheckCircle2 },
  { key: "CHECKED_IN", label: "Hospedado", icon: Home },
  { key: "CHECKED_OUT", label: "Concluída", icon: CheckCircle2 },
];

export default function ReservationPortalPage() {
  const { code } = useParams();
  const router = useRouter();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/public/reservation?code=${code}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setNotFound(true); }
        else { setReservation(d.reservation); }
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [code]);

  const isPropertyReady = reservation?.cleaning?.status === "DONE";
  const currentStep = STATUS_STEPS.findIndex((s) => s.key === reservation?.status);

  if (loading) return (
    <div className="max-w-lg mx-auto space-y-4 pt-8">
      <div className="skeleton h-10 w-1/2 rounded" />
      <div className="skeleton h-48 rounded-2xl" />
      <div className="skeleton h-32 rounded-2xl" />
    </div>
  );

  if (notFound) return (
    <div className="max-w-md mx-auto text-center py-16">
      <AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
      <h2 className="text-xl font-bold text-slate-900 mb-2">Reserva não encontrada</h2>
      <p className="text-slate-500 mb-6">Verifique o código e tente novamente.</p>
      <Link href="/imoveis" className="bg-brand-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-700 transition-colors">
        Ver imóveis disponíveis
      </Link>
    </div>
  );

  if (!reservation) return null;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <p className="text-sm text-slate-400 mb-1">Sua reserva</p>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Olá, {reservation.guestName.split(" ")[0]}! 👋</h1>
          <span className="font-mono text-sm font-bold bg-brand-50 text-brand-700 px-3 py-1.5 rounded-xl">{reservation.code}</span>
        </div>
      </motion.div>

      {/* Status timeline */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="bg-white rounded-2xl p-5 shadow-card border border-slate-100 mb-4">
        <h2 className="font-semibold text-slate-900 mb-4">Status da Reserva</h2>
        <div className="flex items-center justify-between relative">
          {/* Progress line */}
          <div className="absolute left-0 right-0 top-5 h-0.5 bg-slate-200" />
          <div className="absolute left-0 top-5 h-0.5 bg-brand-500 transition-all duration-700"
            style={{ width: `${(currentStep / (STATUS_STEPS.length - 1)) * 100}%` }} />

          {STATUS_STEPS.map((step, i) => {
            const Icon = step.icon;
            const done = i <= currentStep;
            return (
              <div key={step.key} className="flex flex-col items-center relative z-10">
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                  done ? "bg-brand-600 border-brand-600" : "bg-white border-slate-300")}>
                  <Icon size={16} className={done ? "text-white" : "text-slate-400"} />
                </div>
                <p className={cn("text-[10px] mt-2 font-medium text-center", done ? "text-brand-700" : "text-slate-400")}>
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Property info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl p-5 shadow-card border border-slate-100 mb-4">
        <h2 className="font-semibold text-slate-900 mb-4">🏠 {reservation.property.name}</h2>
        <div className="flex items-start gap-2 mb-4">
          <MapPin size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-slate-600">{reservation.property.address}, {reservation.property.city} — {reservation.property.state}</p>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-green-50 rounded-xl">
            <p className="text-[10px] text-green-600 font-bold uppercase">Check-in</p>
            <p className="font-bold text-green-700 text-sm mt-1">{formatDate(reservation.checkIn)}</p>
            <p className="text-[10px] text-green-500">a partir das 15h</p>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-xl">
            <p className="text-[10px] text-red-600 font-bold uppercase">Check-out</p>
            <p className="font-bold text-red-700 text-sm mt-1">{formatDate(reservation.checkOut)}</p>
            <p className="text-[10px] text-red-400">até as 11h</p>
          </div>
          <div className="text-center p-3 bg-slate-100 rounded-xl">
            <p className="text-[10px] text-slate-500 font-bold uppercase">Noites</p>
            <p className="font-bold text-slate-700 text-sm mt-1">{reservation.nights}</p>
            <p className="text-[10px] text-slate-400"><Users size={9} className="inline" /> {reservation.guestCount} hósp.</p>
          </div>
        </div>
      </motion.div>

      {/* Property ready status */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className={cn("rounded-2xl p-4 mb-4 flex items-center gap-3", isPropertyReady ? "bg-green-50 border border-green-200" : "bg-yellow-50 border border-yellow-200")}>
        {isPropertyReady
          ? <><CheckCircle2 className="text-green-500 flex-shrink-0" size={20} /><p className="text-sm text-green-700 font-medium">✨ Imóvel pronto para receber você!</p></>
          : <><Clock className="text-yellow-600 flex-shrink-0" size={20} /><p className="text-sm text-yellow-700">O imóvel está sendo preparado para sua chegada.</p></>
        }
      </motion.div>

      {/* Amenities */}
      {parseJSON(reservation.property.amenities).length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-5 shadow-card border border-slate-100 mb-4">
          <h2 className="font-semibold text-slate-900 mb-3">Comodidades incluídas</h2>
          <div className="grid grid-cols-2 gap-2">
            {parseJSON(reservation.property.amenities).map((a) => (
              <div key={a} className="flex items-center gap-2 text-sm text-slate-700">
                <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" /> {a}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Rules */}
      {reservation.property.rules && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="bg-amber-50 rounded-2xl p-4 border border-amber-100 mb-4">
          <h2 className="font-semibold text-amber-800 mb-2">📋 Regras do imóvel</h2>
          <p className="text-sm text-amber-700">{reservation.property.rules}</p>
        </motion.div>
      )}

      {/* Notes */}
      {reservation.notes && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="bg-blue-50 rounded-2xl p-4 border border-blue-100 mb-4">
          <h2 className="font-semibold text-blue-800 mb-2">📝 Informações adicionais</h2>
          <p className="text-sm text-blue-700 whitespace-pre-line">{reservation.notes}</p>
        </motion.div>
      )}

      {/* Actions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="space-y-3">
        {reservation.status === "CONFIRMED" && (
          <Link href={`/checkin/${reservation.code}`}
            className="flex items-center justify-center gap-2 w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-2xl transition-colors text-base">
            ✅ Fazer check-in online
          </Link>
        )}

        <a href="https://wa.me/5511999999999" target="_blank"
          className="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3.5 rounded-2xl transition-colors">
          <MessageCircle size={18} /> Falar com a equipe
        </a>
      </motion.div>
    </div>
  );
}
