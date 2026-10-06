import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useStudy } from '@/contexts/StudyContext';
import { useAriseAccount } from '@/contexts/AriseAccountContext';
import { useSystemExperience } from '@/contexts/SystemExperienceContext';
import { canonicalSoundEvents, chooseSound, FreshSystemEventCursor } from '@/contexts/systemExperiencePolicy';

/** Read-only observer of canonical receipts. Never acknowledges or awards anything. */
export function SystemSoundBridge() {
  const { hydrated, state, rpg } = useStudy();
  const account = useAriseAccount();
  const { ready, play, stop } = useSystemExperience();
  const cursor = useRef(new FreshSystemEventCursor());
  const owner = account.isSignedIn ? `account:${account.userId}:${account.sessionScope}` : 'anonymous';
  const previousOwner = useRef(owner);
  useEffect(() => {
    if (previousOwner.current !== owner) { stop(); previousOwner.current = owner; }
    if (!ready || !hydrated || account.status === 'loading' || (account.isSignedIn && !account.isBootstrapped)) {
      cursor.current.reset(); return;
    }
    const canonical = state.progressHistory?.systemEvents ?? [];
    const events = canonicalSoundEvents(canonical, rpg.events);
    const fresh = cursor.current.observe(owner, events, Date.now());
    // Background receipts are consumed, never queued for playback upon resume.
    if (AppState.currentState === 'background' || AppState.currentState === 'inactive' || account.conflict) return;
    const cue = chooseSound(fresh);
    if (cue) play(cue);
  }, [ready, hydrated, state.progressHistory, rpg.events, owner, account.status, account.isSignedIn,
    account.isBootstrapped, account.conflict, play, stop]);
  return null;
}