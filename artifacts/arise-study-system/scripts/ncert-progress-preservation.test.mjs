import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../contexts/ncertProgress.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports, Math, Map, Object, Set, Number });
const { prepareNcertProgressState, summarizeNcertProgress } = exports;

const defaults = [
  { id: 'class-1', classLabel: 'CLASS 01', bookCount: 5, completed: 2, sessions: 4, vocabulary: 12 },
  { id: 'class-2', classLabel: 'CLASS 02', bookCount: 5, completed: 2, sessions: 3, vocabulary: 9 },
];

const savedBook = (overrides = {}) => ({
  id: 'saved-book',
  classId: 'class-2',
  classLabel: 'CLASS 02',
  title: 'Saved book title',
  totalSessions: 4,
  completedSessions: 1,
  vocabulary: ['actual word'],
  ...overrides,
});

const hydrate = (shelves, books, version, ledger) =>
  prepareNcertProgressState(shelves, books, version, ledger, defaults);

const shelfProgress = (shelf) => ({
  completed: shelf.completed,
  sessions: shelf.sessions,
  vocabulary: shelf.vocabulary,
});

test('provider hydration respects explicit empty NCERT catalogs without restoring defaults', () => {
  const state = hydrate([], [], 1);
  assert.deepEqual(JSON.parse(JSON.stringify(state.shelves)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(state.books)), []);
  assert.equal(state.shelves.reduce((sum, shelf) => sum + shelf.bookCount, 0), 0);
  assert.equal(state.shelves.reduce((sum, shelf) => sum + shelf.completed, 0), 0);
});

test('provider hydration preserves partial custom shelves without unrelated catalog entries', () => {
  const customShelf = {
    id: 'class-2',
    classLabel: 'CUSTOM CLASS 02',
    bookCount: 17,
    completed: 3,
    sessions: 7,
    vocabulary: 11,
    customShelfData: { source: 'saved' },
  };
  const state = hydrate([customShelf], [savedBook()], 1);
  const shelves = JSON.parse(JSON.stringify(state.shelves));

  assert.equal(shelves.length, 1);
  assert.equal(shelves[0].id, 'class-2');
  assert.equal(shelves[0].bookCount, 17);
  assert.deepEqual(shelves[0].customShelfData, { source: 'saved' });
  assert.deepEqual(shelfProgress(shelves[0]), { completed: 3, sessions: 7, vocabulary: 11 });
  assert.equal(JSON.stringify(state.books), JSON.stringify([savedBook()]));
});

test('orphan current-catalog books initialize shelf progress from their actual records', () => {
  const completed = savedBook({
    id: 'orphan-book',
    classId: 'orphan-class',
    classLabel: 'ORPHAN CLASS',
    totalSessions: 4,
    completedSessions: 4,
    vocabulary: ['real word'],
  });
  const state = hydrate(undefined, [completed], 1);
  const shelves = JSON.parse(JSON.stringify(state.shelves));

  assert.equal(shelves.length, 1);
  assert.equal(shelves[0].id, 'orphan-class');
  assert.deepEqual(shelfProgress(shelves[0]), { completed: 1, sessions: 4, vocabulary: 1 });
});

test('legacy partial shelf-only aggregates remain visible without fabricated words', () => {
  const legacyShelf = {
    id: 'class-2',
    classLabel: 'CLASS 02',
    bookCount: 5,
    completed: 2,
    sessions: 3,
    vocabulary: 9,
    legacyShelfNote: 'preserved',
  };
  const state = hydrate([legacyShelf], undefined, undefined);

  assert.equal(state.shelves.length, 1);
  assert.deepEqual(shelfProgress(state.shelves[0]), { completed: 2, sessions: 3, vocabulary: 9 });
  assert.equal(state.shelves[0].legacyShelfNote, 'preserved');
  assert.equal(state.books.length, 5);
  assert.equal(state.books.filter((book) => book.completedSessions >= book.totalSessions).length, 2);
  assert.equal(state.books.reduce((sum, book) => sum + book.vocabulary.length, 0), 0);

  const nextBook = state.books.find((book) => book.completedSessions < book.totalSessions);
  const afterSession = state.books.map((book) => book.id === nextBook.id
    ? { ...book, completedSessions: book.completedSessions + 1 }
    : book);
  const updated = summarizeNcertProgress(afterSession, state.shelves, state.ledger);
  assert.deepEqual(shelfProgress(updated.shelves[0]), { completed: 2, sessions: 4, vocabulary: 9 });
});

test('missing books retain earned progress while new activity and hydration stay idempotent', () => {
  const shelf = { id: 'class-2', classLabel: 'CLASS 02', bookCount: 5, completed: 0, sessions: 0, vocabulary: 0 };
  const initialBook = savedBook({
    id: 'book-a',
    completedSessions: 0,
    vocabulary: [],
  });
  const initial = hydrate([shelf], [initialBook], 1);
  const firstActivityBooks = [{
    ...initialBook,
    completedSessions: 1,
    vocabulary: ['first real word'],
  }];
  const firstActivity = summarizeNcertProgress(firstActivityBooks, initial.shelves, initial.ledger);
  assert.deepEqual(shelfProgress(firstActivity.shelves[0]), { completed: 0, sessions: 1, vocabulary: 1 });

  const dropped = summarizeNcertProgress([], firstActivity.shelves, firstActivity.ledger);
  assert.deepEqual(shelfProgress(dropped.shelves[0]), { completed: 0, sessions: 1, vocabulary: 1 });

  const reappeared = summarizeNcertProgress(firstActivityBooks, dropped.shelves, dropped.ledger);
  assert.deepEqual(shelfProgress(reappeared.shelves[0]), { completed: 0, sessions: 1, vocabulary: 1 });

  const laterActivityBooks = [
    { ...firstActivityBooks[0], completedSessions: 2, vocabulary: ['first real word', 'second real word'] },
    savedBook({ id: 'book-b', completedSessions: 1, vocabulary: ['third real word'] }),
  ];
  const laterActivity = summarizeNcertProgress(laterActivityBooks, reappeared.shelves, reappeared.ledger);
  assert.deepEqual(shelfProgress(laterActivity.shelves[0]), { completed: 0, sessions: 3, vocabulary: 3 });

  const reloaded = hydrate(laterActivity.shelves, laterActivityBooks, 1, laterActivity.ledger);
  assert.deepEqual(shelfProgress(reloaded.shelves[0]), { completed: 0, sessions: 3, vocabulary: 3 });
  assert.equal(JSON.stringify(reloaded.books), JSON.stringify(laterActivityBooks));
});

test('catalog defaults are used only when legacy NCERT shelf fields are absent', () => {
  const legacyState = hydrate(undefined, undefined, undefined);
  assert.equal(legacyState.shelves.length, defaults.length);
  assert.equal(legacyState.shelves[0].completed, defaults[0].completed);
  assert.equal(legacyState.shelves[0].bookCount, defaults[0].bookCount);

  const currentCatalogWithMissingArrays = hydrate(undefined, undefined, 1);
  assert.equal(currentCatalogWithMissingArrays.shelves.length, 0);
  assert.equal(currentCatalogWithMissingArrays.books.length, 0);
});