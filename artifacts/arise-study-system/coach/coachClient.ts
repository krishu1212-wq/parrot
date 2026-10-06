import {
  setBaseUrl,
  type CoachMode,
  type CoachProgress,
  type CoachRequest,
} from '@workspace/api-client-react';

const publicDomain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
export const coachApiConfigured = Boolean(publicDomain);
if (publicDomain) {
  // Expo runs outside Replit's shared proxy, so generated /api calls use the
  // project's configured domain rather than localhost or the Metro host.
  setBaseUrl(`https://${publicDomain}`);
}

export type CoachTool = CoachMode | 'records';
export type CoachDraft = {
  text: string;
  notes: string;
  question: string;
  recall: string;
  attempt: string;
  correctAnswer: string;
  material: string;
  topic: string;
  reflection: string;
  goal: string;
};

export const createEmptyCoachDraft = (): CoachDraft => ({
  text: '',
  notes: '',
  question: '',
  recall: '',
  attempt: '',
  correctAnswer: '',
  material: '',
  topic: '',
  reflection: '',
  goal: '',
});

const modeFields: Record<CoachMode, (keyof CoachDraft)[]> = {
  coach: ['text'],
  'read-recall': ['notes', 'question', 'recall', 'text'],
  mistake: ['question', 'attempt', 'correctAnswer', 'text'],
  'one-more-question': ['material', 'topic', 'text'],
  'concept-map': ['notes', 'text'],
  'next-best-action': [],
  'wind-down': ['reflection', 'text'],
  experiment: ['goal', 'text'],
};

export function makeCoachRequest(
  mode: CoachMode,
  draft: CoachDraft,
  progress?: CoachProgress,
): CoachRequest {
  const fields: CoachRequest['fields'] = {};
  for (const key of modeFields[mode]) {
    const value = draft[key].trim();
    if (value) fields[key] = value;
  }
  return {
    mode,
    fields,
    ...(mode === 'next-best-action' && progress ? { progress } : {}),
  };
}

export const COACH_TOOLS: { id: CoachTool; title: string; icon: string }[] = [
  { id: 'coach', title: 'Coach', icon: 'message-circle' },
  { id: 'read-recall', title: 'Read → Recall', icon: 'book-open' },
  { id: 'mistake', title: 'Mistake', icon: 'alert-circle' },
  { id: 'one-more-question', title: 'One More', icon: 'help-circle' },
  { id: 'concept-map', title: 'Concept Map', icon: 'git-branch' },
  { id: 'next-best-action', title: 'Next Action', icon: 'target' },
  { id: 'wind-down', title: 'Wind-down', icon: 'moon' },
  { id: 'experiment', title: '7-day Trial', icon: 'calendar' },
  { id: 'records', title: 'Records', icon: 'award' },
];