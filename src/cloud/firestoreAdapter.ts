import {
  collection,
  doc,
  onSnapshot,
  writeBatch,
  type DocumentData,
  type Firestore,
  type WriteBatch,
} from 'firebase/firestore';
import type { AppData, MonthBudget, Person, Settings, Transaction } from '../types';
import type { StorageAdapter } from '../store/storage';

/**
 * Datamodell i Firestore:
 *   households/{hid}                    { name, ownerId, persons, settings, merchants }
 *   households/{hid}/months/{monthId}   MonthBudget
 *   households/{hid}/transactions/{id}  Transaction
 *
 * Reducern i appen arbetar fortfarande mot ett helt AppData-objekt. Adaptern jämför mot
 * senast synkade läge och skriver bara de dokument som faktiskt ändrats.
 */
export class FirestoreAdapter implements StorageAdapter {
  private synced: AppData | null = null;

  constructor(
    private readonly db: Firestore,
    private readonly householdId: string,
  ) {}

  async load(): Promise<AppData | null> {
    return null;
  }

  subscribe(onData: (data: AppData) => void, onError: (err: Error) => void): () => void {
    let household: DocumentData | undefined;
    let months: Record<string, MonthBudget> | undefined;
    let transactions: Transaction[] | undefined;

    const emit = () => {
      if (!household || !months || !transactions) return;
      const data: AppData = {
        version: 1,
        persons: (household.persons ?? []) as Person[],
        settings: { periodStartDay: 25, ...(household.settings as Partial<Settings>) },
        months,
        transactions,
        merchants: (household.merchants ?? {}) as AppData['merchants'],
      };
      this.synced = data;
      onData(data);
    };

    const base = doc(this.db, 'households', this.householdId);
    const unsubs = [
      onSnapshot(
        base,
        (snap) => {
          household = snap.data() ?? {};
          emit();
        },
        onError,
      ),
      onSnapshot(
        collection(base, 'months'),
        (snap) => {
          months = Object.fromEntries(snap.docs.map((d) => [d.id, d.data() as MonthBudget]));
          emit();
        },
        onError,
      ),
      onSnapshot(
        collection(base, 'transactions'),
        (snap) => {
          transactions = snap.docs.map((d) => d.data() as Transaction);
          emit();
        },
        onError,
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }

  async save(data: AppData): Promise<void> {
    const prev = this.synced;
    if (!prev || prev === data) return;
    this.synced = data;

    const base = doc(this.db, 'households', this.householdId);
    const writes: ((b: WriteBatch) => void)[] = [];

    if (data.persons !== prev.persons || data.settings !== prev.settings || data.merchants !== prev.merchants) {
      writes.push((b) =>
        b.update(base, { persons: data.persons, settings: data.settings, merchants: data.merchants }),
      );
    }

    for (const [id, month] of Object.entries(data.months)) {
      if (prev.months[id] !== month) writes.push((b) => b.set(doc(base, 'months', id), month));
    }
    for (const id of Object.keys(prev.months)) {
      if (!data.months[id]) writes.push((b) => b.delete(doc(base, 'months', id)));
    }

    const prevTx = new Map(prev.transactions.map((t) => [t.id, t]));
    const nextIds = new Set<string>();
    for (const tx of data.transactions) {
      nextIds.add(tx.id);
      if (prevTx.get(tx.id) !== tx) writes.push((b) => b.set(doc(base, 'transactions', tx.id), tx));
    }
    for (const id of prevTx.keys()) {
      if (!nextIds.has(id)) writes.push((b) => b.delete(doc(base, 'transactions', id)));
    }

    // En batch rymmer max 500 skrivningar
    const commits: Promise<void>[] = [];
    for (let i = 0; i < writes.length; i += 450) {
      const batch = writeBatch(this.db);
      writes.slice(i, i + 450).forEach((w) => w(batch));
      commits.push(batch.commit());
    }
    await Promise.all(commits);
  }
}
