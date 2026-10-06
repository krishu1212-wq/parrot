import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton, ProgressBar, ScreenHeader } from '@/components/StudyPrimitives';
import { NcertBook, useStudy } from '@/contexts/StudyContext';
import { LinearGradient } from 'expo-linear-gradient';
import { GUARDIAN_NAMES, GuardianArt } from '@/components/AriseArt';
import { HudFrame, WorldArtwork } from '@/components/VisualWorld';
import { useColors } from '@/hooks/useColors';
import WordLearningPanel from '@/components/study-tools/WordLearningPanel';

type LibraryMode = 'ncert' | 'vocabulary';

export default function LibraryScreen() {
  const baseColors = useColors();
  const insets = useSafeAreaInsets();
  const { state, advanceNcertBookSession, addNcertVocabulary, selectVocabularySection, completeVocabularyPage, updateNcertBookTarget } = useStudy();
  const [targetInput, setTargetInput] = useState('');
  const [targetError, setTargetError] = useState('');
  const sectionLabel = (t: string, id?: string) => (id === 'syno-anto' || /syno|anto/i.test(t) ? 'Synonyms/Antonyms' : t);
  const [mode, setMode] = useState<LibraryMode>('ncert');
  const accent = mode === 'ncert' ? '#B07CFF' : '#D86BFF';
  const colors = { ...baseColors, primary: accent };
  const [expandedClass, setExpandedClass] = useState('class-1');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [wordInput, setWordInput] = useState('');
  const ncertProgress = state.ncertCompleted / state.ncertTotal;
  const vocabularyProgress = state.blackBookPage / state.blackBookTotal;
  const collectedWords = useMemo(() => state.ncertShelves.reduce((sum, shelf) => sum + shelf.vocabulary, 0), [state.ncertShelves]);
  const currentVocabulary = useMemo(
    () => state.vocabularySections.find((section) => section.id === state.currentVocabularySectionId) ?? state.vocabularySections[0],
    [state.currentVocabularySectionId, state.vocabularySections],
  );
  const selectedBook = useMemo(
    () => state.ncertBooks.find((book) => book.id === selectedBookId) ?? null,
    [selectedBookId, state.ncertBooks],
  );

  const openBook = (bookId: string) => {
    setSelectedBookId(bookId);
    setWordInput('');
    setTargetError('');
    setTargetInput(String(state.ncertBooks.find((b) => b.id === bookId)?.totalSessions ?? ''));
  };

  const closeBook = () => {
    Keyboard.dismiss();
    setSelectedBookId(null);
    setWordInput('');
  };

  const saveTarget = () => {
    if (!selectedBook) return;
    const n = Number(targetInput);
    if (!Number.isInteger(n) || n < 1 || n > 10000 || n < selectedBook.completedSessions) {
      setTargetError(`Enter a whole number from ${Math.max(1, selectedBook.completedSessions)} to 10000.`);
      return;
    }
    const ok = updateNcertBookTarget(selectedBook.id, n);
    setTargetError(ok ? '' : 'Target could not be saved.');
  };

  const addWord = () => {
    if (!selectedBook || !wordInput.trim()) return;
    addNcertVocabulary(selectedBook.id, wordInput);
    setWordInput('');
    Keyboard.dismiss();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
        style={{ backgroundColor: colors.background }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader kicker="KNOWLEDGE ARCHIVE" title="Study Library" detail="Open a book, complete its next session, and collect useful words." icon="layers" />
        <View style={{ marginBottom: 16 }} testID="library-hero-art">
          <View style={{ height: 240, overflow: 'hidden', backgroundColor: baseColors.background }}>
            <WorldArtwork scene={mode === 'ncert' ? 'vault' : 'guardian'} opacity={0.85} />
            <LinearGradient colors={['rgba(4,8,18,0.05)', 'rgba(4,8,18,0.95)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none" />
            <View style={{ position: 'absolute', top: 8, alignSelf: 'center' }}><GuardianArt kind={mode === 'ncert' ? 'ncert' : 'vocabulary'} size={150} /></View>
          </View>
          <HudFrame accent={accent} style={{ marginTop: -22, marginHorizontal: 8 }}>
            <Text style={{ color: accent, fontSize: 10, fontWeight: '700', letterSpacing: 2 }}>{GUARDIAN_NAMES[mode === 'ncert' ? 'ncert' : 'vocabulary'].toUpperCase()}</Text>
            <Text style={{ color: baseColors.foreground, fontSize: 22, fontWeight: '700', marginTop: 2 }}>{mode === 'ncert' ? 'NCERT Archive' : 'Black Book'}</Text>
            <Text style={{ color: baseColors.mutedForeground, fontSize: 13, marginTop: 2 }}>
              {mode === 'ncert' ? `${state.ncertCompleted}/${state.ncertTotal} sessions complete` : `${state.blackBookPage}/${state.blackBookTotal} pages complete`}
            </Text>
          </HudFrame>
        </View>
        <View style={styles.switcher}>
          {(['ncert', 'vocabulary'] as LibraryMode[]).map((item) => (
            <Pressable key={item} onPress={() => setMode(item)} style={[styles.switcherItem, { backgroundColor: mode === item ? colors.primary : colors.card }]}>
              <Feather name={item === 'ncert' ? 'book' : 'bookmark'} size={15} color={mode === item ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.switcherText, { color: mode === item ? colors.primaryForeground : colors.mutedForeground }]}>{item === 'ncert' ? 'NCERT' : 'BLACK BOOK'}</Text>
            </Pressable>
          ))}
        </View>

        {mode === 'ncert' ? (
          <>
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.summaryTop}>
                <View>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>NCERT LIBRARY</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>{state.ncertCompleted}<Text style={[styles.summaryTotal, { color: colors.mutedForeground }]}> / {state.ncertTotal} BOOKS</Text></Text>
                </View>
                <Text style={[styles.summaryPercent, { color: colors.accent }]}>{Math.round(ncertProgress * 100)}%</Text>
              </View>
              <ProgressBar value={ncertProgress} color={colors.accent} />
              <Text style={[styles.summaryNote, { color: colors.mutedForeground }]}>{collectedWords} vocabulary entries collected from {state.ncertBooks.length} books</Text>
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Class shelves</Text>
            <Text style={[styles.sectionNote, { color: colors.mutedForeground }]}>Tap a class to view its books. Open any book to track chapter sessions and words.</Text>
            <View style={styles.list}>
              {state.ncertShelves.map((shelf) => {
                const complete = shelf.completed >= shelf.bookCount;
                const expanded = expandedClass === shelf.id;
                const books = state.ncertBooks.filter((book) => book.classId === shelf.id);
                return (
                  <View key={shelf.id} style={[styles.shelfCard, { borderRadius: 4, borderLeftWidth: 3, backgroundColor: colors.card, borderColor: complete ? colors.primary : colors.border }]}>
                    <Pressable
                      testID={`ncert-class-${shelf.id}`}
                      onPress={() => setExpandedClass(expanded ? '' : shelf.id)}
                      style={({ pressed }) => [styles.shelfHeader, { opacity: pressed ? 0.78 : 1 }]}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}>
                        <Text style={[styles.rowIconText, { color: colors.primary }]}>{shelf.classLabel.slice(-2)}</Text>
                      </View>
                      <View style={styles.rowCopy}>
                        <View style={styles.rowTitleLine}>
                          <Text style={[styles.rowTitle, { color: colors.foreground }]}>{shelf.classLabel}</Text>
                          <Text style={[styles.rowCount, { color: complete ? colors.primary : colors.secondaryForeground }]}>{shelf.completed}/{shelf.bookCount}</Text>
                        </View>
                        <ProgressBar value={shelf.completed / shelf.bookCount} color={complete ? colors.primary : colors.accent} />
                        <Text style={[styles.rowDetail, { color: colors.mutedForeground }]}>{shelf.sessions} sessions · {shelf.vocabulary} words collected</Text>
                      </View>
                      <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={complete ? colors.primary : colors.mutedForeground} />
                    </Pressable>
                    {expanded ? (
                      <View style={[styles.bookList, { borderTopColor: colors.border }]}>
                        {books.map((book) => {
                          const bookComplete = book.completedSessions >= book.totalSessions;
                          return (
                            <Pressable
                              key={book.id}
                              testID={`ncert-book-${book.id}`}
                              onPress={() => openBook(book.id)}
                              style={({ pressed }) => [styles.bookRow, { borderBottomColor: colors.border, opacity: pressed ? 0.78 : 1 }]}
                            >
                              <View style={[styles.bookIcon, { backgroundColor: colors.secondary }]}>
                                <Feather name={bookComplete ? 'check' : 'book-open'} size={14} color={bookComplete ? colors.primary : colors.accent} />
                              </View>
                              <View style={styles.bookCopy}>
                                <View style={styles.rowTitleLine}>
                                  <Text style={[styles.bookTitle, { color: colors.foreground }]}>{book.title}</Text>
                                  <Text style={[styles.bookCount, { color: bookComplete ? colors.primary : colors.secondaryForeground }]}>{book.completedSessions}/{book.totalSessions}</Text>
                                </View>
                                <ProgressBar value={book.completedSessions / book.totalSessions} color={bookComplete ? colors.primary : colors.accent} />
                                <Text style={[styles.bookDetail, { color: colors.mutedForeground }]}>{book.vocabulary.length} words · tap to open</Text>
                              </View>
                              <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.summaryTop}>
                <View>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>BLACK BOOK</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>{state.blackBookPage}<Text style={[styles.summaryTotal, { color: colors.mutedForeground }]}> / {state.blackBookTotal} PAGES</Text></Text>
                </View>
                <Text style={[styles.summaryPercent, { color: colors.primary }]}>{Math.round(vocabularyProgress * 100)}%</Text>
              </View>
              <ProgressBar value={vocabularyProgress} />
              <Text style={[styles.summaryNote, { color: colors.mutedForeground }]}>Daily target: 1 page per study day · {state.blackBookPage} completed pages</Text>
            </View>
            {currentVocabulary ? (
              <View style={[styles.currentVocabularyCard, { backgroundColor: colors.secondary, borderColor: colors.primary }]}>
                <View style={styles.currentVocabularyTop}>
                  <View style={styles.currentVocabularyCopy}>
                    <Text style={[styles.currentVocabularyKicker, { color: colors.primary }]}>TODAY&apos;S ASSIGNED PAGE</Text>
                    <Text style={[styles.currentVocabularyTitle, { color: colors.foreground }]}>{sectionLabel(currentVocabulary.title, currentVocabulary.id)}</Text>
                    <Text style={[styles.currentVocabularyDetail, { color: colors.mutedForeground }]}>
                      {state.currentVocabularyPage > 0
                        ? `Page ${state.currentVocabularyPage} of ${currentVocabulary.pages} · ${currentVocabulary.completed} completed`
                        : 'All vocabulary pages are complete'}
                    </Text>
                  </View>
                  <View style={[styles.pageBadge, { backgroundColor: colors.card }]}>
                    <Text style={[styles.pageBadgeValue, { color: colors.accent }]}>{state.currentVocabularyPage || '—'}</Text>
                    <Text style={[styles.pageBadgeLabel, { color: colors.mutedForeground }]}>{state.vocabularyDailyCompleted ? 'DONE' : 'PAGE'}</Text>
                  </View>
                </View>
                <ActionButton
                  label={
                    state.currentVocabularyPage === 0
                      ? 'ALL PAGES COMPLETE'
                      : state.vocabularyDailyCompleted
                        ? 'DAILY PAGE COMPLETE'
                        : 'COMPLETE TODAY’S PAGE'
                  }
                  icon={state.vocabularyDailyCompleted || state.currentVocabularyPage === 0 ? 'check' : 'arrow-right'}
                  onPress={() => completeVocabularyPage(currentVocabulary.id)}
                  disabled={state.vocabularyDailyCompleted || state.currentVocabularyPage === 0}
                />
              </View>
            ) : null}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Vocabulary sequence</Text>
            <Text style={[styles.sectionNote, { color: colors.mutedForeground }]}>
              {state.currentVocabularyPage === 0
                ? 'All seven Black Book categories are complete.'
                : state.vocabularyDailyCompleted
                  ? 'Today’s page is complete. Your next assignment will be available tomorrow.'
                  : 'Today’s category is assigned automatically and fixed. Complete its page below.'}
            </Text>
            <View style={styles.list}>
              {state.vocabularySections.map((section) => {
                const complete = section.completed >= section.pages;
                const selected = section.id === state.currentVocabularySectionId;
                return (
                  <Pressable
                    key={section.id}
                    testID={`vocabulary-section-${section.id}`}
                    onPress={() => selectVocabularySection(section.id)}
                    disabled={complete || state.vocabularyDailyCompleted || !selected}
                    style={({ pressed }) => [styles.libraryRow, { borderRadius: 4, borderLeftWidth: 3, backgroundColor: selected ? colors.secondary : colors.card, borderColor: selected || complete ? colors.primary : colors.border, opacity: pressed ? 0.78 : 1 }]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}>
                      <Feather name={complete ? 'check' : selected ? 'target' : 'bookmark'} size={16} color={complete ? colors.primary : selected ? colors.primary : colors.accent} />
                    </View>
                    <View style={styles.rowCopy}>
                      <View style={styles.rowTitleLine}>
                        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{sectionLabel(section.title, section.id)}</Text>
                        <Text style={[styles.rowCount, { color: complete ? colors.primary : colors.secondaryForeground }]}>{section.completed}/{section.pages}</Text>
                      </View>
                      <ProgressBar value={section.completed / section.pages} color={complete ? colors.primary : colors.accent} />
                      <Text style={[styles.rowDetail, { color: selected ? colors.primary : colors.mutedForeground }]}>
                        {selected
                          ? state.currentVocabularyPage === 0
                            ? 'ALL PAGES COMPLETE'
                            : state.vocabularyDailyCompleted
                              ? `TODAY COMPLETE · PAGE ${state.currentVocabularyPage}`
                              : `CURRENT · TODAY’S PAGE ${state.currentVocabularyPage}`
                          : complete
                            ? 'CATEGORY COMPLETE'
                            : state.vocabularyDailyCompleted
                              ? 'DAILY TARGET COMPLETE'
                              : 'FIXED FOR TODAY · only the assigned category can be completed'}
                      </Text>
                    </View>
                    <Feather name={selected ? 'check-circle' : complete ? 'check-circle' : 'chevron-right'} size={17} color={selected || complete ? colors.primary : colors.mutedForeground} />
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        <WordLearningPanel />
      </ScrollView>

      <Modal visible={Boolean(selectedBook)} transparent animationType="slide" onRequestClose={closeBook}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.bookModal, { backgroundColor: colors.card, borderColor: colors.primary }]}>
            {selectedBook ? (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.modalKicker, { color: colors.primary }]}>{selectedBook.classLabel} · OPEN BOOK</Text>
                    <Text style={[styles.modalTitle, { color: colors.foreground }]}>{selectedBook.title}</Text>
                  </View>
                  <Pressable testID="close-ncert-book" onPress={closeBook} style={[styles.closeButton, { borderColor: colors.border }]}>
                    <Feather name="x" size={17} color={colors.mutedForeground} />
                  </Pressable>
                </View>
                <Text style={[styles.modalNote, { color: colors.mutedForeground }]}>Complete one focused chapter/session at a time. Your progress is saved automatically.</Text>
                <View style={[styles.modalProgressCard, { backgroundColor: colors.secondary }]}>
                  <View style={styles.rowTitleLine}>
                    <Text style={[styles.modalProgressLabel, { color: colors.secondaryForeground }]}>READING PROGRESS</Text>
                    <Text style={[styles.modalProgressCount, { color: colors.primary }]}>{selectedBook.completedSessions}/{selectedBook.totalSessions} SESSIONS</Text>
                  </View>
                  <ProgressBar value={selectedBook.completedSessions / selectedBook.totalSessions} />
                </View>
                {selectedBook.completedSessions >= selectedBook.totalSessions ? (
                  <Text style={[styles.modalNote, { color: colors.mutedForeground }]}>Completed book: target locked to preserve history.</Text>
                ) : (
                  <View style={styles.wordComposer}>
                    <TextInput testID="ncert-target-input" value={targetInput} onChangeText={setTargetInput} keyboardType="number-pad" placeholder="Reading target (sessions)" placeholderTextColor={colors.mutedForeground} style={[styles.wordInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
                    <Pressable testID="ncert-save-target" onPress={saveTarget} style={[styles.addWordButton, { backgroundColor: colors.primary, width: 64 }]}>
                      <Text style={{ color: colors.primaryForeground, fontWeight: '700', fontSize: 10 }}>SAVE</Text>
                    </Pressable>
                  </View>
                )}
                {targetError ? <Text style={[styles.modalNote, { color: colors.accent }]}>{targetError}</Text> : null}
                <ActionButton
                  label={selectedBook.completedSessions >= selectedBook.totalSessions ? 'BOOK COMPLETE' : 'COMPLETE NEXT SESSION'}
                  icon={selectedBook.completedSessions >= selectedBook.totalSessions ? 'check' : 'arrow-right'}
                  onPress={() => advanceNcertBookSession(selectedBook.id)}
                  disabled={selectedBook.completedSessions >= selectedBook.totalSessions}
                />
                <Text style={[styles.wordsTitle, { color: colors.foreground }]}>Vocabulary from this book</Text>
                <View style={styles.wordComposer}>
                  <TextInput
                    testID="ncert-word-input"
                    value={wordInput}
                    onChangeText={setWordInput}
                    onSubmitEditing={addWord}
                    returnKeyType="done"
                    placeholder="Add a learned word"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.wordInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  />
                  <Pressable testID="ncert-add-word" onPress={addWord} disabled={!wordInput.trim()} style={({ pressed }) => [styles.addWordButton, { backgroundColor: wordInput.trim() ? colors.accent : colors.muted, opacity: pressed ? 0.75 : 1 }]}>
                    <Feather name="plus" size={18} color={wordInput.trim() ? '#161029' : colors.mutedForeground} />
                  </Pressable>
                </View>
                <ScrollView style={styles.wordList} showsVerticalScrollIndicator={false}>
                  {selectedBook.vocabulary.length ? selectedBook.vocabulary.map((word) => (
                    <View key={word} style={[styles.wordChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                      <Feather name="bookmark" size={12} color={colors.accent} />
                      <Text style={[styles.wordText, { color: colors.secondaryForeground }]}>{word}</Text>
                    </View>
                  )) : (
                    <Text style={[styles.emptyWords, { color: colors.mutedForeground }]}>No words collected yet. Add the first one after reading.</Text>
                  )}
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 14 },
  switcher: { flexDirection: 'row', gap: 9, marginBottom: 20 },
  switcherItem: { flex: 1, minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  switcherText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  summaryCard: { borderWidth: 1, borderRadius: 18, padding: 17, marginBottom: 27 },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 13 },
  summaryLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginBottom: 5 },
  summaryValue: { fontSize: 28, fontWeight: '700' },
  summaryTotal: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  summaryPercent: { fontSize: 25, fontWeight: '700' },
  summaryNote: { fontSize: 12, marginTop: 12, lineHeight: 17 },
  currentVocabularyCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 24 },
  currentVocabularyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  currentVocabularyCopy: { flex: 1, paddingRight: 12 },
  currentVocabularyKicker: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginBottom: 5 },
  currentVocabularyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  currentVocabularyDetail: { fontSize: 11, lineHeight: 16 },
  pageBadge: { width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pageBadgeValue: { fontSize: 20, fontWeight: '700' },
  pageBadgeLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 0.8, marginTop: 1 },
  sectionTitle: { fontSize: 21, fontWeight: '700', marginBottom: 5 },
  sectionNote: { fontSize: 12, lineHeight: 17, marginBottom: 14 },
  list: { gap: 9 },
  shelfCard: { borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
  shelfHeader: { minHeight: 75, padding: 11, flexDirection: 'row', alignItems: 'center' },
  bookList: { borderTopWidth: 1, paddingHorizontal: 10 },
  bookRow: { minHeight: 66, borderBottomWidth: 1, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  bookIcon: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  bookCopy: { flex: 1, gap: 6, paddingRight: 8 },
  bookTitle: { flex: 1, fontSize: 12, fontWeight: '600' },
  bookCount: { fontSize: 10, fontWeight: '700', marginLeft: 8 },
  bookDetail: { fontSize: 9 },
  libraryRow: { minHeight: 75, borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center' },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  rowIconText: { fontSize: 12, fontWeight: '700' },
  rowCopy: { flex: 1, gap: 7, paddingRight: 10 },
  rowTitleLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowCount: { fontSize: 11, fontWeight: '700' },
  rowDetail: { fontSize: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,7,17,0.82)', justifyContent: 'flex-end' },
  bookModal: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 11 },
  modalKicker: { fontSize: 10, fontWeight: '700', letterSpacing: 1.3, marginBottom: 5 },
  modalTitle: { fontSize: 24, fontWeight: '700' },
  closeButton: { width: 44, height: 44, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalNote: { fontSize: 12, lineHeight: 17, marginBottom: 16 },
  modalProgressCard: { borderRadius: 14, padding: 13, marginBottom: 12 },
  modalProgressLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  modalProgressCount: { fontSize: 10, fontWeight: '700' },
  wordsTitle: { fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 10 },
  wordComposer: { flexDirection: 'row', gap: 8, marginBottom: 11 },
  wordInput: { flex: 1, minHeight: 45, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 13 },
  addWordButton: { width: 45, height: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  wordList: { maxHeight: 150 },
  wordChip: { minHeight: 37, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  wordText: { fontSize: 12 },
  emptyWords: { fontSize: 12, lineHeight: 17, paddingVertical: 8 },
});