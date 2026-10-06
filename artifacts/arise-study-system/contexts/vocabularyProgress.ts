export type VocabularySectionProgress = {
  id: string;
  title: string;
  pages: number;
  completed: number;
};

export type VocabularyDailyProgress = {
  currentVocabularySectionId: string;
  currentVocabularyPage: number;
  vocabularyDailyDate: string;
  vocabularyDailyCompleted: boolean;
};

export type SavedVocabularyDailyProgress = Partial<VocabularyDailyProgress>;

export const BLACK_BOOK_CATEGORY_ORDER = [
  'one-word', 'idioms', 'syno-anto', 'phrasal-verbs',
  'fixed-preposition', 'hindu-vocabulary', 'homonyms',
];

function nextAssignment(sections: VocabularySectionProgress[], _preferredId: string) {
  if (sections.length === 0) return { sectionId: '', page: 0 };

  const ordered = [...sections].sort((a, b) => {
    const ai = BLACK_BOOK_CATEGORY_ORDER.indexOf(a.id);
    const bi = BLACK_BOOK_CATEGORY_ORDER.indexOf(b.id);
    return (ai < 0 ? BLACK_BOOK_CATEGORY_ORDER.length : ai)
      - (bi < 0 ? BLACK_BOOK_CATEGORY_ORDER.length : bi);
  });
  const next = ordered.find((section) => section.completed < section.pages);

  return next
    ? { sectionId: next.id, page: next.completed + 1 }
    : { sectionId: ordered[0].id, page: 0 };
}

export function prepareVocabularyDailyProgress(
  sections: VocabularySectionProgress[],
  saved: SavedVocabularyDailyProgress,
  today: string,
): VocabularyDailyProgress {
  const savedSection = sections.find((section) => section.id === saved.currentVocabularySectionId);
  const preferredId = savedSection?.id ?? sections[0]?.id ?? '';
  const savedPage = saved.currentVocabularyPage ?? 0;

  if (saved.vocabularyDailyDate === today && savedSection) {
    const completedToday =
      saved.vocabularyDailyCompleted === true &&
      savedPage > 0 &&
      savedPage <= savedSection.pages &&
      savedSection.completed >= savedPage;

    if (completedToday) {
      return {
        currentVocabularySectionId: savedSection.id,
        currentVocabularyPage: savedPage,
        vocabularyDailyDate: today,
        vocabularyDailyCompleted: true,
      };
    }

    if (savedSection.completed < savedSection.pages) {
      return {
        currentVocabularySectionId: savedSection.id,
        currentVocabularyPage: savedSection.completed + 1,
        vocabularyDailyDate: today,
        vocabularyDailyCompleted: false,
      };
    }
  }

  const assignment = nextAssignment(sections, preferredId);
  return {
    currentVocabularySectionId: assignment.sectionId,
    currentVocabularyPage: assignment.page,
    vocabularyDailyDate: today,
    vocabularyDailyCompleted: false,
  };
}

export function selectVocabularyDailyCategory(
  sections: VocabularySectionProgress[],
  current: VocabularyDailyProgress,
  sectionId: string,
  today: string,
): VocabularyDailyProgress {
  const daily = prepareVocabularyDailyProgress(sections, current, today);
  if (daily.vocabularyDailyCompleted) return daily;
  // Keep an existing day's assignment, but never skip ahead to another category.
  if (sectionId !== daily.currentVocabularySectionId) return daily;

  const section = sections.find((item) => item.id === sectionId);
  if (!section || section.completed >= section.pages) return daily;

  return {
    currentVocabularySectionId: section.id,
    currentVocabularyPage: section.completed + 1,
    vocabularyDailyDate: today,
    vocabularyDailyCompleted: false,
  };
}

export function completeVocabularyDailyPage(
  sections: VocabularySectionProgress[],
  current: VocabularyDailyProgress,
  sectionId: string,
  today: string,
): { sections: VocabularySectionProgress[]; progress: VocabularyDailyProgress; completed: boolean } {
  const daily = prepareVocabularyDailyProgress(sections, current, today);
  if (current.vocabularyDailyDate !== today) {
    return { sections, progress: daily, completed: false };
  }
  const assignedSection = sections.find((section) => section.id === daily.currentVocabularySectionId);

  if (
    daily.vocabularyDailyCompleted ||
    daily.vocabularyDailyDate !== today ||
    daily.currentVocabularySectionId !== sectionId ||
    !assignedSection ||
    daily.currentVocabularyPage <= 0 ||
    assignedSection.completed + 1 !== daily.currentVocabularyPage
  ) {
    return { sections, progress: daily, completed: false };
  }

  const nextSections = sections.map((section) =>
    section.id === sectionId
      ? { ...section, completed: section.completed + 1 }
      : section,
  );

  return {
    sections: nextSections,
    progress: { ...daily, vocabularyDailyCompleted: true },
    completed: true,
  };
}