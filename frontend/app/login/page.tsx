"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Inter } from "next/font/google";
import logo from "../../assets/logo.encore.png";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Email dan kata sandi wajib diisi.");
      return;
    }

    try {
      setLoading(true);

const response = await fetch(
  "http://localhost:3001/api/auth/admin/login",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.trim(),
      password,
    }),
  }
);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login gagal.");
      }

      // Sesuaikan dengan format respons backend kamu.
      if (data.user && data.user.role !== "admin") {
        throw new Error("Akun ini tidak memiliki akses admin.");
      }

      localStorage.setItem("token", data.token);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Tidak dapat terhubung ke server."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={`page ${inter.className}`}>
      <style>{css}</style>

      {/* Brand */}
      <div className="brand">
        <Image
          src={logo}
          alt="Logo Encoré"
          className="brand-icon"
          priority
        />

        <h1 className="brand-name">Encoré</h1>
        <p className="brand-sub">Manajemen Konser</p>
      </div>

      {/* Login Card */}
      <section className="card" aria-labelledby="login-title">
        <h2 id="login-title" className="card-title">
          Masuk ke Dashboard
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div className="field">
            <label htmlFor="email" className="label">
              Alamat Email
            </label>

            <div className="input-wrap">
              <svg className="icon-left" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>

              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="nama@perusahaan.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="field">
            <div className="label-row">
              <label htmlFor="password" className="label">
                Kata Sandi
              </label>

              <a href="/lupa-sandi" className="link-small">
                Lupa Sandi?
              </a>
            </div>

            <div className="input-wrap">
              <svg className="icon-left" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>

              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <button
                type="button"
                className="icon-right"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={
                  showPassword
                    ? "Sembunyikan kata sandi"
                    : "Tampilkan kata sandi"
                }
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPassword && <path d="M4 20 20 4" />}
                </svg>
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <label className="remember">
            <input type="checkbox" />
            <span>Tetap masuk selama 30 hari</span>
          </label>

          {/* Error */}
          {error && (
            <p
              role="alert"
              style={{
                color: "#D93025",
                fontSize: "12px",
                marginBottom: "12px",
              }}
            >
              {error}
            </p>
          )}

          {/* Login Button */}
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Memeriksa..." : "Masuk"}
            {!loading && <span aria-hidden="true"> →</span>}
          </button>
        </form>

        {/* Help */}
        <div className="help">
          <p>Butuh akses bantuan?</p>
          <a href="mailto:it-support@perusahaan.com">HUBUNGI IT SUPPORT</a>
        </div>
      </section>
    </main>
  );
}

const css = `
:root {
  --bg: #FFF8F4;
  --ink: #1A1A1A;
  --muted: #6B6B6B;
  --placeholder: #B5B5B5;
  --line: #D9D9D9;
  --accent: #FFE27A;
  --blue: #8EC1EC;
  --blue-strong: #5AA6DE;
  --link: #1E5A8A;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  min-height: 100%;
  background: var(--bg);
  color: var(--ink);
}

.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  padding: 40px 20px;
  background: var(--bg);
}

.brand {
  text-align: center;
}

.brand-icon {
  width: 64px;
  height: auto;
  margin: 0 auto 10px;
  display: block;
}

.brand-name {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.brand-sub {
  margin-top: 6px;
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--muted);
}

.card {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-top: 3px solid var(--accent);
  padding: 28px 28px 24px;
  box-shadow:
    4px 4px 0 var(--accent),
    0 12px 32px rgba(0, 0, 0, 0.06);
}

.card-title {
  font-size: 17px;
  font-weight: 600;
  margin-bottom: 26px;
}

.field {
  margin-bottom: 18px;
}

.label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink);
  margin-bottom: 6px;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.link-small {
  font-size: 11px;
  font-weight: 600;
  color: var(--link);
  text-decoration: none;
}

.link-small:hover {
  text-decoration: underline;
}

.input-wrap {
  position: relative;
}

.input-wrap input[type="email"],
.input-wrap input[type="password"],
.input-wrap input[type="text"] {
  width: 100%;
  height: 40px;
  padding: 0 40px 0 38px;
  font: inherit;
  font-size: 13px;
  color: var(--ink);
  background: #fff;
  border: 1px solid #8A8A8A;
  border-radius: 0;
  outline: none;
}

.input-wrap input::placeholder {
  color: var(--placeholder);
}

.input-wrap input:focus {
  border-color: var(--blue-strong);
  box-shadow: 0 0 0 3px rgba(142, 193, 236, 0.35);
}

.icon-left,
.icon-right svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: #777;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-left {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}

.icon-right {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  background: none;
  border: 0;
  cursor: pointer;
}

.icon-right:focus-visible {
  outline: 2px solid var(--blue-strong);
}

.remember {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 18px;
  cursor: pointer;
}

.remember input {
  width: 13px;
  height: 13px;
  accent-color: var(--blue-strong);
}

.btn {
  width: 100%;
  height: 40px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--blue-strong);
  border: 0;
  cursor: pointer;
  transition: background 0.15s;
}

.btn:hover {
  background: #3E92D0;
}

.btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

.help {
  margin-top: 28px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  text-align: center;
  font-size: 11px;
  color: var(--muted);
}

.help a {
  display: inline-block;
  margin-top: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--link);
  text-decoration: none;
}

.help a:hover {
  text-decoration: underline;
}

@media (max-width: 480px) {
  .page {
    padding: 28px 18px;
    gap: 24px;
  }

  .card {
    padding: 24px 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition: none !important;
  }
}
`;