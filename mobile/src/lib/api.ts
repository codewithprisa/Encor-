import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const API_PORT = 3001;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Menentukan alamat backend.
 * - Build rilis: pakai EXPO_PUBLIC_API_URL (wajib diisi untuk rilis).
 * - Development: otomatis ikut IP laptop yang menjalankan Expo/Metro,
 *   jadi tidak perlu ubah apa pun saat pindah WiFi atau IP berubah.
 */
function resolveHost(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;

  // Build rilis: alamat tetap dari env
  if (!__DEV__ && explicit) return explicit;

  // Web: backend ada di mesin yang sama dengan halaman yang dibuka
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `http://${window.location.hostname}:${API_PORT}`;
  }

  // Native (Expo Go / dev build): ambil IP laptop dari alamat Metro
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as any).expoGoConfig?.debuggerHost ??
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ??
    (Constants as any).manifest?.debuggerHost;

  const metroHost = hostUri?.split(":")[0];

  if (metroHost && IPV4_RE.test(metroHost)) {
    return `http://${metroHost}:${API_PORT}`;
  }

  // Cadangan: mode tunnel atau host tidak terdeteksi
  return explicit ?? `http://LAPTOP-A6POJNKQ:${API_PORT}`;
}

const HOST = resolveHost();

export const API_URL = HOST;

export const BASE_URL = `${HOST}/api`;

export const imageUrl = (p?: string | null) =>
  !p ? undefined : p.startsWith("http") ? p : `${HOST}/${p.replace(/^\//, "")}`;

const TIMEOUT_MS = 10000;
const UPLOAD_TIMEOUT_MS = 30000; // upload gambar butuh waktu lebih lama
export const TOKEN_KEY = "encore_token";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    console.log("[API]", options.method ?? "GET", `${BASE_URL}${path}`);
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string> | undefined),
      },
    });
    const data = await res.json().catch(() => ({}));
    console.log("[API]", res.status, path);
    if (!res.ok) throw new Error((data as any)?.message ?? `Error ${res.status}`);
    // Jika backend membungkus { success, data }, ambil isinya. Jika tidak, pakai apa adanya.
    return ((data as any)?.data ?? data) as T;
  } catch (e: any) {
    if (controller.signal.aborted || e?.name === "AbortError") {
      throw new Error(`Server tidak merespons (${HOST}). Cek IP & WiFi.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Upload file (multipart/form-data).
 * Sengaja TIDAK lewat request(): header Content-Type JSON akan merusak multipart.
 * Content-Type harus dibiarkan kosong supaya boundary dibuat otomatis.
 */
async function upload<T>(
  path: string,
  fieldName: string,
  file: { uri: string; name?: string; mimeType?: string },
  extraFields: Record<string, string> = {}
): Promise<T> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);

  const form = new FormData();
  form.append(fieldName, {
    uri: file.uri,
    name: file.name ?? "bukti.jpg",
    type: file.mimeType ?? "image/jpeg",
  } as any);
  Object.entries(extraFields).forEach(([k, v]) => form.append(k, v));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    console.log("[UPLOAD] POST", `${BASE_URL}${path}`);
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {}, // JANGAN set Content-Type
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    console.log("[UPLOAD] status", res.status, data);
    if (!res.ok) throw new Error((data as any)?.message ?? `Error ${res.status}`);
    return ((data as any)?.data ?? data) as T;
  } catch (e: any) {
    if (controller.signal.aborted || e?.name === "AbortError") {
      throw new Error("Upload terlalu lama. Cek koneksi lalu coba lagi.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Upload foto profil (PUT /profil/foto, field "photo").
 * Pakai XMLHttpRequest karena lebih stabil daripada fetch untuk upload FormData di Android.
 */
async function uploadProfilePhoto(uri: string): Promise<{ photo: string }> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const fileName = uri.split("/").pop() ?? "foto.jpg";
  const ext = /\.(\w+)$/.exec(fileName)?.[1]?.toLowerCase() ?? "jpg";
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  const form = new FormData();
  form.append("photo", { uri, name: fileName, type } as any);

  return new Promise<{ photo: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    console.log("[UPLOAD] PUT", `${BASE_URL}/profil/foto`);
    xhr.open("PUT", `${BASE_URL}/profil/foto`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.timeout = UPLOAD_TIMEOUT_MS;

    xhr.onload = () => {
      let data: any = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((data?.data ?? data) as { photo: string });
      } else {
        reject(new Error(data?.message ?? `Gagal mengunggah foto (${xhr.status}).`));
      }
    };
    xhr.onerror = () => {
      console.log("[UPLOAD] XHR error:", xhr.status, xhr.responseText, uri);
      reject(new Error("Tidak bisa terhubung ke server untuk upload foto."));
    };
    xhr.ontimeout = () => reject(new Error("Upload foto terlalu lama. Coba lagi."));

    xhr.send(form as any);
  });
}

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  photo: string | null;
  joinedAt: string;
};

export type LoginResult = { token: string; user?: User };

export type ApiEvent = any;
export type ApiGenre = any;
export type ApiNotif = any;
export type ApiArtist = any;

export type UploadFile = { uri: string; name?: string; mimeType?: string };

export const api = {
  login: (body: { email: string; password: string }) =>
    request<LoginResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getMe: () => request<User>("/profil"),

  updateProfile: (body: { name: string }) =>
    request<{ name: string }>("/profil", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  updatePassword: (body: { oldPassword: string; newPassword: string }) =>
    request<{ message: string }>("/profil/password", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  // Foto profil: PUT /profil/foto, mengembalikan { photo: "/uploads/profile/xxx.jpg" }
  uploadProfilePhoto: (uri: string) => uploadProfilePhoto(uri),

  getEvents: () => request<ApiEvent[]>("/events"),
  getEvent: (id: string) => request<ApiEvent>(`/events/${id}`),
  getGenres: () => request<ApiGenre[]>("/genre"),
  getArtists: () => request<ApiArtist[]>("/artis"),

  getWishlist: () => request<any[]>("/wishlist"),
  addWishlist: (eventId: string) =>
    request<unknown>(`/wishlist/${eventId}`, { method: "POST" }),
  removeWishlist: (eventId: string) =>
    request<unknown>(`/wishlist/${eventId}`, { method: "DELETE" }),

  // Notifikasi user (inbox). "/notifikasi" tanpa "/me" adalah riwayat broadcast khusus admin.
  getNotifications: () => request<ApiNotif[]>("/notifikasi/me"),
  getUnreadNotificationCount: () =>
    request<{ count: number }>("/notifikasi/me/unread-count"),
  readNotification: (id: string) =>
    request<unknown>(`/notifikasi/me/${id}/read`, { method: "PUT" }),
  readAllNotifications: () =>
    request<unknown>("/notifikasi/me/read-all", { method: "PUT" }),
  deleteNotification: (id: string) =>
    request<unknown>(`/notifikasi/me/${id}`, { method: "DELETE" }),

  // Metode pembayaran (hanya yang aktif)
  getMetodePembayaran: () => request<any[]>("/pembayaran/metode/aktif"),

  // Checkout: buat pesanan
  createOrder: (body: unknown) =>
    request<any>("/checkout", { method: "POST", body: JSON.stringify(body) }),

  // Tiket milik user yang login (pesanan, kursi, status pembayaran, bukti)
  getMyTickets: () => request<any>("/checkout/tiket"),

  // Upload bukti pembayaran.
  // SESUAIKAN path dan nama field ("bukti") dengan route multer di backend kamu.
  uploadProof: (orderId: string, file: UploadFile) =>
    upload<any>(`/checkout/${orderId}/bukti`, "bukti", file),
  getSeats: (eventId: string, tierId?: string) =>
    request<any[]>(`/events/${eventId}/kursi${tierId ? `?kategori=${tierId}` : ""}`),

  /* ---------- Transfer tiket ---------- */

  // Semua pengguna lain yang bisa menerima tiket (tanpa q). Penyaringan dilakukan di aplikasi.
  getUsers: () => request<any[]>("/users/search"),

  // Cari pengguna lain (nama / email / no HP). Backend harus mengecualikan user yang sedang login.
  searchUsers: (q: string) =>
    request<any[]>(`/users/search?q=${encodeURIComponent(q)}`),

  // Pengirim membuat permintaan transfer. Backend membuat baris transfer (status "pending")
  // dan satu notifikasi tipe "transfer" untuk penerima. Mengembalikan { id, ... }.
  transferTicket: (body: { ticketId: string; recipientId: string; message?: string }) =>
    request<any>("/transfer", { method: "POST", body: JSON.stringify(body) }),

  // Penerima menjawab dari notifikasi.
  acceptTransfer: (transferId: string) =>
    request<unknown>(`/transfer/${transferId}/terima`, { method: "PUT" }),
  rejectTransfer: (transferId: string) =>
    request<unknown>(`/transfer/${transferId}/tolak`, { method: "PUT" }),
};