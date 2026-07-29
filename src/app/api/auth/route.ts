import { NextRequest, NextResponse } from "next/server";

const PASSWORD = "runpod2026";
const COOKIE_NAME = "rp_auth";

const LOGIN_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RP Lead Pipeline - Login</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fafafa}
  .card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:2rem;width:100%;max-width:360px}
  h1{font-size:1.1rem;font-weight:600;margin-bottom:.25rem}
  p{font-size:.85rem;color:#666;margin-bottom:1.5rem}
  input{width:100%;padding:.6rem .75rem;border:1px solid #d4d4d4;border-radius:8px;font-size:.9rem;outline:none}
  input:focus{border-color:#000}
  button{width:100%;margin-top:.75rem;padding:.6rem;background:#000;color:#fff;border:none;border-radius:8px;font-size:.9rem;cursor:pointer}
  button:hover{background:#222}
  .error{color:#dc2626;font-size:.8rem;margin-top:.5rem}
</style></head><body>
<div class="card">
  <h1>RP Lead Pipeline</h1>
  <p>Enter the password to continue.</p>
  <form method="POST" action="/api/auth">
    <input type="hidden" name="redirect" value="REDIRECT_PLACEHOLDER">
    <input type="password" name="password" placeholder="Password" autofocus required>
    <button type="submit">Enter</button>
    ERROR_PLACEHOLDER
  </form>
</div></body></html>`;

export async function GET(req: NextRequest) {
  const redirect = req.nextUrl.searchParams.get("redirect") || "/runs";
  const error = req.nextUrl.searchParams.get("error");
  let html = LOGIN_HTML
    .replace("REDIRECT_PLACEHOLDER", redirect)
    .replace("ERROR_PLACEHOLDER", error ? '<p class="error">Incorrect password</p>' : "");
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = form.get("password") as string;
  const redirect = (form.get("redirect") as string) || "/runs";

  if (password !== PASSWORD) {
    const url = new URL("/api/auth", req.url);
    url.searchParams.set("redirect", redirect);
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url);
  }

  const res = NextResponse.redirect(new URL(redirect, req.url));
  res.cookies.set(COOKIE_NAME, PASSWORD, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
