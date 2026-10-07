/**
 * Where saved games live in the browser (M15 phase 33c): **IndexedDB, not `localStorage`**. A game with the whole world in it weighs
 * megabytes (the plan's estimate is 5 to 20), and `localStorage` stops at about 5 and throws when it is full.
 *
 * Two object stores in one database, so listing the saves never reads a save: `texts` holds the (large) text of each slot and
 * `meta` its small summary. They are written in one transaction, so a slot never has a summary without its text or the other way
 * round. The text is what `SaveFile.serializeSave` wrote; this file does not read inside it beyond `peekSave`.
 *
 * Every failure here is a rejected promise carrying a reason the caller shows the player: a save that silently did not happen is
 * the worst outcome a save system has, and a browser in a private window, or out of quota, makes it easy.
 */
import { peekSave, SaveError, type SaveSummary } from '../sim/persistence/SaveFile.ts';
import { t } from '../i18n/i18n.ts';

const DB_NAME = 'dynasty';
const DB_VERSION = 1;
const TEXTS = 'texts';
const META = 'meta';

export interface StoredSaveMeta { readonly slot: string; readonly summary: SaveSummary }

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed')); });
}
function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class SaveStore {
  private constructor(private readonly db: IDBDatabase) {}

  static open(): Promise<SaveStore> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('this browser has no IndexedDB')); return; }
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        for (const name of [TEXTS, META]) if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name);
      };
      open.onsuccess = () => resolve(new SaveStore(open.result));
      open.onerror = () => reject(open.error ?? new Error('could not open the save database'));
      open.onblocked = () => reject(new Error('the save database is blocked by another tab'));
    });
  }

  /** Store a save under a slot, replacing what was there. Reads the summary from the text itself, so it cannot disagree. */
  async put(slot: string, text: string): Promise<SaveSummary> {
    const summary = peekSave(text);
    const tx = this.db.transaction([TEXTS, META], 'readwrite');
    tx.objectStore(TEXTS).put(text, slot);
    tx.objectStore(META).put({ slot, summary } satisfies StoredSaveMeta, slot);
    await finished(tx);
    return summary;
  }

  async get(slot: string): Promise<string | null> {
    const text = await request(this.db.transaction(TEXTS).objectStore(TEXTS).get(slot));
    return typeof text === 'string' ? text : null;
  }

  async meta(slot: string): Promise<StoredSaveMeta | null> {
    return (await request(this.db.transaction(META).objectStore(META).get(slot))) ?? null;
  }

  async remove(slot: string): Promise<void> {
    const tx = this.db.transaction([TEXTS, META], 'readwrite');
    tx.objectStore(TEXTS).delete(slot);
    tx.objectStore(META).delete(slot);
    await finished(tx);
  }

  close(): void { this.db.close(); }
}

/** A sentence for the player about why a save or a load did not work. Literal keys, so the Spanish is checked. */
export function describeSaveFailure(error: unknown): string {
  if (error instanceof SaveError) {
    switch (error.reason) {
      case 'not_json': return t('That file is not a saved game (it is not JSON)');
      case 'not_a_save': return t('That file is not a Dynasty saved game');
      case 'newer_version': return t('That save was made by a newer version of the game');
      case 'corrupt': return t('That save is damaged and was not loaded');
    }
  }
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return t('The browser has no room left to save');
  return t('The browser would not keep the save: {why}', { why: error instanceof Error ? error.message : String(error) });
}
