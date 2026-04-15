"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, Bell, Shield, LogOut, ChevronRight, CreditCard, Eye, EyeOff, Check, Loader2, FlaskConical, CheckCircle2, XCircle, AlertTriangle, Mail, ImagePlus, Trash2, Images, Megaphone } from "lucide-react";
import { useAuthStore, apiRequest } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  // PagBank settings
  const [pbToken, setPbToken]         = useState("");
  const [pbPublicKey, setPbPublicKey] = useState("");
  const [showToken, setShowToken]     = useState(false);
  const [savingMp, setSavingMp]       = useState(false);
  const [fetchingPubKey, setFetchingPubKey] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Hero images
  const [heroUrls, setHeroUrls]       = useState<string[]>([]);
  const [heroUploading, setHeroUploading] = useState(false);

  // Home banners
  const emptyBanner = { title: "", subtitle: "", ctaText: "Ver imóveis", ctaUrl: "/imoveis", imageUrl: "", bgColor: "#1a1a2e", textColor: "#ffffff", active: false };
  const [banner1, setBanner1] = useState({ ...emptyBanner });
  const [banner2, setBanner2] = useState({ ...emptyBanner });
  const [savingBanner1, setSavingBanner1] = useState(false);
  const [savingBanner2, setSavingBanner2] = useState(false);
  const [uploadingBanner1, setUploadingBanner1] = useState(false);
  const [uploadingBanner2, setUploadingBanner2] = useState(false);

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
    tokenInfo?: { length: number; prefix: string; hasSpaces: boolean };
    tests?: {
      accountFetch: { ok: boolean; data?: Record<string, unknown>; error?: string };
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
          setPbToken(d.settings.pagbank_token || "");
          setPbPublicKey(d.settings.pagbank_public_key || "");
          setSmtpHost(d.settings.smtp_host || "");
          setSmtpPort(d.settings.smtp_port || "465");
          setSmtpUser(d.settings.smtp_user || "");
          setSmtpPass(d.settings.smtp_pass ? "••••••••" : "");
          setSmtpFrom(d.settings.smtp_from || "");
        }
      })
      .finally(() => setLoadingSettings(false));
    // Hero images
    fetch("/api/admin/hero-images")
      .then(r => r.json())
      .then(d => setHeroUrls(d.urls || []))
      .catch(() => {});
    // Home banners
    fetch("/api/admin/home-banners")
      .then(r => r.json())
      .then(d => {
        if (d.banner1) setBanner1(d.banner1);
        if (d.banner2) setBanner2(d.banner2);
      })
      .catch(() => {});
  }, []);

  async function uploadHeroImage(file: File) {
    setHeroUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiRequest("/api/admin/hero-images", { method: "POST", body: fd });
      const d   = await res.json();
      if (d.urls) setHeroUrls(d.urls);
      else toast.error(d.error || "Erro ao subir imagem");
    } finally {
      setHeroUploading(false);
    }
  }

  async function saveBanner(slot: "1" | "2") {
    const banner = slot === "1" ? banner1 : banner2;
    const setSaving = slot === "1" ? setSavingBanner1 : setSavingBanner2;
    setSaving(true);
    try {
      const res = await apiRequest("/api/admin/home-banners", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, banner }),
      });
      const d = await res.json();
      if (d.ok) toast.success(`Banner ${slot} salvo!`);
      else toast.error(d.error || "Erro ao salvar");
    } finally { setSaving(false); }
  }

  async function uploadBannerImage(slot: "1" | "2", file: File) {
    const setUploading = slot === "1" ? setUploadingBanner1 : setUploadingBanner2;
    const setBanner    = slot === "1" ? setBanner1 : setBanner2;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("slot", slot);
      const res = await apiRequest("/api/admin/home-banners", { method: "PUT", body: fd });
      const d   = await res.json();
      if (d.url) setBanner(prev => ({ ...prev, imageUrl: d.url }));
      else toast.error(d.error || "Erro no upload");
    } finally { setUploading(false); }
  }

  async function deleteHeroImage(url: string) {
    const res = await apiRequest("/api/admin/hero-images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const d = await res.json();
    if (d.urls) { setHeroUrls(d.urls); toast.success("Imagem removida"); }
  }

  async function saveMpSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingMp(true);
    try {
      await Promise.all([
        pbToken && apiRequest("/api/settings", {
          method: "POST",
          body: JSON.stringify({ key: "pagbank_token", value: pbToken }),
        }),
        pbPublicKey && apiRequest("/api/settings", {
          method: "POST",
          body: JSON.stringify({ key: "pagbank_public_key", value: pbPublicKey }),
        }),
      ]);
      toast.success("Configurações do PagBank salvas!");
    } catch {
      toast.error("Erro ao salvar configurações");
    } finally {
      setSavingMp(false);
    }
  }

  async function fetchPagBankPublicKey() {
    setFetchingPubKey(true);
    try {
      const res = await apiRequest("/api/admin/settings/pagbank-pubkey", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
      setPbPublicKey(data.publicKey);
      toast.success("Chave pública obtida e salva!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar chave pública");
    } finally {
      setFetchingPubKey(false);
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

      {/* PagBank */}
      {isAdmin && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="card mb-4">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 bg-yellow-50 rounded-xl flex items-center justify-center">
              <CreditCard size={16} className="text-yellow-600" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">PagBank</p>
              <p className="text-xs text-slate-400">PIX e cartão de crédito</p>
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
                  Token de Integração
                  <span className="ml-1.5 font-normal text-slate-400">PagBank → Conta → Integrações → Token</span>
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={pbToken}
                    onChange={e => setPbToken(e.target.value)}
                    placeholder="Token de integração PagBank..."
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
                  Chave Pública (para criptografia de cartão)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pbPublicKey}
                    onChange={e => setPbPublicKey(e.target.value)}
                    placeholder="PUBKEY-... (clique em Buscar →)"
                    className="input-base font-mono text-xs flex-1"
                  />
                  <button
                    type="button"
                    onClick={fetchPagBankPublicKey}
                    disabled={fetchingPubKey || !pbToken}
                    title={pbToken ? "Buscar chave pública automaticamente via API do PagBank" : "Salve o token primeiro"}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50 whitespace-nowrap"
                  >
                    {fetchingPubKey ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
                    Buscar
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Clique em <strong>Buscar</strong> para obter a chave automaticamente usando o token acima.
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <a
                  href="https://minha.conta.pagseguro.uol.com.br/configuracoes/acesso-a-api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-600 hover:underline"
                >
                  Acessar painel PagBank →
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
            <p className="text-xs font-semibold text-slate-500 mb-1.5">URL do Webhook (configure no painel PagBank)</p>
            <div className="bg-slate-50 rounded-xl px-3 py-2.5 font-mono text-xs text-slate-600 break-all select-all">
              {typeof window !== "undefined" ? window.location.origin : "https://seudominio.com"}/api/webhooks/pagbank
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              No painel PagBank → Minha Conta → Integrações → Notificações → adicione esta URL
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
                {testingMp ? "Testando..." : "Testar token"}
              </button>
            </div>

            {testResult && (
              <div className={`rounded-xl p-3 text-xs space-y-2 ${testResult.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                <div className="flex items-center gap-2 font-semibold">
                  {testResult.ok
                    ? <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
                    : <XCircle size={14} className="text-red-500 flex-shrink-0" />}
                  <span className={testResult.ok ? "text-green-800" : "text-red-700"}>
                    {testResult.ok ? "Token válido" : "Problema encontrado"}
                  </span>
                </div>

                {testResult.tokenInfo && (
                  <div className="text-slate-600 space-y-0.5 pl-5">
                    <p>Token: <code className="font-mono">{testResult.tokenInfo.prefix}</code> ({testResult.tokenInfo.length} chars)</p>
                    {testResult.tokenInfo.hasSpaces && (
                      <p className="text-amber-600 flex items-center gap-1">
                        <AlertTriangle size={11} /> Token continha espaços extras (removidos automaticamente)
                      </p>
                    )}
                  </div>
                )}

                {testResult.tests && (
                  <div className="pl-5 space-y-1 text-slate-600">
                    <p className={testResult.tests.accountFetch.ok ? "text-green-700" : "text-red-600"}>
                      {testResult.tests.accountFetch.ok ? "✓" : "✗"} Validar token:
                      {testResult.tests.accountFetch.ok && testResult.tests.accountFetch.data
                        ? ` conta ${(testResult.tests.accountFetch.data as { email?: string }).email || (testResult.tests.accountFetch.data as { name?: string }).name}`
                        : ` ${testResult.tests.accountFetch.error}`}
                    </p>
                  </div>
                )}

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

      {/* Banners Horizontais da Home */}
      {[{ slot: "1" as const, banner: banner1, setBanner: setBanner1, saving: savingBanner1, uploading: uploadingBanner1 },
        { slot: "2" as const, banner: banner2, setBanner: setBanner2, saving: savingBanner2, uploading: uploadingBanner2 }
      ].map(({ slot, banner, setBanner, saving, uploading }) => (
        <div key={slot} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                <Megaphone size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Banner Horizontal {slot}</h3>
                <p className="text-xs text-slate-400">Aparece na página inicial entre os imóveis</p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-slate-500">Ativo</span>
              <div
                onClick={() => setBanner(p => ({ ...p, active: !p.active }))}
                className={`w-10 h-5 rounded-full transition-colors relative ${banner.active ? "bg-brand-500" : "bg-slate-200"}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${banner.active ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
            </label>
          </div>

          {/* Preview */}
          {(banner.imageUrl || banner.title) && (
            <div className="relative rounded-xl overflow-hidden mb-4 h-24" style={{ background: banner.bgColor }}>
              {banner.imageUrl && <img src={banner.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />}
              <div className="relative z-10 flex items-center justify-between px-4 h-full">
                <div>
                  <p className="font-bold text-sm" style={{ color: banner.textColor }}>{banner.title || "Título do banner"}</p>
                  {banner.subtitle && <p className="text-xs opacity-70" style={{ color: banner.textColor }}>{banner.subtitle}</p>}
                </div>
                {banner.ctaText && (
                  <span className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: banner.textColor, color: banner.bgColor }}>
                    {banner.ctaText} →
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Título *</label>
                <input value={banner.title} onChange={e => setBanner(p => ({ ...p, title: e.target.value }))}
                  className="input-base text-xs w-full" placeholder="Ex: Temporada de Verão" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Subtítulo</label>
                <input value={banner.subtitle} onChange={e => setBanner(p => ({ ...p, subtitle: e.target.value }))}
                  className="input-base text-xs w-full" placeholder="Ex: Descontos especiais" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Texto do botão</label>
                <input value={banner.ctaText} onChange={e => setBanner(p => ({ ...p, ctaText: e.target.value }))}
                  className="input-base text-xs w-full" placeholder="Ver imóveis" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Link do botão</label>
                <input value={banner.ctaUrl} onChange={e => setBanner(p => ({ ...p, ctaUrl: e.target.value }))}
                  className="input-base text-xs w-full" placeholder="/imoveis" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Cor de fundo</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={banner.bgColor} onChange={e => setBanner(p => ({ ...p, bgColor: e.target.value }))}
                    className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
                  <input value={banner.bgColor} onChange={e => setBanner(p => ({ ...p, bgColor: e.target.value }))}
                    className="input-base text-xs flex-1" placeholder="#1a1a2e" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Cor do texto</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={banner.textColor} onChange={e => setBanner(p => ({ ...p, textColor: e.target.value }))}
                    className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
                  <input value={banner.textColor} onChange={e => setBanner(p => ({ ...p, textColor: e.target.value }))}
                    className="input-base text-xs flex-1" placeholder="#ffffff" />
                </div>
              </div>
            </div>

            {/* Upload de foto */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Foto de fundo</label>
              <div className="flex items-center gap-2">
                {banner.imageUrl && (
                  <img src={banner.imageUrl} alt="" className="w-12 h-9 object-cover rounded-lg border border-slate-200" />
                )}
                <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 cursor-pointer hover:bg-slate-50 transition ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                  {uploading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                  {uploading ? "Enviando..." : banner.imageUrl ? "Trocar foto" : "Adicionar foto"}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadBannerImage(slot, f); e.target.value = ""; }} />
                </label>
                {banner.imageUrl && (
                  <button onClick={() => setBanner(p => ({ ...p, imageUrl: "" }))}
                    className="p-1.5 text-slate-400 hover:text-red-500 transition">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>

            <button onClick={() => saveBanner(slot)}
              disabled={saving || !banner.title}
              className="w-full py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? "Salvando..." : `Salvar Banner ${slot}`}
            </button>
          </div>
        </div>
      ))}

      {/* Banner Hero */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Images size={18} className="text-indigo-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Fotos do Banner Principal</h3>
            <p className="text-xs text-slate-400">Imagens que aparecem no slideshow da capa do site</p>
          </div>
        </div>

        {/* Grid de imagens */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {heroUrls.map((url, i) => (
            <div key={i} className="relative group rounded-xl overflow-hidden aspect-video bg-slate-100">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={() => deleteHeroImage(url)}
                  className="bg-red-500 text-white p-1.5 rounded-lg hover:bg-red-600 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <span className="absolute top-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-md">{i + 1}</span>
            </div>
          ))}
          {heroUrls.length === 0 && (
            <div className="col-span-3 text-center py-6 text-slate-400 text-xs border-2 border-dashed border-slate-200 rounded-xl">
              Nenhuma imagem cadastrada — usando imagens padrão
            </div>
          )}
        </div>

        {/* Upload */}
        <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-dashed border-indigo-200 text-indigo-600 text-sm font-medium cursor-pointer hover:bg-indigo-50 transition ${heroUploading ? "opacity-50 pointer-events-none" : ""}`}>
          {heroUploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
          {heroUploading ? "Enviando..." : "Adicionar foto ao banner"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadHeroImage(f); e.target.value = ""; }}
          />
        </label>
        <p className="text-[10px] text-slate-400 text-center mt-1.5">JPG, PNG, WEBP, AVIF · A ordem de exibição segue a ordem de upload</p>
      </div>

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
