import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const React = require('react');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { act, create } = require('react-test-renderer');

function load(path, mocks = {}) {
  const src = readFileSync(new URL(path, import.meta.url), 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const exports = {};
  vm.runInNewContext(out, { exports, React, Math, Platform: {}, require: (id) => { if (Object.hasOwn(mocks, id)) return mocks[id]; throw new Error(`Unexpected import ${id}`); } });
  return exports;
}

const rankSystem = load('../contexts/rankSystem.ts');
const el = (name) => (props) => React.createElement(name, props, props.children);
const svg = { __esModule: true, default: el('Svg'), Circle: el('Circle'), Defs: el('Defs'), Ellipse: el('Ellipse'), G: el('G'), LinearGradient: el('LG'), Path: el('Path'), Polygon: el('Polygon'), Stop: el('Stop') };
const art = load('../components/AriseArt.tsx', {
  'expo-linear-gradient': { LinearGradient: el('LG2') },
  'expo-router': { router: {} },
  react: React,
  'react-native': { Platform: { OS: 'ios' }, StyleSheet: { create: (s) => s, absoluteFill: {} }, View: el('View') },
  'react-native-reanimated': { __esModule: true, default: { View: el('AV') }, cancelAnimation() {}, Easing: { linear: 1 }, useAnimatedStyle: () => ({}), useSharedValue: (v) => ({ value: v }), withDelay: (_, v) => v, withRepeat: (v) => v, withTiming: (v) => v },
  'react-native-svg': svg,
  '@/constants/colors': { arise: new Proxy({}, { get: () => '#000' }) },
  '@/contexts/rankSystem': rankSystem,
  '@/contexts/masterProgress': {},
  '@/components/VisualWorld': { HudFrame: el('HudFrame') },
});

const render = async (rank) => {
  let r;
  await act(async () => { r = create(React.createElement(art.RankCrown, { rank, size: 50 })); });
  const root = r.root.findByType('Svg');
  return {
    variant: root.props.testID,
    halos: r.root.findAll((n) => n.type === 'Ellipse').length,
    // Instance-local paint IDs prevent SVG collisions; they are not artwork geometry.
    geometry: JSON.stringify(r.toJSON())
      .replace(/"id":"[^"]*"/g, '"id":"gradient"')
      .replace(/url\(#[^)]*\)/g, 'url(#gradient)'),
  };
};

test('SS, SSS and Hidden crowns use distinct variants and geometry', async () => {
  const ss = await render('SS-RANK'), sss = await render('SSS-RANK'), hid = await render('Hidden/Transcendent');
  assert.equal(ss.variant, 'rank-crown-double-halo-crown');
  assert.equal(sss.variant, 'rank-crown-triple-halo-crown');
  assert.equal(hid.variant, 'rank-crown-void-crown');
  assert.equal(ss.halos, 2);
  assert.equal(sss.halos, 3);
  assert.equal(hid.halos, 0);
  assert.equal(new Set([ss.geometry, sss.geometry, hid.geometry]).size, 3);
});

test('every definition renders a distinct crown; malformed falls back to E', async () => {
  const geos = [];
  for (const d of rankSystem.RANK_DEFINITIONS) geos.push(await render(d.displayName));
  assert.equal(new Set(geos.map((g) => g.geometry)).size, rankSystem.RANK_DEFINITIONS.length);
  assert.equal((await render('E-RANK')).variant, 'rank-crown-iron-crown');
  assert.equal((await render('garbage')).geometry, (await render('E-RANK')).geometry);
  assert.equal((await render('SS-RANK')).variant === (await render('S-RANK')).variant, false);
});
