import type {
  AdminBoardData,
  AdminVtuber,
  ExcludedEntry,
  PendingCandidate,
  VtuberChange,
} from "@/lib/admin/types";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const adminApi = {
  board: () => call<AdminBoardData>("/vtubers"),
  update: (changes: VtuberChange[]) =>
    call<{ updated: AdminVtuber[] }>("/vtubers", json("PATCH", { changes })),
  remove: (key: string, reason: string) =>
    call<{ ok: true }>(`/vtubers/${encodeURIComponent(key)}`, json("DELETE", { reason })),
  renameOffice: (key: string, name: string) =>
    call<{ ok: true }>("/offices", json("PATCH", { key, name })),
  addOffice: (key: string, name: string) =>
    call<{ ok: true }>("/offices", json("POST", { key, name })),
  excluded: () => call<{ excluded: ExcludedEntry[] }>("/excluded"),
  unexclude: (channelId: string) =>
    call<{ ok: true }>(`/excluded/${encodeURIComponent(channelId)}`, json("DELETE")),
  pending: () => call<{ pending: PendingCandidate[] }>("/pending"),
  resolvePending: (
    channelId: string,
    body: { action: "register"; officeKey: string; officeFlg: boolean } | { action: "reject" },
  ) =>
    call<{ vtuber?: AdminVtuber; ok?: true }>(
      `/pending/${encodeURIComponent(channelId)}`,
      json("POST", body),
    ),
};
