import type { NextRequest } from "next/server";

export function isAuthEnabled(): boolean {
  return Boolean(
    process.env.EVALBOARD_API_TOKEN && process.env.EVALBOARD_API_TOKEN.trim().length > 0,
  );
}

export function validateApiToken(token: string | null | undefined): boolean {
  if (!isAuthEnabled()) return true;
  if (!token) return false;
  return token === process.env.EVALBOARD_API_TOKEN;
}

export function checkRequestAuth(request: NextRequest): boolean {
  if (!isAuthEnabled()) return true;

  // 1. Check Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7);
    if (validateApiToken(bearer)) return true;
  }

  // 2. Check Cookie
  const cookieToken = request.cookies.get("evalboard_token")?.value;
  if (cookieToken && validateApiToken(cookieToken)) {
    return true;
  }

  return false;
}
