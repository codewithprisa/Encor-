"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inter } from "next/font/google";
import logo from "../../assets/logo.encore.png";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

const MENU = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <>
        <rect x="4" y="4" width="6" height="7" rx="1" />
        <rect x="14" y="4" width="6" height="4" rx="1" />
        <rect x="4" y="15" width="6" height="5" rx="1" />
        <rect x="14" y="12" width="6" height="8" rx="1" />
      </>
    ),
  },
  {
    href: "/event",
    label: "Event",
    icon: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M9 3v4M15 3v4" />
      </>
    ),
  },
  {
    href: "/artis",
    label: "Artis",
    icon: (
      <>
        <circle cx="12" cy="8" r="3" />
        <circle cx="5" cy="10" r="2" />
        <circle cx="19" cy="10" r="2" />
        <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      </>
    ),
  },
  {
    href: "/genre",
    label: "Genre",
    icon: (
      <>
        <path d="m12 4 4 6H8l4-6Z" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <circle cx="17" cy="17" r="3" />
      </>
    ),
  },
  {
    href: "/pesanan",
    label: "Pesanan",
    icon: (
      <>
        <path d="M3 4h2l2.4 11h10.2L20 7H6.2" />
        <circle cx="9" cy="19" r="1.4" />
        <circle cx="17" cy="19" r="1.4" />
      </>
    ),
  },
  {
    href: "/refund",
    label: "Refund",
    icon: (
      <>
        <rect x="5" y="4" width="14" height="16" rx="2" />
        <path d="M14 9l-3 3 3 3" />
      </>
    ),
  },
  {
    href: "/notifikasi",
    label: "Pengumuman",
    icon: (
      <>
        <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6l-5 4H4a1 1 0 0 0-1 1Z" />
        <path d="M15 9a4 4 0 0 1 0 6" />
        <path d="M18 6a8 8 0 0 1 0 12" />
      </>
    ),
  },
];

const SETTINGS = {
  href: "/pengaturan",
  label: "Pengaturan",
  icon: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
    </>
  ),
};

export default function Sidebar({ theme, onToggleTheme, open, onClose }) {
  const pathname = usePathname();
  const isDark = theme === "dark";

  function handleLogout() {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    } catch (err) {
      // abaikan jika storage tidak tersedia
    }
    window.location.href = "/login";
  }

  function isActive(href) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className={`sidebar ${open ? "sidebar-open" : ""} ${inter.className}`}>
      <style>{css}</style>

      {/* Brand */}
      <div className="sb-brand">
        <Image
          src={logo}
          alt="Logo Encoré"
          className="sb-logo"
          priority
        />
        <div>
          <p className="sb-name">Encoré</p>
          <p className="sb-sub">Manajemen Konser</p>
        </div>

        <button
          type="button"
          className="sb-close"
          onClick={onClose}
          aria-label="Tutup menu"
        >
          ×
        </button>
      </div>

      {/* Menu utama */}
      <nav className="sb-nav" aria-label="Menu utama">
        {MENU.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sb-item ${isActive(item.href) ? "sb-active" : ""}`}
            aria-current={isActive(item.href) ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {item.icon}
            </svg>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Bawah: pengaturan, logout, tema */}
      <div className="sb-bottom">
        <Link
          href={SETTINGS.href}
          className={`sb-item ${isActive(SETTINGS.href) ? "sb-active" : ""}`}
          aria-current={isActive(SETTINGS.href) ? "page" : undefined}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {SETTINGS.icon}
          </svg>
          <span>{SETTINGS.label}</span>
        </Link>

        <button type="button" className="sb-item sb-logout" onClick={handleLogout}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
            <path d="M16 8l4 4-4 4M20 12H9" />
          </svg>
          <span>Logout</span>
        </button>

        <div className="sb-divider" />

        <button
          type="button"
          className="sb-theme"
          onClick={onToggleTheme}
          role="switch"
          aria-checked={isDark}
          aria-label="Ganti mode gelap atau terang"
        >
          <span className="sb-theme-left">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {isDark ? (
                <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
              ) : (
                <>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
                </>
              )}
            </svg>
            <span>{isDark ? "Mode Gelap" : "Mode Terang"}</span>
          </span>
          <span className={`sb-switch ${isDark ? "sb-switch-on" : ""}`}>
            <span />
          </span>
        </button>
      </div>
    </aside>
  );
}

const css = `
.sidebar {
  position: sticky;
  top: 0;
  width: 240px;
  min-width: 240px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 24px 16px 20px;
  background: var(--sb-bg);
  color: var(--sb-ink);
  border-right: 1px solid var(--sb-line);
  transition: background 0.2s, color 0.2s, transform 0.2s;
}

.sidebar * {
  box-sizing: border-box;
}

.sb-brand {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
  margin-bottom: 40px;
}

.sb-logo {
  width: 40px;
  height: auto;
  flex-shrink: 0;
}

.sb-name {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--sb-accent);
}

.sb-sub {
  margin-top: 2px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sb-ink);
}

.sb-close {
  display: none;
  margin-left: auto;
  width: 30px;
  height: 30px;
  font-size: 22px;
  line-height: 1;
  color: var(--sb-muted);
  background: none;
  border: 0;
  cursor: pointer;
}

.sb-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sb-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  height: 42px;
  padding: 0 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--sb-muted);
  text-decoration: none;
  text-align: left;
  background: none;
  border: 0;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.sb-item svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sb-item:hover {
  background: var(--sb-hover);
  color: var(--sb-ink);
}

.sb-active,
.sb-active:hover {
  font-weight: 700;
  color: var(--sb-active-ink);
  background: var(--sb-active-bg);
  border-left-color: var(--sb-accent);
}

.sb-item:focus-visible,
.sb-theme:focus-visible,
.sb-close:focus-visible {
  outline: 2px solid var(--sb-accent);
  outline-offset: 2px;
}

.sb-bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sb-logout:hover {
  color: var(--sb-danger);
}

.sb-divider {
  height: 1px;
  margin: 12px 0;
  background: var(--sb-line);
}

.sb-theme {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  height: 42px;
  padding: 0 16px;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--sb-muted);
  background: var(--sb-hover);
  border: 1px solid var(--sb-line);
  cursor: pointer;
}

.sb-theme-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sb-theme-left svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sb-switch {
  position: relative;
  flex-shrink: 0;
  width: 34px;
  height: 18px;
  background: #b9b3ab;
  border-radius: 999px;
  transition: background 0.15s;
}

.sb-switch span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.15s;
}

.sb-switch-on {
  background: var(--sb-accent);
}

.sb-switch-on span {
  transform: translateX(16px);
}

/* Mobile: sidebar jadi drawer */
@media (max-width: 900px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 50;
    transform: translateX(-100%);
  }

  .sidebar-open {
    transform: translateX(0);
  }

  .sb-close {
    display: block;
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