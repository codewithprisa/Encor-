"use client";

import { useEffect, useState } from "react";

export type Status = "Terjadwal" | "Hampir Habis" | "Selesai";

export type DashboardData = {
  month: string; // "2026-10"
  months: string[]; // pilihan dropdown, terbaru dulu
  stats: {
    tickets: number;
    revenue: number;
    prevTickets: number;
    prevRevenue: number;
    activeEvents: number;
    newEvents: number;
    totalUsers: number;
    newUsers: number;
  };
  // satu angka per tanggal dalam bulan terpilih
  monthly: { tickets: number[]; revenue: number[] };
  genres: { name: string; value: number; color: string }[];
  events: {
    id: number;
    name: string;
    artist: string;
    date: string;
    status: Status;
    occupancy: number;
  }[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// month = "2026-10". Kosong = backend memakai bulan sekarang.
export function useDashboard(month: string) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/dashboard${month ? `?month=${month}` : ""}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        // Token salah / kedaluwarsa → kembali ke login
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem("token");
          window.location.href = "/login";
          return;
        }

        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.message || "Gagal memuat data dashboard.");
        }

        // Backend versi lama belum mengirim "month"
        if (!json.data?.month) {
          throw new Error(
            "Format data dari backend belum sesuai. Ganti dashboardController.js lalu restart backend."
          );
        }

        if (!cancelled) {
          setData(json.data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof TypeError
              ? "Tidak dapat terhubung ke backend. Pastikan server berjalan di http://localhost:3001."
              : err instanceof Error
                ? err.message
                : "Terjadi kesalahan."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [month]);

  // data lama tetap tampil saat bulan diganti, jadi halaman tidak berkedip
  return { data, error };
}