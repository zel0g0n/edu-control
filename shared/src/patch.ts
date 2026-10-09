import type { Database } from "./types";

export type CollectionName = Exclude<keyof Database, "version" | "seq">;
type Item<K extends CollectionName> = Database[K][number];

/** Buyruq natijasi: qaysi yozuvlar qo'shildi/o'zgardi yoki o'chdi. Server ham shu shaklni qaytaradi. */
export interface Patch {
  upsert?: { [K in CollectionName]?: Item<K>[] };
  remove?: { [K in CollectionName]?: string[] };
}

export function applyPatch(db: Database, patch: Patch): void {
  for (const [name, items] of Object.entries(patch.upsert ?? {}) as [CollectionName, { id: string }[]][]) {
    const list = db[name] as unknown as { id: string }[];
    const index = new Map(list.map((x, i) => [x.id, i]));
    for (const item of items) {
      const i = index.get(item.id);
      if (i === undefined) {
        index.set(item.id, list.length);
        list.push(item);
      } else list[i] = item;
    }
  }
  for (const [name, ids] of Object.entries(patch.remove ?? {}) as [CollectionName, string[]][]) {
    const drop = new Set(ids);
    (db as unknown as Record<string, { id: string }[]>)[name] = (db[name] as unknown as { id: string }[]).filter((x) => !drop.has(x.id));
  }
}

/** Bir nechta patchni bittaga qo'shish. */
export function mergePatches(...patches: Patch[]): Patch {
  const out: Patch = { upsert: {}, remove: {} };
  for (const p of patches) {
    for (const [k, v] of Object.entries(p.upsert ?? {})) (out.upsert as Record<string, unknown[]>)[k] = [...((out.upsert as Record<string, unknown[]>)[k] ?? []), ...(v as unknown[])];
    for (const [k, v] of Object.entries(p.remove ?? {})) (out.remove as Record<string, string[]>)[k] = [...((out.remove as Record<string, string[]>)[k] ?? []), ...(v as string[])];
  }
  return out;
}

/** Buyruq xatosi: foydalanuvchiga ko'rsatiladigan matn kaliti bilan. */
export class CommandError extends Error {
  constructor(readonly key: string, readonly params: Record<string, string | number> = {}, readonly status = 400) {
    super(key);
  }
}
