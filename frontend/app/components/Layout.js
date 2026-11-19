"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";

export default function Layout({ children }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState("light");
  const [menuOpen, setMenuOpen] = useState(false);

  const isAuthPage = pathname.startsWith("/login");

  // Ambil tema tersimpan (atau ikut pengaturan sistem)
  useEffect(() => {
    let saved = null;
    try {
      saved = localStorage.getItem("theme");
    } catch (err) {
      saved = null;
    }
    const initial =
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  // Tutup drawer saat pindah halaman
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch (err) {
      // abaikan jika storage tidak tersedia
    }
  }

  // Halaman login tanpa sidebar & navbar
  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="app">
      <style>{css}</style>

      <Sidebar
        theme={theme}
        onToggleTheme={toggleTheme}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      {menuOpen && (
        <div
          className="app-overlay"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="app-main">
        <Navbar onMenuClick={() => setMenuOpen(true)} />
        <div className="app-content">{children}</div>
      </div>
    </div>
  );
}

const css = `
:root {
  --app-bg: #FFF8F4;
  --app-ink: #1A1A1A;

  --sb-bg: #FFF8F4;
  --sb-ink: #1A1A1A;
  --sb-muted: #4A4A4A;
  --sb-line: #EBD9CB;
  --sb-active-bg: #F5DFBF;
  --sb-active-ink: #6B4E1E;
  --sb-accent: #2F5D8A;
  --sb-hover: #FCEDE1;
  --sb-danger: #C0392B;
}

:root[data-theme="dark"] {
  --app-bg: #141316;
  --app-ink: #F2EDE8;

  --sb-bg: #1C1B1F;
  --sb-ink: #F2EDE8;
  --sb-muted: #C4BDB5;
  --sb-line: #34312F;
  --sb-active-bg: #3A3022;
  --sb-active-ink: #F5DFBF;
  --sb-accent: #8EC1EC;
  --sb-hover: #27252A;
  --sb-danger: #FF8A7A;
}

html,
body {
  background: var(--app-bg);
  color: var(--app-ink);
}

.app {
  display: flex;
  min-height: 100vh;
  background: var(--app-bg);
  color: var(--app-ink);
  transition: background 0.2s, color 0.2s;
}

.app-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.app-content {
  flex: 1;
  min-width: 0;
}

.app-overlay {
  display: none;
}

@media (max-width: 900px) {
  .app-overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(26, 26, 26, 0.45);
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