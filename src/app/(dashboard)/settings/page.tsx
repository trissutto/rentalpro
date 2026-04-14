"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, Bell, Shield, LogOut, ChevronRight, CreditCard, Eye, EyeOff, Check, Loader2, FlaskConical, CheckCircle2, XCircle, AlertTriangle, Mail } from "lucide-react";
import { useAuthStore, apiRequest } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  // Mercado Pago settings
  const [mpToken, setMpToken]         = useState("");
  const [mpPublicKey, setMpPublicKey] = useState("");
  const [showToken, setShowToken]     = useState(false);
  const [savingMp, setSavingMp]       = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Email / SMTP settings
  const [smtpHost, setSmtpHost]   = useState("");
  const [smtpPort, setSmtpPort]   = useState("465");
  const [smtpUser, setSmtpUser]   = useState("");
  const [smtpPass, setSmtpPass]   = useState("");
  const [smtpFrom, setSmtpFrom]   = useState("");
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [savingSmtp, setSavingSmtp]     = useState(false);

  // Credential test
  type TestResult = {
    ok: boolean;
    tokenInfo?: { length: number; prefix: string; startsWithApp: boolean; startsWithTest: boolean; hasSpaces: boolean };
    tests?: {
      userFetch: { ok: boolean; data?: Record<string, unknown>; error?: string };
      preferenceCreate: { ok: boolean; data?: Record<string, unknown>; error?: string };
    };
    recommendation?: string;
    error?: string;
  };
  const [testingMp, setTestingMp]   = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    apiRequest("/api/settings")
      .then(r => r.json())
      .then(d => {
        if (d.settings) {
          setMpToken(d.settings.mp_access_token || "");
          setMpPublicKey(d.settings.mp_public_key || "");
          setSmtpHost(d.settings.smtp_host || "");
          setSmtpPort(d.settings.smtp_port || "465");
          setSmtpUser(d.settings.smtp_user || "");
          setSmtpPass(d.settings.smtp_pass ? "••••••••" : "");
          setSmtpFrom(d.settings.smtp_from || "");
        }
      })
      .finally(() => setLoadingSettings(false));
  }, []);

  async function saveMpSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingMp(true);
    try {
      await Promise.all([
        mpToken && apiRequest("/api/settings", {
          method: "POST",
          body: JSON.stringify({ key: "mp_access_token", value: mpToken }),
        }),
        mpPublicKey && apiRequest("/api/settings", {
          method: "POST",
          body: JSON.stringify({ key: "mp_public_key", value: mpPublicKey }),
        }),
      ]);
      toast.success("Configurações do Mercado Pago salvas!");
    } catch {
      toast.error("Erro ao salvar configurações");
    } finally {
      setSavingMp(false);
    }
  }

  async function testMpCredentials() {
    setTestingMp(true);
    setTestResult(null);
    try {
      const res = await apiRequest("/api/payments/test");
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: "Erro ao conectar com o servidor" });
    } finally {
      setTestingMp(false);
    }
  }

  async function saveSmtpSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSmtp(true);
    try {
      const fields: Record<string, string> = {
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_from: smtpFrom,
      };
      if (!smtpPass.includes("••••")) fields.smtp_pass = smtpPass;

      await Promise.all(
        Object.entries(fields)
          .filter(([, v]) => v.trim() !== "")
          .map(([key, value]) =>
            apiRequest("/api/settings", {
              method: "POST",
              body: JSON.stringify({ key, value }),
            })
          )
      );
      toast.success("Configurações de email salvas!");
    } catch {
      toast.error("Erro ao salvar configurações de email");
    } finally {
      setSavingSmtp(false);
    }
  }

  function handleLogout() {
    logout();
    router.push("/login");
    toast.success("Sessão encerrada");
  }

  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 pt-1">
        <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
      </div>

      {/* Profile card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card mb-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl">
            {user?.name?.charAt(0)}
          </div>
          <div>
            <p className="font-bold text-slate-900 text-lg">{user?.name}</p>
            <p className="text-slate-500 text-sm">{user?.email}</p>
            <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700">
              {user?.role === "ADMIN" ? "Administrador" : user?.role === "OWNER" ? "Proprietário" : "Equipe"}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Mercado Pago */}
      {isAdmin && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="card mb-4">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <CreditCard size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Mercado Pago</p>
              <p className="text-xs text-slate-400">PIX, cartão de crédito e parcelamento</p>
            </div>
          </div>

          {loadingSettings ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
              <Loader2 size={14} className="animate-spin" /> Carregando...
            </div>
          ) : (
            <form onSubmit={saveMpSettings} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Access Token (APP_USR-...)
                  <span className="ml-1.5 font-normal text-slate-400">Encontre em: MP → Suas Aplicações → Credenciais</span>
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={mpToken}
                    onChange={e => setMpToken(e.target.value)}
                    placeholder="APP_USR-0000000000000000-000000-..."
                    className="input-base pr-10 font-mono text-xs"
                  />
                  <button type="button" onClick={() => setShowToken(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Public Key (APP_USR-...)
                  <span className="ml-1.5 font-normal text-slate-400">Para exibir o checkout no site</span>
                </label>
                <input
                  type="text"
                  value={mpPublicKey}
                  onChange={e => setMpPublicKey(e.target.value)}
                  placeholder="APP_USR-00000000-0000-0000-0000-000000000000"
                  className="input-base font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <a
                  href="https://www.mercadopago.com.br/developers/panel/app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-600 hover:underline"
                >
                  Acessar painel de credenciais →
                </a>
                <button type="submit" disabled={savingMp}
                  className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-60">
                  {savingMp ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Salvar
                </button>
              </div>
            </form>
          )}

          {/* Webhook info */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">URL do Webhook (configure no painel MP)</p>
            <div className="bg-slate-50 rounded-xl px-3 py-2.5 font-mono text-xs text-slate-600 break-all select-all">
              {typeof window !== "undefined" ? window.location.origin : "https://seudominio.com"}/api/webhooks/mercadopago
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              No painel MP → Suas Aplicações → Webhooks → adicione esta URL com o evento <strong>Pagamentos</strong>
            </p>
          </div>

          {/* Credential test */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500">Diagnóstico de credenciais</p>
              <button
                type="button"
                onClick={testMpCredentials}
                disabled={testingMp}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition disabled:opacity-60"
              >
                {testingMp ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
                {testingMp ? "Testando..." : "Testar credenciais"}
              </button>
            </div>

            {testResult && (
              <div className={`rounded-xl p-3 text-xs space-y-2 ${testResult.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                {/* Overall result */}
                <div className="flex items-center gap-2 font-semibold">
                  {testResult.ok
                    ? <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
                    : <XCircle size={14} className="text-red-500 flex-shrink-0" />}
                  <span className={testResult.ok ? "text-green-800" : "text-red-700"}>
                    {testResult.ok ? "Credenciais válidas" : "Problema encontrado"}
                  </span>
                </div>

                {/* Token info */}
                {testResult.tokenInfo && (
                  <div className="text-slate-600 space-y-0.5 pl-5">
                    <p>Token: <code className="font-mono">{testResult.tokenInfo.prefix}</code> ({testResult.tokenInfo.length} chars)</p>
                    {testResult.tokenInfo.hasSpaces && (
                      <p className="text-amber-600 flex items-center gap-1">
                        <AlertTriangle size={11} /> Token continha espaços extras (foram removidos automaticamente)
                      </p>
                    )}
                    {!testResult.tokenInfo.startsWithApp && !testResult.tokenInfo.startsWithTest && (
                      <p className="text-red-600">⚠️ Token não começa com APP_USR- nem TEST- — verifique se copiou corretamente</p>
                    )}
                  </div>
                )}

                {/* Test results */}
                {testResult.tests && (
                  <div className="pl-5 space-y-1 text-slate-600">
                    <p className={testResult.tests.userFetch.ok ? "text-green-700" : "text-red-600"}>
                      {testResult.tests.userFetch.ok ? "✓" : "✗"} Validar token:
                      {testResult.tests.userFetch.ok && testResult.tests.userFetch.data
                        ? ` conta ${(testResult.tests.userFetch.data as { email?: string }).email || (testResult.tests.userFetch.data as { nickname?: string }).nickname}`
                        : ` ${testResult.tests.userFetch.error}`}
                    </p>
                    <p className={testResult.tests.preferenceCreate.ok ? "text-green-700" : "text-red-600"}>
                      {testResult.tests.preferenceCreate.ok ? "✓" : "✗"} Criar preferência de pagamento:
                      {testResult.tests.preferenceCreate.ok
                        ? " OK"
                        : ` ${testResult.tests.preferenceCreate.error}`}
                    </p>
                  </div>
                )}

                {/* Recommendation */}
                {testResult.recommendation && (
                  <p className={`pl-5 font-medium ${testResult.ok ? "text-green-700" : "text-red-700"}`}>
                    {testResult.recommendation}
                  </p>
                )}

                {testResult.error && (
                  <p className="text-red-600 pl-5">{testResult.error}</p>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Email / SMTP */}
      {isAdmin && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="card mb-4">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center">
              <Mail size={16} className="text-green-600" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Email (PIX e notificações)</p>
              <p className="text-xs text-slate-400">QR Code PIX enviado ao hóspede após seleção do pagamento</p>
            </div>
          </div>

          <form onSubmit={saveSmtpSettings} className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Servidor SMTP</label>
                <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)}
                  placeholder="smtp.gmail.com" className="input-base text-xs" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Porta</label>
                <input type="text" value={smtpPort} onChange={e => setSmtpPort(e.target.value)}
                  placeholder="465" className="input-base text-xs" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Usuário (email de envio)</label>
              <input type="email" value={smtpUser} onChange={e => setSmtpUser(e.target.value)}
                placeholder="noreply@villamare.com.br" className="input-base text-xs" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Senha / App Password
                <span className="ml-1.5 font-normal text-slate-400">Gmail: gere em Conta Google → Segurança → Senhas de app</span>
              </label>
              <div className="relative">
                <input type={showSmtpPass ? "text" : "password"} value={smtpPass}
                  onChange={e => setSmtpPass(e.target.value)}
                  placeholder="••••••••••••••••" className="input-base pr-10 text-xs font-mono" />
                <button type="button" onClick={() => setShowSmtpPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showSmtpPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Nome de exibição (De:)
              </label>
              <input type="text" value={smtpFrom} onChange={e => setSmtpFrom(e.target.value)}
                placeholder="Villa Mare <noreply@villamare.com.br>" className="input-base text-xs" />
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-slate-400">
                Funciona com Gmail, Outlook, Brevo (gratuito até 300 emails/dia), etc.
              </p>
              <button type="submit" disabled={savingSmtp}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-60">
                {savingSmtp ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Salvar
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Other settings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="card mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Sistema</p>
        <div className="space-y-1">
          {isAdmin && (
            <button
              onClick={() => router.push("/users")}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors text-left"
            >
              <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Shield size={16} className="text-slate-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">Usuários e Permissões</p>
                <p className="text-xs text-slate-400">Gerenciar equipe e acessos</p>
              </div>
              <ChevronRight size={16} className="text-slate-300" />
            </button>
          )}
          <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors text-left">
            <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Bell size={16} className="text-slate-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">Notificações</p>
              <p className="text-xs text-slate-400">Alertas de check-in, check-out e limpeza</p>
            </div>
            <ChevronRight size={16} className="text-slate-300" />
          </button>
          <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors text-left">
            <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <User size={16} className="text-slate-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">Perfil</p>
              <p className="text-xs text-slate-400">{user?.email}</p>
            </div>
            <ChevronRight size={16} className="text-slate-300" />
          </button>
        </div>
      </motion.div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center gap-3 p-4 rounded-2xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-medium"
      >
        <LogOut size={18} />
        Sair da conta
      </button>

      <p className="text-center text-xs text-slate-300 mt-6 mb-2">RentalPro v1.0.0</p>
    </div>
  );
}
