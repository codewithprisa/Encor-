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
  const [rememberMe, setRememberMe] = useState(true);
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
    <main className={`login-page ${inter.className}`}>
      <style>{css}</style>

      {/* Decorative Background Full Image & Gradients & Sparkles */}
      <div className="bg-canvas" aria-hidden="true">
        <Image
          src={bgConcert}
          alt=""
          fill
          priority
          quality={88}
          sizes="100vw"
          className="bg-photo-full"
        />
        <div className="bg-canvas-overlay" />

        <div className="wave wave-top" />
        <div className="wave wave-bottom" />
        <div className="wave wave-right" />

        {/* Floating Sparkles */}
        <span className="sparkle sp-1">✦</span>
        <span className="sparkle sp-2">✦</span>
        <span className="sparkle sp-3">✦</span>
        <span className="sparkle sp-4">✦</span>
      </div>

      <div className="login-container">
        {/* Sisi Kiri: Branding & Welcome Area */}
        <section className="left-hero">
          {/* Logo Brand */}
          <div className="brand-header">
            <Image
              src={logo}
              alt="Logo Encoré"
              className="brand-logo-img"
              priority
            />
            <span className="brand-logo-text">Encoré</span>
          </div>

          {/* Heading with celebration spark */}
          <div className="hero-text-block">
            <div className="headline-row">
              <h1 className="hero-headline">
                Welcome back,<br />
                Admin!
              </h1>
              <div className="burst-sparks" aria-hidden="true">
                <span className="burst b-1" />
                <span className="burst b-2" />
                <span className="burst b-3" />
              </div>
            </div>

            <p className="hero-subtext">
              Kelola event, tiket, dan pengalaman konser terbaik di Encoré.
            </p>
          </div>

          {/* 3 Fitur Unggulan di bagian bawah */}
          <div className="features-row">
            <div className="feature-item">
              <span className="feat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="3" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                  <path d="m9 16 2 2 4-4" />
                </svg>
              </span>
              <span className="feat-text">Kelola Event dengan Mudah</span>
            </div>

            <div className="feat-divider" />

            <div className="feature-item">
              <span className="feat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </span>
              <span className="feat-text">Pantau Penjualan Tiket</span>
            </div>

            <div className="feat-divider" />

            <div className="feature-item">
              <span className="feat-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 20V10M12 20V4M6 20v-6" />
                  <circle cx="12" cy="4" r="1.5" />
                </svg>
              </span>
              <span className="feat-text">Lihat Statistik Secara Real-time</span>
            </div>
          </div>
        </section>

        {/* Sisi Kanan: Form Kartu Login */}
        <section className="right-card-wrap">
          <div className="login-card">
            {/* Logo Brand di dalam Card */}
            <div className="card-brand-header">
              <Image
                src={logo}
                alt="Logo Encoré"
                className="card-logo-img"
                priority
              />
              <span className="card-logo-text">Encoré</span>
            </div>

            <h2 className="card-title">Masuk ke Dashboard Admin</h2>
            <p className="card-subtitle">
              Akses panel pengelolaan Encoré dengan akun Anda.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-field">
                <label htmlFor="login-email" className="field-label">
                  Email
                </label>
                <div className="input-box">
                  <svg className="field-icon-left" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="admin@encore.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Field Password */}
              <div className="form-field">
                <label htmlFor="login-password" className="field-label">
                  Password
                </label>
                <div className="input-box">
                  <svg className="field-icon-left" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Masukkan password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      {showPassword ? (
                        <>
                          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                          <circle cx="12" cy="12" r="3" />
                          <path d="M4 20 20 4" />
                        </>
                      ) : (
                        <>
                          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              {/* Row Ingat Saya & Lupa Password */}
              <div className="remember-row">
                <label className="checkbox-wrap">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Ingat saya</span>
                </label>

                <a href="/lupa-sandi" className="forgot-link">
                  Lupa password?
                </a>
              </div>

              {/* Alert Error */}
              {error && (
                <div role="alert" className="error-alert">
                  <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" className="login-submit-btn" disabled={loading}>
                {loading ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" />
                    <span>Memeriksa...</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                    <span>Masuk</span>
                  </>
                )}
              </button>
            </form>

            {/* Separator / Pembatas */}
            <div className="or-divider">
              <span className="or-line" />
              <span className="or-text">atau</span>
              <span className="or-line" />
            </div>

            {/* Tombol Bantuan / Support */}
            <a
              href="mailto:support@encore.com"
              className="support-btn"
              title="Hubungi Dukungan Encoré"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
              </svg>
              <span>Butuh bantuan? Hubungi tim support</span>
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}

const css = `
:root {
  --bg-creamy: #FBF8F1;
  --sky-blue: #5FA5E6;
  --sky-blue-hover: #4C94D7;
  --sky-light: #EBF4FC;
  --navy-dark: #12253E;
  --navy-muted: #5A6D82;
  --border-light: #E2E8F0;
  --white: #FFFFFF;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  min-height: 100%;
  background: var(--bg-creamy);
  color: var(--navy-dark);
  -webkit-font-smoothing: antialiased;
}

/* Page Layout */
.login-page {
  position: relative;
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  overflow: hidden;
  background: linear-gradient(135deg, #FFFDF8 0%, #FAF5EB 45%, #EFF6FD 100%);
}

/* Ambient Canvas Background with Full Photo & Gradients & Sparkles */
.bg-canvas {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
  background-color: var(--bg-creamy);
}

.bg-photo-full {
  object-fit: cover;
  object-position: center bottom;
  opacity: 0.32;
  filter: saturate(1.15) contrast(1.05);
}

.bg-canvas-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(255, 253, 248, 0.78) 0%,
    rgba(250, 245, 235, 0.72) 45%,
    rgba(239, 246, 253, 0.76) 100%
  );
  backdrop-filter: blur(2px);
}

.wave {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.75;
}

.wave-top {
  top: -120px;
  left: -80px;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(255, 237, 213, 0.7) 0%, rgba(254, 243, 199, 0) 70%);
}

.wave-bottom {
  bottom: -140px;
  left: 20%;
  width: 600px;
  height: 450px;
  background: radial-gradient(circle, rgba(199, 226, 253, 0.65) 0%, rgba(224, 242, 254, 0) 70%);
}

.wave-right {
  top: 10%;
  right: -100px;
  width: 550px;
  height: 550px;
  background: radial-gradient(circle, rgba(186, 230, 253, 0.5) 0%, rgba(254, 249, 195, 0.25) 50%, rgba(255, 255, 255, 0) 70%);
}

/* Sparkles (✦) */
.sparkle {
  position: absolute;
  font-family: sans-serif;
  user-select: none;
  font-size: 26px;
  line-height: 1;
}

.sp-1 {
  top: 10%;
  left: 48%;
  color: #7DB5EC;
  font-size: 28px;
  opacity: 0.85;
}

.sp-2 {
  top: 7%;
  right: 5%;
  color: #F8B854;
  font-size: 32px;
  opacity: 0.8;
}

.sp-3 {
  bottom: 12%;
  left: 6%;
  color: #8CC2F5;
  font-size: 24px;
  opacity: 0.75;
}

.sp-4 {
  bottom: 8%;
  right: 2%;
  color: #92C6F8;
  font-size: 34px;
  opacity: 0.8;
}

/* Two-column Container */
.login-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1140px;
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  align-items: center;
  gap: 48px;
}

/* ==================== SISI KIRI (HERO) ==================== */
.left-hero {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 540px;
  padding: 12px 16px 12px 0;
}

.brand-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 36px;
}

.brand-logo-img {
  width: 40px;
  height: auto;
  object-fit: contain;
}

.brand-logo-text {
  font-size: 26px;
  font-weight: 750;
  letter-spacing: -0.025em;
  color: var(--navy-dark);
}

.hero-text-block {
  margin-bottom: 36px;
  z-index: 2;
}

.headline-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.hero-headline {
  font-size: 46px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.03em;
  color: var(--navy-dark);
}

/* Radiating celebration sparks */
.burst-sparks {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;
}

.burst {
  display: block;
  height: 3.5px;
  border-radius: 999px;
}

.b-1 {
  width: 14px;
  background: #F8B854;
  transform: rotate(-25deg);
}

.b-2 {
  width: 22px;
  background: #6EAEEA;
  transform: rotate(0deg);
}

.b-3 {
  width: 16px;
  background: #89C2F5;
  transform: rotate(25deg);
}

.hero-subtext {
  margin-top: 16px;
  font-size: 15.5px;
  line-height: 1.55;
  color: var(--navy-muted);
  max-width: 370px;
}

/* 3 Feature Highlights */
.features-row {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 24px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.feat-icon {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.35);
  display: grid;
  place-items: center;
  color: #4A86C5;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
}

.feat-icon svg {
  width: 17px;
  height: 17px;
}

.feat-text {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  color: #334E68;
  max-width: 110px;
}

.feat-divider {
  width: 1px;
  height: 28px;
  background: rgba(148, 163, 184, 0.35);
  flex-shrink: 0;
}

/* ==================== SISI KANAN (CARD) ==================== */
.right-card-wrap {
  display: flex;
  justify-content: flex-end;
}

.login-card {
  width: 100%;
  max-width: 440px;
  background: var(--white);
  border-radius: 28px;
  padding: 40px 36px 34px;
  box-shadow:
    0 24px 56px -8px rgba(32, 60, 95, 0.12),
    0 4px 16px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.95);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card-brand-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 12px;
}

.card-logo-img {
  width: 34px;
  height: auto;
  object-fit: contain;
}

.card-logo-text {
  font-size: 23px;
  font-weight: 750;
  letter-spacing: -0.025em;
  color: var(--navy-dark);
}

.card-title {
  font-size: 19px;
  font-weight: 750;
  color: var(--navy-dark);
  text-align: center;
  letter-spacing: -0.015em;
}

.card-subtitle {
  font-size: 13px;
  color: var(--navy-muted);
  text-align: center;
  margin-top: 5px;
  margin-bottom: 24px;
  line-height: 1.45;
}

/* Form Styles */
.form-field {
  margin-bottom: 16px;
}

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--navy-dark);
  margin-bottom: 7px;
}

.input-box {
  position: relative;
  display: flex;
  align-items: center;
  height: 46px;
  border: 1.5px solid var(--border-light);
  border-radius: 12px;
  background: var(--white);
  padding: 0 14px;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.input-box:focus-within {
  border-color: var(--sky-blue);
  box-shadow: 0 0 0 3px rgba(95, 165, 230, 0.22);
}

.field-icon-left {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: #94A3B8;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
  margin-right: 10px;
  transition: stroke 0.16s ease;
}

.input-box:focus-within .field-icon-left {
  stroke: var(--sky-blue);
}

.input-box input {
  width: 100%;
  height: 100%;
  border: 0;
  outline: 0 !important;
  background: transparent;
  font: inherit;
  font-size: 13.5px;
  color: var(--navy-dark);
}

.input-box input::placeholder {
  color: #94A3B8;
  opacity: 0.85;
}

.toggle-password-btn {
  background: none;
  border: 0;
  padding: 4px;
  cursor: pointer;
  display: grid;
  place-items: center;
  color: #94A3B8;
  border-radius: 6px;
  transition: color 0.15s ease, background 0.15s ease;
}

.toggle-password-btn:hover {
  color: var(--navy-dark);
  background: rgba(0, 0, 0, 0.04);
}

.toggle-password-btn svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Remember me & Forgot Password */
.remember-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  margin-bottom: 22px;
}

.checkbox-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  user-select: none;
}

.checkbox-wrap input {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  accent-color: var(--sky-blue);
  cursor: pointer;
}

.forgot-link {
  font-size: 13px;
  font-weight: 500;
  color: #4A93D8;
  text-decoration: none;
  transition: color 0.15s ease;
}

.forgot-link:hover {
  color: #2F7AC2;
  text-decoration: underline;
}

/* Error Alert */
.error-alert {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px;
  background: #FEF2F2;
  border: 1px solid #FEE2E2;
  border-radius: 10px;
  color: #DC2626;
  font-size: 12.5px;
  font-weight: 500;
  margin-bottom: 16px;
  animation: fadeIn 0.2s ease;
}

.error-alert svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

/* Submit Button */
.login-submit-btn {
  width: 100%;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--sky-blue);
  color: var(--white);
  font: inherit;
  font-size: 14.5px;
  font-weight: 650;
  border: 0;
  border-radius: 14px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(95, 165, 230, 0.38);
  transition: background 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
}

.login-submit-btn:hover:not(:disabled) {
  background: var(--sky-blue-hover);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(76, 148, 215, 0.45);
}

.login-submit-btn:active:not(:disabled) {
  transform: translateY(0);
}

.login-submit-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  transform: none;
}

.btn-spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2.2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  animation: spin 0.8s linear infinite;
}

/* Or Divider */
.or-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0 16px;
}

.or-line {
  flex: 1;
  height: 1px;
  background: #E2E8F0;
}

.or-text {
  font-size: 12px;
  color: #94A3B8;
  font-weight: 500;
}

/* Support Button */
.support-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 42px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--white);
  color: #475569;
  font-size: 12.5px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.support-btn:hover {
  background: #F8FAFC;
  border-color: #CBD5E1;
  color: var(--navy-dark);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}

/* Responsive Breakpoints */
@media (max-width: 980px) {
  .login-container {
    grid-template-columns: 1fr;
    max-width: 480px;
    gap: 32px;
  }

  .left-hero {
    min-height: auto;
    text-align: center;
    align-items: center;
    padding: 0;
  }

  .brand-header {
    justify-content: center;
    margin-bottom: 20px;
  }

  .headline-row {
    justify-content: center;
  }

  .hero-headline {
    font-size: 34px;
  }

  .hero-subtext {
    margin: 12px auto 20px;
  }

  .concert-silhouette-wrap {
    display: none;
  }

  .features-row {
    display: none;
  }

  .right-card-wrap {
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .login-page {
    padding: 20px 16px;
  }

  .login-card {
    padding: 28px 20px 24px;
    border-radius: 22px;
  }

  .hero-headline {
    font-size: 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }
}
`;
