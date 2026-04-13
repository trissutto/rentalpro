import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET || "rental-secret-key-change-in-production";
const JWT_EXPIRES = "7d";

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  name: string;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getAuthUser(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cookieToken = req.cookies.get("token")?.value;
    const token = authHeader?.replace("Bearer ", "") || cookieToken;

    if (!token) return null;

    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId, active: true },
      select: { id: true, name: true, email: true, role: true, avatar: true },
    });

    return user;
  } catch {
    return null;
  }
}

export function requireAuth(roles?: string[]) {
  return async (req: NextRequest) => {
    const user = await getAuthUser(req);
    if (!user) {
      return { error: "Não autorizado", status: 401 };
    }
    if (roles && !roles.includes(user.role)) {
      return { error: "Acesso negado", status: 403 };
    }
    return { user };
  };
}
