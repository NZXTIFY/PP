import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HOUSEHOLD } from '../types';
import { useStore } from '../store/store';
import { bookPurchase, type Booked } from '../store/book';
import { useToast } from '../components/Toast';
import {
  findMerchantRule,
  merchantKey,
  parseInboxText,
  ruleChoice,
  type InboxChoice,
  type InboxEntry,
  type InboxItem,
  type InboxKey,
} from '../lib/inbox';
import { householdPercents } from '../lib/calc';
import { num } from '../lib/format';
import { periodOf, todayISO } from '../lib/period';
import { InboxContext, useCloud, type InboxValue } from './context';
import { errorText } from './household';
import { createInboxKey, deleteInboxItem, inboxUrl, restoreInboxItem, revokeInboxKey, watchInbox } from './inbox';

const RETRY_MS = 5000;

function inboxError(err: Error): string {
  if ((err as { code?: string }).code === 'permission-denied') {
    return 'Inkorgen kan inte läsas. Publicera de uppdaterade säkerhetsreglerna (firestore.rules) i Firebase-konsolen.';
  }
  return errorText(err);
}

/**
 * Håller koll på köpen från Apple Pay. Kända handlare bokförs direkt (om det är påslaget),
 * resten väntar under "Att kategorisera" på sidan Köp.
 */
export function InboxProvider({ householdId, children }: { householdId: string; children: ReactNode }) {
  const { data, dispatch, loaded } = useStore();
  const { user } = useCloud()!;
  const toast = useToast();
  const [keys, setKeys] = useState<InboxKey[]>([]);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Bokförda/slängda köp döljs direkt och tas bort ur Firestore när transaktionerna finns i datan
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const pending = useRef(new Map<string, { item: InboxItem; txIds: string[] }>());
  const deleted = useRef(new Set<string>());
  const autoTried = useRef(new Set<string>());

  // Firestore stänger lyssnaren vid fel (t.ex. innan nya regler publicerats) – försök igen efter en stund
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = watchInbox(householdId, setKeys, setItems, (err) => {
      setError(err ? inboxError(err) : null);
      if (!err) return;
      clearTimeout(timer);
      timer = setTimeout(() => setRetry((r) => r + 1), RETRY_MS);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [householdId, retry]);

  const entries = useMemo(() => {
    const owner = new Map(keys.map((k) => [k.key, k.personId]));
    const persons = new Set(data.persons.map((p) => p.id));
    // Hushållets adress delar köpen – är man ensam i hushållet blir de ens egna
    const personOf = (pid: string | undefined) =>
      pid === HOUSEHOLD ? (persons.size > 1 ? HOUSEHOLD : (data.persons[0]?.id ?? null)) : pid && persons.has(pid) ? pid : null;
    return items
      .filter((i) => !hidden.has(i.id))
      .map((i): InboxEntry => ({ id: i.id, key: i.key, raw: i.kop, personId: personOf(owner.get(i.key)), ...parseInboxText(i.kop) }))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));
  }, [items, keys, hidden, data.persons]);

  const itemOf = (e: InboxEntry): InboxItem => ({ id: e.id, key: e.key, kop: e.raw });

  function hide(entry: InboxEntry, txIds: string[]) {
    setHidden((h) => new Set(h).add(entry.id));
    pending.current.set(entry.id, { item: itemOf(entry), txIds });
  }

  /** Bokföring med ett tryck: känd handlare och köpet i kronor. */
  function quickChoice(entry: InboxEntry): InboxChoice | null {
    const match = findMerchantRule(data.merchants, entry.merchant);
    if (!match || entry.currency) return null;
    const today = todayISO();
    const split = householdPercents(data, periodOf(entry.date ?? today, data.settings.periodStartDay));
    return ruleChoice(entry, match.rule, split, today);
  }

  function book(entry: InboxEntry, choice: InboxChoice): Booked {
    const personIds = choice.target === HOUSEHOLD ? data.persons.map((p) => p.id) : [choice.target];
    const shared = personIds.length > 1;
    const booked = bookPurchase(data, dispatch, {
      personIds,
      percents: shared ? choice.percents : undefined,
      line: choice.line,
      amount: choice.amount,
      date: choice.date,
      note: choice.note,
      idBase: `w-${entry.id}`,
      source: 'wallet',
    });

    // Appen minns bara kategorin – vems köpet är avgörs av kortet
    if (entry.merchant && data.merchants[merchantKey(entry.merchant)]?.lineKey !== choice.line.key) {
      dispatch({
        type: 'rememberMerchant',
        rule: { name: entry.merchant, lineKey: choice.line.key, section: choice.line.section, lineName: choice.line.name },
      });
    }
    hide(entry, booked.txIds);
    return booked;
  }

  function undo(list: InboxEntry[], txIds: string[]) {
    for (const id of txIds) dispatch({ type: 'removeTransaction', id });
    setHidden((h) => {
      const next = new Set(h);
      list.forEach((e) => next.delete(e.id));
      return next;
    });
    for (const e of list) {
      autoTried.current.add(e.id); // Bokför inte automatiskt igen direkt
      if (pending.current.delete(e.id)) continue; // Inte borttaget ur Firestore än
      if (deleted.current.delete(e.id)) restoreInboxItem(householdId, itemOf(e)).catch((err) => toast(errorText(err)));
    }
  }

  // Ta bort köpen ur inkorgen när transaktionerna finns. setTimeout så att StoreProviders
  // effekt (som sparar transaktionerna) hinner köras först – barnets effekter körs före förälderns.
  useEffect(() => {
    const ids = new Set(data.transactions.map((t) => t.id));
    for (const [id, p] of pending.current) {
      if (!p.txIds.every((t) => ids.has(t))) continue;
      pending.current.delete(id);
      deleted.current.add(id);
      setTimeout(() => deleteInboxItem(householdId, p.item).catch((err) => toast(errorText(err))), 0);
    }
  }, [data.transactions, hidden, householdId, toast]);

  // Automatisk bokföring av kända handlare
  useEffect(() => {
    if (!loaded || data.settings.inboxAutoBook === false) return;
    const done: { entry: InboxEntry; choice: InboxChoice; booked: Booked }[] = [];
    for (const entry of entries) {
      if (autoTried.current.has(entry.id)) continue;
      // Bara säkra fall: exakt samma handlare, i kronor, med belopp och datum
      if (!findMerchantRule(data.merchants, entry.merchant)?.exact || !entry.date || !entry.amount || entry.amount < 0) continue;
      const choice = quickChoice(entry);
      if (!choice) continue;
      autoTried.current.add(entry.id);
      done.push({ entry, choice, booked: book(entry, choice) });
    }
    if (!done.length) return;
    const [first] = done;
    toast(
      done.length === 1
        ? `Apple Pay: ${num(first.choice.amount)} kr på ${first.choice.line.name} (${first.entry.merchant})`
        : `Apple Pay: ${done.length} köp bokfördes automatiskt`,
      { undo: () => undo(done.map((d) => d.entry), done.flatMap((d) => d.booked.txIds)) },
    );
  }, [entries, loaded, data.merchants, data.settings.inboxAutoBook]);

  const value: InboxValue = {
    entries,
    keys,
    error,
    suggest: (entry) => findMerchantRule(data.merchants, entry.merchant),
    quickChoice,
    book,
    discard: (entry) => hide(entry, []),
    undo,
    createKey: async (personId) => {
      await createInboxKey(householdId, personId, user.uid);
    },
    revokeKey: (key) =>
      revokeInboxKey(
        householdId,
        key,
        items.filter((i) => i.key === key).map((i) => i.id),
      ),
    urlFor: (key) => inboxUrl(householdId, key),
  };

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}
