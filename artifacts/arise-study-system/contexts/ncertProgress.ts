export type NcertProgressTotals = {
  completed: number;
  sessions: number;
  vocabulary: number;
};

export type NcertProgressLedgerEntry = {
  aggregate: NcertProgressTotals;
  bookBaseline: NcertProgressTotals;
  observedBooks?: Record<string, NcertProgressTotals>;
};

export type NcertProgressLedger = {
  version: 1;
  byShelf: Record<string, NcertProgressLedgerEntry>;
  [key: string]: unknown;
};

export type NcertProgressBook = {
  id: string;
  classId: string;
  classLabel: string;
  title: string;
  totalSessions: number;
  completedSessions: number;
  vocabulary: string[];
};

export type NcertProgressShelf = {
  id: string;
  classLabel: string;
  bookCount: number;
  completed: number;
  sessions: number;
  vocabulary: number;
};

const zeroTotals = (): NcertProgressTotals => ({ completed: 0, sessions: 0, vocabulary: 0 });

const totalsForBook = (book: NcertProgressBook): NcertProgressTotals => ({
  completed: book.completedSessions >= book.totalSessions ? 1 : 0,
  sessions: book.completedSessions,
  vocabulary: book.vocabulary.length,
});

const totalsForBooks = (books: NcertProgressBook[]): NcertProgressTotals =>
  books.reduce((sum, book) => {
    const totals = totalsForBook(book);
    return {
      completed: sum.completed + totals.completed,
      sessions: sum.sessions + totals.sessions,
      vocabulary: sum.vocabulary + totals.vocabulary,
    };
  }, zeroTotals());

const shelfTotals = (shelf: NcertProgressShelf): NcertProgressTotals => ({
  completed: shelf.completed,
  sessions: shelf.sessions,
  vocabulary: shelf.vocabulary,
});

const validTotals = (value: NcertProgressTotals | undefined): value is NcertProgressTotals =>
  !!value
  && Number.isFinite(value.completed)
  && Number.isFinite(value.sessions)
  && Number.isFinite(value.vocabulary);

const validObservedBooks = (value: Record<string, NcertProgressTotals> | undefined) =>
  !!value
  && typeof value === 'object'
  && Object.values(value).every(validTotals);

const validLedgerEntry = (value: NcertProgressLedgerEntry | undefined): value is NcertProgressLedgerEntry =>
  !!value && validTotals(value.aggregate) && validTotals(value.bookBaseline);

const positiveDelta = (current: number, observed: number) => Math.max(0, current - observed);
const greaterTotals = (current: NcertProgressTotals, observed: NcertProgressTotals): NcertProgressTotals => ({
  completed: Math.max(current.completed, observed.completed),
  sessions: Math.max(current.sessions, observed.sessions),
  vocabulary: Math.max(current.vocabulary, observed.vocabulary),
});

const booksByShelf = <B extends NcertProgressBook>(books: B[]) => {
  const result = new Map<string, B[]>();
  for (const book of books) {
    const classBooks = result.get(book.classId) ?? [];
    classBooks.push(book);
    result.set(book.classId, classBooks);
  }
  return result;
};

/**
 * Build real book records from the legacy shelf catalog without inventing
 * vocabulary entries. Shelf aggregates are preserved separately by the
 * progress ledger when those records are summarized.
 */
export const createNcertBooksFromShelves = <S extends NcertProgressShelf>(shelves: S[]): NcertProgressBook[] =>
  shelves.flatMap((shelf) =>
    Array.from({ length: shelf.bookCount }, (_, index) => ({
      id: `${shelf.id}-book-${String(index + 1).padStart(2, '0')}`,
      classId: shelf.id,
      classLabel: shelf.classLabel,
      title: `NCERT BOOK ${String(index + 1).padStart(2, '0')}`,
      totalSessions: 4,
      completedSessions: index < shelf.completed ? 4 : 0,
      vocabulary: [],
    })),
  );

/**
 * Reconcile current book records against per-book high-water observations.
 * Missing records keep their already-earned progress in the aggregate, and
 * reappearing records cannot award their old counts a second time.
 */
export const summarizeNcertProgress = <
  S extends NcertProgressShelf,
  B extends NcertProgressBook,
>(
  books: B[],
  shelves: S[],
  savedLedger?: NcertProgressLedger,
  aggregateShelfIds: ReadonlySet<string> = new Set(shelves.map((shelf) => shelf.id)),
): { shelves: S[]; ledger: NcertProgressLedger } => {
  const groupedBooks = booksByShelf(books);
  const byShelf = { ...(savedLedger?.byShelf ?? {}) };
  const summarizedShelves = shelves.map((shelf) => {
    const classBooks = groupedBooks.get(shelf.id) ?? [];
    const currentTotals = totalsForBooks(classBooks);
    const previous = byShelf[shelf.id];
    let entry: NcertProgressLedgerEntry;

    if (validLedgerEntry(previous) && validObservedBooks(previous.observedBooks)) {
      const observedBooks = { ...previous.observedBooks };
      let completedDelta = 0;
      let sessionsDelta = 0;
      let vocabularyDelta = 0;
      for (const book of classBooks) {
        const currentBookTotals = totalsForBook(book);
        const observed = observedBooks[book.id] ?? zeroTotals();
        completedDelta += positiveDelta(currentBookTotals.completed, observed.completed);
        sessionsDelta += positiveDelta(currentBookTotals.sessions, observed.sessions);
        vocabularyDelta += positiveDelta(currentBookTotals.vocabulary, observed.vocabulary);
        observedBooks[book.id] = greaterTotals(currentBookTotals, observed);
      }
      entry = {
        ...previous,
        aggregate: {
          completed: previous.aggregate.completed + completedDelta,
          sessions: previous.aggregate.sessions + sessionsDelta,
          vocabulary: previous.aggregate.vocabulary + vocabularyDelta,
        },
        observedBooks,
      };
    } else if (validLedgerEntry(previous)) {
      // Migrate the initial fixed-baseline ledger without replaying progress
      // already reflected in the shelf saved by that version.
      entry = {
        ...previous,
        aggregate: aggregateShelfIds.has(shelf.id) ? shelfTotals(shelf) : currentTotals,
        observedBooks: Object.fromEntries(classBooks.map((book) => [book.id, totalsForBook(book)])),
      };
    } else {
      entry = {
        aggregate: aggregateShelfIds.has(shelf.id) ? shelfTotals(shelf) : currentTotals,
        bookBaseline: currentTotals,
        observedBooks: Object.fromEntries(classBooks.map((book) => [book.id, totalsForBook(book)])),
      };
    }

    byShelf[shelf.id] = entry;
    return {
      ...shelf,
      completed: entry.aggregate.completed,
      sessions: entry.aggregate.sessions,
      vocabulary: entry.aggregate.vocabulary,
    };
  });

  return {
    shelves: summarizedShelves,
    ledger: { ...savedLedger, version: 1, byShelf },
  };
};

export const prepareNcertProgressState = <
  S extends NcertProgressShelf,
  B extends NcertProgressBook,
>(
  savedShelves: S[] | undefined,
  savedBooks: B[] | undefined,
  catalogVersion: number | undefined,
  savedLedger: NcertProgressLedger | undefined,
  defaultShelves: S[],
): {
  shelves: Array<S | NcertProgressShelf>;
  books: Array<B | NcertProgressBook>;
  ledger: NcertProgressLedger;
} => {
  const hasCurrentCatalog = catalogVersion === 1 && savedBooks != null;
  const legacyDefaultShelves = catalogVersion === 1 ? [] : defaultShelves;
  const books = hasCurrentCatalog
    ? savedBooks
    : createNcertBooksFromShelves(savedShelves ?? legacyDefaultShelves);
  const sourceShelves = savedShelves ?? legacyDefaultShelves;
  const shelves: Array<S | NcertProgressShelf> = [...sourceShelves];
  const sourceShelfIds = new Set(sourceShelves.map((shelf) => shelf.id));
  const shelfIds = new Set(sourceShelfIds);
  const groupedBooks = booksByShelf(books);
  for (const book of books) {
    if (shelfIds.has(book.classId)) continue;
    shelfIds.add(book.classId);
    const classBooks = groupedBooks.get(book.classId) ?? [];
    const totals = totalsForBooks(classBooks);
    shelves.push({
      id: book.classId,
      classLabel: book.classLabel,
      bookCount: classBooks.length,
      ...totals,
    });
  }

  const progress = summarizeNcertProgress(
    books,
    shelves,
    savedLedger,
    sourceShelfIds,
  );
  return { ...progress, books };
};