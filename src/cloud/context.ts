import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';
import type { HouseholdMeta, Invite, Member, Profile } from './household';

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
