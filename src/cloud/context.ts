import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';
import type { HouseholdMeta, Invite, Member, Profile } from './household';
import type { InboxChoice, InboxEntry, InboxKey, MerchantMatch } from '../lib/inbox';
import type { Booked } from '../store/book';

export interface CloudValue {
  user: User;
  profile: Profile | null;
  householdId: string;
  household: HouseholdMeta | null;
  members: Member[];
  /** Bara för ägaren */
  invites: Invite[];
  isOwner: boolean;
}

export const CloudContext = createContext<CloudValue | null>(null);

/** null när appen körs lokalt utan inloggning. */
export function useCloud(): CloudValue | null {
  return useContext(CloudContext);
}

export interface InboxValue {
  /** Köp från Apple Pay som väntar på att bokföras, senaste först */
  entries: InboxEntry[];
  keys: InboxKey[];
  /** Felmeddelande om inkorgen inte kan läsas (t.ex. om reglerna inte publicerats) */
  error: string | null;
  suggest(entry: InboxEntry): MerchantMatch | null;
  /** Hur köpet bokförs med ett tryck (känd handlare, i kronor), annars null */
  quickChoice(entry: InboxEntry): InboxChoice | null;
  /** Bokför köpet, minns handlaren och tar bort det ur inkorgen */
  book(entry: InboxEntry, choice: InboxChoice): Booked;
  discard(entry: InboxEntry): void;
  /** Ångra book/discard: tar bort transaktionerna och lägger tillbaka köpet i inkorgen */
  undo(entries: InboxEntry[], txIds: string[]): void;
  /** personId kan vara HOUSEHOLD för det gemensamma kortet */
  createKey(personId: string): Promise<void>;
  revokeKey(key: string): Promise<void>;
  urlFor(key: string): string;
}

export const InboxContext = createContext<InboxValue | null>(null);

/** null utan molnet – då finns ingen inkorg. */
export function useInbox(): InboxValue | null {
  return useContext(InboxContext);
}
