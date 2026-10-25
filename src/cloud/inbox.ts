import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { newInboxKey, type InboxItem, type InboxKey } from '../lib/inbox';
import { firebaseConfig } from './config';
import { db } from './firebase';

/**
 * Inkorgen i Firestore:
 *   households/{hid}/inboxKeys/{key}         { personId, uid, createdAt }
 *   households/{hid}/inbox/{key}/items/{id}  { kop: "Belopp;Handlare;Datum" }
 *
 * Genvägen på telefonen skriver via REST-API:t utan att vara inloggad. Reglerna släpper bara
 * igenom nya köp till en nyckel som finns, och bara medlemmar kan läsa dem.
 */
export function inboxUrl(householdId: string, key: string): string {
  const { projectId, apiKey } = firebaseConfig!;
  return (
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents` +
    `/households/${householdId}/inbox/${key}/items?key=${apiKey}`
  );
}

export async function createInboxKey(householdId: string, personId: string, uid: string): Promise<string> {
  const key = newInboxKey();
  await setDoc(doc(db, 'households', householdId, 'inboxKeys', key), { personId, uid, createdAt: serverTimestamp() });
  return key;
}

/** Tar bort adressen och köpen som ligger kvar i den. */
export async function revokeInboxKey(householdId: string, key: string, itemIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  for (const id of itemIds) batch.delete(doc(db, 'households', householdId, 'inbox', key, 'items', id));
  batch.delete(doc(db, 'households', householdId, 'inboxKeys', key));
  await batch.commit();
}

export async function deleteInboxItem(householdId: string, item: Pick<InboxItem, 'id' | 'key'>): Promise<void> {
  await deleteDoc(doc(db, 'households', householdId, 'inbox', item.key, 'items', item.id));
}

/** Lägger tillbaka ett köp (ångra). Reglerna tillåter att det skapas igen så länge nyckeln finns. */
export async function restoreInboxItem(householdId: string, item: InboxItem): Promise<void> {
  await setDoc(doc(db, 'households', householdId, 'inbox', item.key, 'items', item.id), { kop: item.kop });
}

/** Lyssnar på alla adresser i hushållet och köpen i var och en. */
export function watchInbox(
  householdId: string,
  onKeys: (keys: InboxKey[]) => void,
  onItems: (items: InboxItem[]) => void,
  onError: (err: Error | null) => void,
): Unsubscribe {
  const itemsByKey = new Map<string, InboxItem[]>();
  const listeners = new Map<string, Unsubscribe>();
  const emit = () => onItems([...itemsByKey.values()].flat());

  const unsubKeys = onSnapshot(
    collection(db, 'households', householdId, 'inboxKeys'),
    (snap) => {
      onError(null);
      const keys = snap.docs.map((d) => ({ ...(d.data() as Omit<InboxKey, 'key'>), key: d.id }));
      onKeys(keys);
      const live = new Set(keys.map((k) => k.key));
      for (const [key, unsub] of listeners) {
        if (live.has(key)) continue;
        unsub();
        listeners.delete(key);
        itemsByKey.delete(key);
      }
      for (const { key } of keys) {
        if (listeners.has(key)) continue;
        listeners.set(
          key,
          onSnapshot(
            collection(db, 'households', householdId, 'inbox', key, 'items'),
            (items) => {
              itemsByKey.set(
                key,
                items.docs.map((d) => ({ id: d.id, key, kop: String(d.data().kop ?? '') })),
              );
              emit();
            },
            onError,
          ),
        );
      }
      emit();
    },
    onError,
  );

  return () => {
    unsubKeys();
    listeners.forEach((u) => u());
  };
}
