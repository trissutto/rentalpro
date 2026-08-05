import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, signToken } from "@/lib/auth";
import { verificarLimite, limparLimite, ipDaRequisicao } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email e senha são obrigatórios" }, { status: 400 });
    }

    // Sem isto dá para testar senha indefinidamente até acertar
    const chave = `login:${ipDaRequisicao(req)}`;
    const limite = verificarLimite(chave);

    if (!limite.permitido) {
      const minutos = Math.ceil(limite.esperarSegundos / 60);
      return NextResponse.json(
        { error: `Muitas tentativas. Tente novamente em ${minutos} minuto(s).` },
        { status: 429, headers: { "Retry-After": String(limite.esperarSegundos) } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase(), active: true },
    });

    if (!user || !(await comparePassword(password, user.password))) {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    }

    limparLimite(chave); // acertou a senha: zera o histórico do IP

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    const response = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
      token,
    });

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
