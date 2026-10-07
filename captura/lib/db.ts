import type { Momento } from "./tipos";

const DB = "comparador-tarifas";
const STORE = "momentos";

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp");
        store.createIndex("sincronizado", "sincronizado");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function promesa<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function guardar(m: Momento): Promise<void> {
  const db = await abrir();
  const tx = db.transaction(STORE, "readwrite");
  await promesa(tx.objectStore(STORE).put(m));
}

export async function todos(): Promise<Momento[]> {
  const db = await abrir();
  const tx = db.transaction(STORE, "readonly");
  const r = await promesa(tx.objectStore(STORE).getAll());
  return (r as Momento[]).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function pendientesDeSync(): Promise<Momento[]> {
  return (await todos()).filter((m) => !m.sincronizado);
}

export async function marcarSincronizados(ids: string[]): Promise<void> {
  const db = await abrir();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  for (const id of ids) {
    const m = (await promesa(store.get(id))) as Momento | undefined;
    if (m) await promesa(store.put({ ...m, sincronizado: true }));
  }
}
