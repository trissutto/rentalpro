"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Home, Mail, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/hooks/useAuth";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      login(data.user, data.token);
      toast.success(`Bem-vindo, ${data.user.name}!`);
      router.push("/");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur rounded-2xl mb-4">
            <Home className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">RentalPro</h1>
          <p className="text-brand-200 mt-1 text-sm">Gestão de Imóveis por Temporada</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl p-6 shadow-modal">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Entrar na conta</h2>
          <p className="text-slate-500 text-sm mb-6">Digite suas credenciais de acesso</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-base pl-10"
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-base pl-10 pr-10"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</>
              ) : (
                "Entrar"
              )}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 p-4 bg-slate-50 rounded-2xl">
            <p className="text-xs font-semibold text-slate-500 mb-2">CREDENCIAIS DE DEMO</p>
            <div className="space-y-1 text-xs text-slate-600">
              <p>🔑 Admin: <span className="font-mono">admin@rental.com / admin123</span></p>
              <p>👷 Equipe: <span className="font-mono">equipe@rental.com / team123</span></p>
              <p>🏠 Dono: <span className="font-mono">proprietario@rental.com / owner123</span></p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
