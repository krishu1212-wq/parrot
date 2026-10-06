import type { ProfileSettings } from './ProfileContext';

let hapticsEnabled = true;

export function setActiveProfilePreferences(settings: ProfileSettings | null): void {
  hapticsEnabled = settings?.hapticsEnabled ?? true;
}

export function isProfileHapticsEnabled(): boolean {
  return hapticsEnabled;
}