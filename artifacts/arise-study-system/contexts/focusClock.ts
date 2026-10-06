export type FocusPreset = 25 | 50 | 5 | 10;
export type FocusClock = {
  kind: 'focus' | 'break';
  presetMinutes: FocusPreset;
  task: string;
  elapsedMilliseconds: number;
  lastTickAt: number | null;
};

export const advanceFocusClock = (clock: FocusClock, now: number): FocusClock => ({
  ...clock,
  elapsedMilliseconds: Math.min(clock.presetMinutes * 60000,
    clock.elapsedMilliseconds + (clock.lastTickAt === null ? 0 : Math.max(0, now - clock.lastTickAt))),
  lastTickAt: clock.lastTickAt === null ? null : now,
});

export const focusSecondsRemaining = (clock: FocusClock) =>
  Math.max(0, clock.presetMinutes * 60 - Math.floor(clock.elapsedMilliseconds / 1000));