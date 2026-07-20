export interface OfflineDemand {
  id: string;
  formData: {
    date: string;
    location: string;
    googleMapsUrl: string;
    description: string;
    clientNumber: string;
    electricianIds: string[];
    materials: Array<{ materialId: string; quantity: number }>;
    isPriority?: boolean;
    priorityExecutionDate?: string;
    repetition?: number;
  };
  photoBlob: Blob | null;
  photoName: string | null;
  photoType: string | null;
  createdAt: number;
}

export interface OfflineCompletion {
  id: string; // The original demand ID from the backend
  usedMaterials: Array<{ materialId: string; quantity: number }>;
  replacedMaterials: Array<{ materialId: string; quantity: number }>;
  vehicles: string[];
  tools: string[];
  transformerNumber: string;
  observation: string;
  photoBlob: Blob | null;
  photoName: string | null;
  photoType: string | null;
  additionalPhotos?: Array<{ blob: Blob; name: string; type: string }>;
  createdAt: number;
}

const DB_NAME = 'PrefeituraEletricaOfflineDB';
const STORE_OFFLINE_DEMANDS = 'offline_demands';
const STORE_OFFLINE_COMPLETIONS = 'offline_completions';
const STORE_CACHED_DEMANDS = 'cached_demands';
const STORE_CACHED_METADATA = 'cached_metadata';
const DB_VERSION = 2; // Upgraded version for new stores

export class IndexedDbService {
  private static initDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDbService: Failed to open DB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        
        // 1. Store for unregistered offline demands (draft creations)
        if (!db.objectStoreNames.contains(STORE_OFFLINE_DEMANDS)) {
          db.createObjectStore(STORE_OFFLINE_DEMANDS, { keyPath: 'id' });
        }
        
        // 2. Store for completed execution forms (to be synced)
        if (!db.objectStoreNames.contains(STORE_OFFLINE_COMPLETIONS)) {
          db.createObjectStore(STORE_OFFLINE_COMPLETIONS, { keyPath: 'id' });
        }
        
        // 3. Store for actual cached demands (fetched from server)
        if (!db.objectStoreNames.contains(STORE_CACHED_DEMANDS)) {
          db.createObjectStore(STORE_CACHED_DEMANDS, { keyPath: 'id' });
        }
        
        // 4. Store for static metadata (vehicles, tools, materials, users)
        if (!db.objectStoreNames.contains(STORE_CACHED_METADATA)) {
          db.createObjectStore(STORE_CACHED_METADATA, { keyPath: 'key' });
        }
      };
    });
  }

  // --- STORE_OFFLINE_DEMANDS (New Demand Creations Offline) ---
  static async saveDemand(demand: OfflineDemand): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_OFFLINE_DEMANDS, 'readwrite');
      const store = transaction.objectStore(STORE_OFFLINE_DEMANDS);
      const request = store.put(demand);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  static async getAllDemands(): Promise<OfflineDemand[]> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_OFFLINE_DEMANDS, 'readonly');
      const store = transaction.objectStore(STORE_OFFLINE_DEMANDS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  static async deleteDemand(id: string): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_OFFLINE_DEMANDS, 'readwrite');
      const store = transaction.objectStore(STORE_OFFLINE_DEMANDS);
      const request = store.delete(String(id));

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- STORE_OFFLINE_COMPLETIONS (Demand Executions Offline Queue) ---
  static async saveCompletion(completion: OfflineCompletion): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_OFFLINE_COMPLETIONS, 'readwrite');
      const store = transaction.objectStore(STORE_OFFLINE_COMPLETIONS);
      if (completion && completion.id !== undefined) {
        completion.id = String(completion.id);
      }
      const request = store.put(completion);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  static async getAllCompletions(): Promise<OfflineCompletion[]> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_OFFLINE_COMPLETIONS, 'readonly');
      const store = transaction.objectStore(STORE_OFFLINE_COMPLETIONS);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        results.forEach((item: any) => {
          if (item && item.id !== undefined) {
            item.id = String(item.id);
          }
        });
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  static async getCompletion(id: string): Promise<OfflineCompletion | null> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_OFFLINE_COMPLETIONS, 'readonly');
      const store = transaction.objectStore(STORE_OFFLINE_COMPLETIONS);
      const request = store.get(String(id));

      request.onsuccess = () => {
        const result = request.result || null;
        if (result && result.id !== undefined) {
          result.id = String(result.id);
        }
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  static async deleteCompletion(id: string): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_OFFLINE_COMPLETIONS, 'readwrite');
      const store = transaction.objectStore(STORE_OFFLINE_COMPLETIONS);
      const request = store.delete(String(id));

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- STORE_CACHED_DEMANDS (Actual Demands List Cached) ---
  static async saveCachedDemands(demands: any[], clearFirst: boolean = true): Promise<void> {
    if (!demands || !Array.isArray(demands)) {
      console.warn('[IndexedDbService Logs] saveCachedDemands ignored because "demands" is not a valid array:', demands);
      return;
    }

    console.log('[IndexedDbService Logs] Starting saveCachedDemands. Incoming demands count:', demands.length, '| clearFirst:', clearFirst);

    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_CACHED_DEMANDS, 'readwrite');
      const store = transaction.objectStore(STORE_CACHED_DEMANDS);
      
      let hasError = false;

      transaction.oncomplete = () => {
        if (!hasError) {
          console.log('[IndexedDbService Logs] saveCachedDemands transaction COMPLETED. Handled demands count:', demands.length);
          resolve();
        }
      };

      transaction.onabort = (evt) => {
        console.error('[IndexedDbService Logs] saveCachedDemands transaction ABORTED. Cache was rolled back to previous state.', evt);
        reject(new Error('Transaction aborted'));
      };

      transaction.onerror = (evt) => {
        console.error('[IndexedDbService Logs] saveCachedDemands transaction ERROR. Cache was rolled back.', evt);
        reject(transaction.error);
      };

      const writeItems = () => {
        let count = demands.length;
        if (count === 0) {
          return; // transaction will complete and resolve
        }

        for (const item of demands) {
          if (item && item.id !== undefined) {
            item.id = String(item.id);
          }
          const req = store.put(item);
          req.onerror = () => {
            if (!hasError) {
              hasError = true;
              console.error('[IndexedDbService Logs] Failed storing demand:', item?.id, req.error);
              transaction.abort(); // Roll back general clear and all writes
            }
          };
          req.onsuccess = () => {
            // Logs every success silently or can print summaries
          };
        }
      };

      if (clearFirst) {
        // Clear previous cached demands to avoid stale cached items only during this active write
        const clearRequest = store.clear();
        
        clearRequest.onsuccess = () => {
          console.log('[IndexedDbService Logs] cached_demands store cleared successfully. Now injecting new items...');
          writeItems();
        };
        
        clearRequest.onerror = (evt) => {
          console.error('[IndexedDbService Logs] Failed to clear cached_demands store, aborting transaction...', evt);
          hasError = true;
          transaction.abort();
        };
      } else {
        console.log('[IndexedDbService Logs] Directly injecting new/updated items without clearing the store...');
        writeItems();
      }
    });
  }

  static async getAllCachedDemands(): Promise<any[]> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_CACHED_DEMANDS, 'readonly');
      const store = transaction.objectStore(STORE_CACHED_DEMANDS);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        results.forEach((item: any) => {
          if (item && item.id !== undefined) {
            item.id = String(item.id);
          }
        });
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  static async getCachedDemand(id: string): Promise<any | null> {
    const db = await this.initDb();
    const stringId = String(id).trim().toLowerCase();
    const numId = Number(stringId);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_CACHED_DEMANDS, 'readonly');
      const store = transaction.objectStore(STORE_CACHED_DEMANDS);

      const request = store.getAll();
      request.onsuccess = () => {
        const allCached = request.result || [];
        console.log(`[IndexedDbService getCachedDemand] Checking ID: "${stringId}". Total in cache:`, allCached.length);

        const found = allCached.find((d: any) => {
          if (!d || d.id === undefined) return false;
          const currentId = String(d.id).trim().toLowerCase();
          return currentId === stringId || (!isNaN(numId) && Number(d.id) === numId);
        });

        if (found) {
          if (found.id !== undefined) {
            found.id = String(found.id);
          }
          console.log(`[IndexedDbService getCachedDemand] Match FOUND for ID: "${stringId}":`, found);
          resolve(found);
        } else {
          console.warn(`[IndexedDbService getCachedDemand] Match NOT FOUND in cache list for ID: "${stringId}".`);
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error(`[IndexedDbService getCachedDemand] Error in getAll for lookup:`, request.error);
        reject(request.error);
      };
    });
  }

  static async getCachedDemandById(id: string): Promise<any | null> {
    console.log('[IndexedDbService Logs] getCachedDemandById lookup requested for ID:', id);
    try {
      const result = await this.getCachedDemand(id);
      console.log('[IndexedDbService Logs] getCachedDemandById lookup result for ID:', id, '| Found:', !!result);
      return result;
    } catch (err) {
      console.error('[IndexedDbService Logs] getCachedDemandById database error for ID:', id, err);
      throw err;
    }
  }

  // --- STORE_CACHED_METADATA (Static System Meta for Offline Selects) ---
  static async saveMetadata(key: string, data: any): Promise<void> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_CACHED_METADATA, 'readwrite');
      const store = transaction.objectStore(STORE_CACHED_METADATA);
      const request = store.put({ key, data });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  static async getMetadata(key: string): Promise<any | null> {
    const db = await this.initDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_CACHED_METADATA, 'readonly');
      const store = transaction.objectStore(STORE_CACHED_METADATA);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result ? request.result.data : null);
      request.onerror = () => reject(request.error);
    });
  }
}
