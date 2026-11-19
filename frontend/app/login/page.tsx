"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Inter } from "next/font/google";
import logo from "../../assets/logo.encore.png";
import bgConcert from "../../assets/concert-bg.jpg";

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
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      }
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

      {/* Background layer dengan foto konser (low opacity) + layer netral tipis */}
      <div className="bg-container" aria-hidden="true">
        <Image
          src={bgConcert}
          alt=""
          fill
          priority
          quality={85}
          sizes="100vw"
          className="bg-photo"
        />
        <div className="bg-overlay" />
      </div>

      <div className="content-wrapper">
        {/* Brand */}
        <div className="brand">
          <div className="brand-badge">
            <Image
              src={logo}
              alt="Logo Encoré"
              className="brand-icon"
              priority
            />
          </div>

          <h1 className="brand-name">Encoré</h1>
          <p className="brand-sub">Manajemen Konser</p>
        </div>

        {/* Login Card */}
        <section className="card" aria-labelledby="login-title">
          <h2 id="login-title" className="card-title">
            Masuk ke Dasbor
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
                  placeholder="admin@gmail.com"
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
                className="error-message"
              >
                {error}
              </p>
            )}

            {/* Login Button */}
            <button type="submit" className="btn" disabled={loading}>
              {loading ? "Memeriksa..." : "Masuk"}
            </button>
          </form>

          {/* Help */}
          <div className="help">
            <p>Butuh akses bantuan?</p>
            <a href="mailto:it-support@perusahaan.com">HUBUNGI DUKUNGAN TI</a>
          </div>
        </section>
      </div>
    </main>
  );
}

const css = `
:root {
  --bg-base: #F8F6F2;
  --ink: #19212A;
  --ink-secondary: #475467;
  --muted: #667085;
  --placeholder: #98A2B3;
  --border-input: #D0D5DD;
  --border-focus: #2B6389;
  --primary: #2B6389;
  --primary-hover: #225170;
  --primary-shadow: rgba(43, 99, 137, 0.25);
  --link: #2B6389;
  --error: #D92D20;
  --error-bg: #FEF3F2;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  min-height: 100%;
  background: var(--bg-base);
  color: var(--ink);
}

.page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  overflow: hidden;
}

/* Background photo & subtle neutral overlay */
.bg-container {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-color: var(--bg-base);
}

.bg-photo {
  object-fit: cover;
  object-position: center;
  opacity: 0.72;
  filter: saturate(1.1) contrast(1.05);
}

.bg-overlay {
  position: absolute;
  inset: 0;
  /* Layar warna netral tipis di atas background konser */
  background: radial-gradient(
    circle at 50% 45%,
    rgba(255, 255, 255, 0.32) 0%,
    rgba(238, 235, 229, 0.46) 100%
  );
}

/* Content wrapper */
.content-wrapper {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 410px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Brand */
.brand {
  text-align: center;
  margin-bottom: 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.brand-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow:
    0 10px 24px -4px rgba(0, 0, 0, 0.18),
    0 0 0 1px rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  margin-bottom: 12px;
  transition: transform 0.2s ease;
}

.brand-badge:hover {
  transform: translateY(-2px);
}

.brand-icon {
  width: 36px;
  height: auto;
  display: block;
}

.brand-name {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: #111827;
  line-height: 1.2;
  text-shadow: 0 1px 16px rgba(255, 255, 255, 0.95), 0 0 6px rgba(255, 255, 255, 0.85);
}

.brand-sub {
  margin-top: 5px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #1f2937;
  text-shadow: 0 1px 12px rgba(255, 255, 255, 0.95);
}

/* Login Card */
.card {
  width: 100%;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 32px 30px 26px;
  box-shadow:
    0 24px 48px -12px rgba(0, 0, 0, 0.24),
    0 8px 20px -2px rgba(0, 0, 0, 0.10),
    0 0 0 1px rgba(255, 255, 255, 0.85);
}

.card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 22px;
  letter-spacing: -0.01em;
}

.field {
  margin-bottom: 18px;
}

.label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ink-secondary);
  margin-bottom: 7px;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 7px;
}

.label-row .label {
  margin-bottom: 0;
}

.link-small {
  font-size: 12px;
  font-weight: 600;
  color: var(--link);
  text-decoration: none;
  transition: color 0.15s ease;
}

.link-small:hover {
  text-decoration: underline;
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.input-wrap input {
  width: 100%;
  height: 44px;
  padding: 0 42px 0 40px;
  font: inherit;
  font-size: 13.5px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid var(--border-input);
  border-radius: 12px;
  outline: none;
  transition: all 0.18s ease;
}

.input-wrap input::placeholder {
  color: var(--placeholder);
}

.input-wrap input:hover {
  border-color: #B2BAC5;
  background: #ffffff;
}

.input-wrap input:focus {
  border-color: var(--border-focus);
  background: #ffffff;
  box-shadow: 0 0 0 3.5px var(--primary-shadow);
}

.input-wrap:focus-within .icon-left {
  stroke: var(--primary);
}

.icon-left,
.icon-right svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: #7D8A99;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: stroke 0.18s ease;
}

.icon-left {
  position: absolute;
  left: 14px;
  pointer-events: none;
}

.icon-right {
  position: absolute;
  right: 8px;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  background: none;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.icon-right:hover {
  background: rgba(0, 0, 0, 0.05);
}

.icon-right:focus-visible {
  outline: 2px solid var(--border-focus);
}

.remember {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12.5px;
  color: var(--ink-secondary);
  margin-bottom: 20px;
  cursor: pointer;
  user-select: none;
}

.remember input {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  accent-color: var(--primary);
  cursor: pointer;
}

.error-message {
  color: var(--error);
  background: var(--error-bg);
  border: 1px solid rgba(217, 45, 32, 0.2);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 12.5px;
  font-weight: 500;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
}

.btn {
  width: 100%;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font: inherit;
  font-size: 13.5px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #2B6389 0%, #204B67 100%);
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 4px 14px -1px var(--primary-shadow);
  transition: all 0.18s ease;
}

.btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #32739F 0%, #255779 100%);
  box-shadow: 0 6px 18px -1px rgba(43, 99, 137, 0.38);
  transform: translateY(-1px);
}

.btn:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(43, 99, 137, 0.25);
}

.btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  transform: none;
}

.btn:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

.help {
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid rgba(208, 213, 221, 0.6);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.help p {
  font-size: 12px;
  color: var(--muted);
}

.help a {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--link);
  text-decoration: none;
  transition: color 0.15s ease;
}

.help a:hover {
  text-decoration: underline;
  color: var(--primary-hover);
}

@media (max-width: 480px) {
  .page {
    padding: 24px 16px;
  }

  .card {
    padding: 26px 20px 22px;
    border-radius: 18px;
  }

  .brand-badge {
    width: 52px;
    height: 52px;
    border-radius: 15px;
  }

  .brand-name {
    font-size: 26px;
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
