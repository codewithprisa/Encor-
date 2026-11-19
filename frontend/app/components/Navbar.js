"use client";

import Link from "next/link";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export default function Navbar({ onMenuClick }) {
  return (
    <header className={`navbar ${inter.className}`}>
      <style>{css}</style>

      <button
        type="button"
        className="nv-menu"
        onClick={onMenuClick}
        aria-label="Buka menu"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <Link href="/profile" className="nv-admin" aria-label="Buka profil admin">
        <span className="nv-name">Admin</span>
        <span className="nv-avatar" aria-hidden="true">A</span>
      </Link>
    </header>
  );
}

const css = `
.navbar {
  position: sticky;
  top: 0;
  z-index: 30;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 24px;
  background: var(--sb-bg);
  color: var(--sb-ink);
  border-bottom: 1px solid var(--sb-line);
  transition: background 0.2s, color 0.2s;
}

.navbar * {
  box-sizing: border-box;
}

.nv-menu {
  display: none;
  width: 36px;
  height: 36px;
  place-items: center;
  background: none;
  border: 1px solid var(--sb-line);
  color: var(--sb-ink);
  cursor: pointer;
}

.nv-menu svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.nv-menu:focus-visible,
.nv-admin:focus-visible {
  outline: 2px solid var(--sb-accent);
  outline-offset: 2px;
}

.nv-admin {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 16px;
  border-left: 1px solid var(--sb-line);
  color: inherit;
  text-decoration: none;
}

.nv-name {
  font-size: 12px;
  font-weight: 700;
}

.nv-avatar {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: var(--sb-accent);
  border-radius: 50%;
}

:root[data-theme="dark"] .nv-avatar {
  color: #1A1A1A;
}

@media (max-width: 900px) {
  .navbar {
    padding: 0 14px;
  }

  .nv-menu {
    display: grid;
  }
}
`;