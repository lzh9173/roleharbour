import { t } from '../i18n';
import { openDB, type DBSchema } from 'idb';
import type { EmployerRevision, SnapshotMetadata, StoredEmployer, SyncState } from './types';

interface EmployerDatabase extends DBSchema {
  employers: { key: string; value: StoredEmployer; indexes: { names: string } };
  metadata: { key: string; value: SnapshotMetadata | SyncState | EmployerRevision };
}

let generation = 0;
/** Changes after every snapshot replacement committed from this context. */
export const snapshotGeneration = () => generation;

export const employerDatabase = () =>
  openDB<EmployerDatabase>('seek-filter-employers', 1, {
    upgrade(db) {
      db.createObjectStore('employers', { keyPath: 'nzbn' }).createIndex('names', 'names', {
        multiEntry: true,
      });
      db.createObjectStore('metadata');
    },
  });

export async function replaceEmployerSnapshot(
  records: StoredEmployer[],
  metadata: SnapshotMetadata,
  options: { expectedRevision?: number; clearSync?: boolean } = {},
): Promise<number | null> {
  const db = await employerDatabase();
  const tx = db.transaction(['employers', 'metadata'], 'readwrite');
  try {
    const revision =
      ((await tx.objectStore('metadata').get('revision')) as EmployerRevision | undefined)
        ?.revision ?? 0;
    if (options.expectedRevision !== undefined && revision !== options.expectedRevision) {
      await tx.done;
      return null;
    }
    if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER)
      throw new Error(t('errors.localListVersion'));
    await tx.objectStore('employers').clear();
    // Queue all writes while the transaction is live; commit both tables together.
    await Promise.all(records.map(async (record) => tx.objectStore('employers').put(record)));
    await tx.objectStore('metadata').put(metadata, 'snapshot');
    await tx.objectStore('metadata').put({ revision: revision + 1 }, 'revision');
    if (options.clearSync) await tx.objectStore('metadata').delete('sync');
    await tx.done;
    generation++;
    return revision + 1;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // The database may already have aborted a failed write.
    }
    await tx.done.catch(() => undefined);
    throw error;
  } finally {
    db.close();
  }
}
