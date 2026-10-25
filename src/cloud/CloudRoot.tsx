import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, type DocumentReference, type Query } from 'firebase/firestore';
import { App } from '../App';
import { StoreProvider } from '../store/store';
import { auth, db } from './firebase';
import { FirestoreAdapter } from './firestoreAdapter';
import { CloudContext } from './context';
import type { HouseholdMeta, Invite, Member, Profile } from './household';
import { AuthScreen, HouseholdSetup } from './AuthScreens';
import { InboxProvider } from './InboxProvider';

const RETRY_MS = 5000;

/**
 * undefined = laddar, null = finns inte (eller nekad).
 * Firestore stänger en lyssnare efter ett fel, så vid fel prenumererar vi igen efter en stund
 * – t.ex. om reglerna ändrats eller man precis blivit medlem. `epoch` tvingar fram en ny prenumeration.
 */
function useDocData<T>(ref: DocumentReference | null, epoch = 0): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  const [retry, setRetry] = useState(0);
  const path = ref?.path ?? null;
  useEffect(() => {
    if (!ref) {
      setValue(null);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = onSnapshot(
      ref,
      (snap) => setValue(snap.exists() ? (snap.data() as T) : null),
      () => {
        setValue(null);
        timer = setTimeout(() => setRetry((r) => r + 1), RETRY_MS);
      },
    );
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [path, epoch, retry]); // ref är ett nytt objekt varje rendering – sökvägen är det som räknas
  return value;
}

function useCollection<T>(query: Query | null, key: string | null): T[] {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    if (!query) {
      setItems([]);
      return;
    }
    return onSnapshot(
      query,
      (snap) => setItems(snap.docs.map((d) => ({ ...(d.data() as T), _id: d.id }))),
      () => setItems([]),
    );
  }, [key]);
  return items;
}

export default function CloudRoot() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <div className="loading">Laddar…</div>;
  if (!user) return <AuthScreen />;
  return <SignedIn key={user.uid} user={user} />;
}

function SignedIn({ user }: { user: User }) {
  const [epoch, setEpoch] = useState(0);
  const profile = useDocData<Profile>(doc(db, 'users', user.uid), epoch);
  const householdId = profile?.householdId ?? null;
  const membership = useDocData<Member>(
    householdId ? doc(db, 'households', householdId, 'members', user.uid) : null,
    epoch,
  );

  if (profile === undefined || (householdId && membership === undefined)) {
    return <div className="loading">Laddar…</div>;
  }
  if (!householdId || !membership) {
    return (
      <HouseholdSetup
        user={user}
        profile={profile}
        removed={!!householdId && membership === null}
        onJoined={() => setEpoch((e) => e + 1)}
      />
    );
  }
  return <Session user={user} profile={profile} householdId={householdId} />;
}

function Session({ user, profile, householdId }: { user: User; profile: Profile | null; householdId: string }) {
  const household = useDocData<HouseholdMeta>(doc(db, 'households', householdId)) ?? null;
  const isOwner = household?.ownerId === user.uid;
  const members = useCollection<Member & { _id: string }>(
    collection(db, 'households', householdId, 'members'),
    householdId,
  ).map((m) => ({ ...m, uid: m._id }));
  const invites = useCollection<Invite & { _id: string }>(
    isOwner ? collection(db, 'households', householdId, 'invites') : null,
    isOwner ? householdId : null,
  )
    .map((i) => ({ ...i, code: i._id }))
    .filter((i) => i.expiresAt && i.expiresAt.toMillis() > Date.now());

  const adapter = useMemo(() => new FirestoreAdapter(db, householdId), [householdId]);

  return (
    <CloudContext.Provider value={{ user, profile, householdId, household, members, invites, isOwner }}>
      <StoreProvider key={householdId} adapter={adapter}>
        <InboxProvider householdId={householdId}>
          <App />
        </InboxProvider>
      </StoreProvider>
    </CloudContext.Provider>
  );
}
