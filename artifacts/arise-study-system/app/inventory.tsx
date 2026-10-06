import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { arise } from '@/constants/colors';
import { HudFrame, WorldArtwork } from '@/components/VisualWorld';
import ScreenShell from '@/components/ScreenShell';
import { ItemIcon, RARITY_COLOR } from '@/components/rpg/rpgArt';
import { Chip, HudButton, RpgErrorBanner, goTo } from '@/components/rpg/RpgBits';
import { useStudy } from '@/contexts/StudyContext';
import { ITEM_DEFINITIONS, getItemDefinition } from '@/contexts/rpgCatalog';
import { getItemUseAvailability } from '@/contexts/rpgSystem';
import type { ItemCategory, ItemDefinition } from '@/contexts/rpgTypes';

const CATS: ItemCategory[] = ['keys', 'potions', 'revision', 'quest-items', 'relic-fragments', 'xp-items', 'special-rewards'];
const label = (c: string) => c.replace('-', ' ').toUpperCase();

export default function InventoryScreen() {
  const { rpg, useInventoryItem } = useStudy();
  const [cat, setCat] = useState<ItemCategory | 'all'>('all');
  const [showCatalog, setShowCatalog] = useState(false);
  const [sel, setSel] = useState<ItemDefinition | null>(null);
  const owned = useMemo(() => Object.values(rpg.inventory).filter((e) => e.quantity > 0).map((e) => ({ def: getItemDefinition(e.itemId), qty: e.quantity })).filter((x): x is { def: ItemDefinition; qty: number } => !!x.def), [rpg.inventory]);
  const equippedIds = new Set(Object.values(rpg.loadout).filter(Boolean) as string[]);
  const totalQty = owned.reduce((n, o) => n + o.qty, 0);
  const ownedIds = new Set(owned.map((o) => o.def.id));
  const list = owned.filter((o) => cat === 'all' || o.def.category === cat);
  const locked = ITEM_DEFINITIONS.filter((d) => !ownedIds.has(d.id) && (cat === 'all' || d.category === cat));
  const selQty = sel ? rpg.inventory[sel.id]?.quantity ?? 0 : 0;
  const avail = sel && selQty > 0 && sel.usable ? getItemUseAvailability(rpg, sel.id, new Date().toISOString()) : null;
  const history = sel ? rpg.acquisitions.filter((a) => a.itemId === sel.id).slice().reverse() : [];

  const tile = (def: ItemDefinition, qty: number, dim: boolean) => {
    const rc = dim ? arise.rail : RARITY_COLOR[def.rarity];
    const eq = equippedIds.has(def.id);
    return (
      <Pressable key={def.id} testID={`item-card-${def.id}`} accessibilityRole="button" accessibilityLabel={`${def.name}${dim ? ', not owned' : `, quantity ${qty}`}${eq ? ', equipped' : ''}`} onPress={() => setSel(def)}
        style={[s.tile, { borderColor: rc, opacity: dim ? 0.62 : 1, shadowColor: rc, shadowOpacity: dim ? 0 : 0.55, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: dim ? 0 : 4 }]}>
        <View style={[s.topBar, { backgroundColor: rc }]} />
        <View style={[s.corner, s.cTL, { borderColor: rc }]} /><View style={[s.corner, s.cBR, { borderColor: rc }]} />
        <View style={[s.well, { backgroundColor: dim ? 'rgba(4,10,21,0.7)' : `${rc}22`, borderColor: `${rc}55` }]}>
          <ItemIcon id={def.id} category={def.category} rarity={def.rarity} size={58} dim={dim} />
        </View>
        <Text numberOfLines={2} style={[s.tName, { color: dim ? arise.inkDim : arise.ink }]}>{def.name}</Text>
        <Text style={[s.rar, { color: dim ? arise.lockedTone : rc }]}>{def.rarity.toUpperCase()}</Text>
        {!dim ? <View style={[s.qty, { borderColor: rc }]}><Text style={s.qtyT}>x{qty}</Text></View> : null}
        {eq ? <View style={s.eq}><Text style={s.eqT}>EQUIPPED</Text></View> : null}
      </Pressable>
    );
  };

  return (
    <ScreenShell kicker="ARISE · ARMORY" title="Inventory">
      <RpgErrorBanner />
      <View testID="inventory-hero" style={s.hero}>
        <WorldArtwork scene="vault" opacity={0.95} />
        <HudFrame accent={arise.gold} style={{ margin: 0 }}>
          <View style={s.heroIn}>
            <Text style={s.heroK}>RELIC VAULT</Text>
            <Text style={s.heroT}>{owned.length} of {ITEM_DEFINITIONS.length} item types held</Text>
            <Text style={s.heroM}>{totalQty} total units · {equippedIds.size} of 6 slots equipped</Text>
          </View>
        </HudFrame>
      </View>
      <View style={s.chips}>
        <Chip testID="inv-filter-all" label="ALL" active={cat === 'all'} onPress={() => setCat('all')} />
        {CATS.map((c) => <Chip key={c} testID={`inv-filter-${c}`} label={label(c)} active={cat === c} onPress={() => setCat(c)} color={arise.gold} />)}
      </View>
      {list.length === 0 ? (
        <HudFrame accent={arise.gold} style={{ marginBottom: 14 }}><View style={{ alignItems: 'center', gap: 8, padding: 14 }}>
          <ItemIcon id="empty" category="special-rewards" rarity="common" size={72} dim />
          <Text style={s.tName}>{owned.length ? 'Nothing owned in this category' : 'Vault empty'}</Text>
          <Text style={s.meta}>Clear Gates to earn items. Silhouettes below show the known catalog.</Text>
          <HudButton testID="inv-to-gates" label="OPEN GATES" icon="zap" onPress={() => goTo('/gates')} />
        </View></HudFrame>
      ) : <View style={s.grid}>{list.map((o) => tile(o.def, o.qty, false))}</View>}
      <View style={{ marginVertical: 14 }}>
        <HudButton testID="inv-toggle-catalog" label={showCatalog ? 'HIDE KNOWN CATALOG' : 'SHOW KNOWN CATALOG'} icon="eye" color={arise.violet} onPress={() => setShowCatalog((v) => !v)} />
      </View>
      {showCatalog || list.length === 0 ? <View style={s.grid}>{locked.map((d) => tile(d, 0, true))}</View> : null}
      {sel ? (
        <Modal visible transparent animationType="slide" onRequestClose={() => setSel(null)}>
          <View style={s.mBack}>
            <View style={[s.sheet, { borderColor: RARITY_COLOR[sel.rarity] }]}>
              <WorldArtwork scene="vault" opacity={0.5} />
              <View style={[s.halo, { backgroundColor: RARITY_COLOR[sel.rarity] }]} />
              <View style={{ alignItems: 'center' }}><ItemIcon id={sel.id} category={sel.category} rarity={sel.rarity} size={104} dim={selQty === 0} /></View>
              <Text style={[s.rar, { color: RARITY_COLOR[sel.rarity], textAlign: 'center' }]}>{sel.rarity.toUpperCase()} · {label(sel.category)}</Text>
              <Text style={[s.tName, { fontSize: 20, textAlign: 'center' }]}>{sel.name}</Text>
              <Text style={[s.meta, { textAlign: 'center' }]}>{sel.description}</Text>
              {sel.effectLabel ? <Text style={[s.meta, { color: arise.cyan, textAlign: 'center' }]}>{sel.effectLabel}</Text> : null}
              <Text style={[s.meta, { textAlign: 'center' }]}>{selQty > 0 ? `Owned: ${selQty}` : 'Not owned'}{equippedIds.has(sel.id) ? ' · Equipped' : ''}</Text>
              {history.length ? history.slice(0, 4).map((a) => <Text key={a.id} style={s.meta}>+{a.quantity} · {a.source} · {new Date(a.timestamp).toLocaleDateString()}</Text>) : <Text style={s.meta}>No acquisition history.</Text>}
              {sel.usable ? (
                <>
                  <HudButton testID={`inventory-use-${sel.id}`} label="USE ITEM" icon="zap" solid disabled={!avail?.usable} onPress={() => useInventoryItem(sel.id)} />
                  {selQty === 0 ? <Text style={s.meta}>Not owned.</Text> : avail && !avail.usable ? <Text style={[s.meta, { color: arise.danger }]}>{avail.reason}</Text> : null}
                </>
              ) : null}
              {sel.equipmentSlot ? <HudButton testID={`inventory-equip-${sel.id}`} label="OPEN LOADOUT" icon="shield" color={arise.violet} disabled={selQty === 0} onPress={() => { setSel(null); goTo(`/loadout?item=${sel.id}`); }} /> : null}
              <RpgErrorBanner />
              <HudButton testID="inventory-close" label="CLOSE" color={arise.inkSoft} onPress={() => setSel(null)} />
            </View>
          </View>
        </Modal>
      ) : null}
    </ScreenShell>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '31%', flexGrow: 1, minWidth: 96, minHeight: 156, borderWidth: 1, borderRadius: 3, backgroundColor: '#0A0F18', alignItems: 'center', padding: 8, paddingTop: 12, gap: 3, overflow: 'visible' },
  topBar: { position: 'absolute', top: 0, left: 10, right: 10, height: 3 },
  corner: { position: 'absolute', width: 10, height: 10 },
  cTL: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 },
  cBR: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 },
  well: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', borderWidth: 1, transform: [{ rotate: '0deg' }] },
  eq: { position: 'absolute', bottom: 4, backgroundColor: arise.gold, paddingHorizontal: 6, paddingVertical: 1 },
  eqT: { color: '#1A1205', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  hero: { marginBottom: 14, minHeight: 120, justifyContent: 'center', overflow: 'hidden' },
  heroIn: { padding: 16, gap: 4 },
  heroK: { color: arise.gold, fontSize: 10, fontWeight: '800', letterSpacing: 3 },
  heroT: { color: arise.ink, fontSize: 20, fontWeight: '800' },
  heroM: { color: arise.inkSoft, fontSize: 12 },
  halo: { position: 'absolute', top: -60, alignSelf: 'center', width: 200, height: 200, borderRadius: 100, opacity: 0.14 },
  tName: { color: arise.ink, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  rar: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  qty: { position: 'absolute', top: 6, right: 6, backgroundColor: arise.abyss, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
  qtyT: { color: arise.ink, fontSize: 11, fontWeight: '800' },
  meta: { color: arise.inkSoft, fontSize: 12, lineHeight: 17 },
  mBack: { flex: 1, backgroundColor: 'rgba(3,8,18,0.8)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', overflow: 'hidden', backgroundColor: arise.deep, borderTopWidth: 1, borderTopLeftRadius: 4, borderTopRightRadius: 4, padding: 18, gap: 8 },
});
