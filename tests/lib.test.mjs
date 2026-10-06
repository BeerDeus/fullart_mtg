import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSets, filterSets, globalStats, setStats, landRank, natCompare, cardBadges, cardmarketUrl, worstCondition, bestPrice, missingCost, formatPrice, ownedToCsv, keepCard, DEFAULT_FILTERS,
} from '../src/lib.js'

const mk = (id, n, s, c, extra = {}) => ({
  id, n, s, c, a: 'Artist', i: 'x', l: 'y', f: ['nonfoil', 'foil'], p: [], t: 'Basic Land — ' + n, r: '2020-01-01', ...extra,
})

const cards = [
  mk('1', 'Forest', 'bfz', '272'), mk('2', 'Forest', 'bfz', '272a'), mk('3', 'Plains', 'bfz', '250'),
  mk('4', 'Plains', 'bfz', '250a'), mk('5', 'Snow-Covered Island', 'khm', '300', { f: ['foil'] }),
  mk('6', 'Island', 'znr', '270'), mk('7', 'Wastes', 'ogw', '184'),
  mk('8', 'Sunken Hollow', 'znr', '280', { t: 'Land' }),
]
const meta = {
  bfz: { name: 'Battle for Zendikar', icon: 'u', date: '2015-10-02', type: 'expansion' },
  khm: { name: 'Kaldheim', icon: 'u', date: '2021-02-05', type: 'expansion' },
  znr: { name: 'Zendikar Rising', icon: 'u', date: '2020-09-25', type: 'expansion' },
  ogw: { name: 'Oath of the Gatewatch', icon: 'u', date: '2016-01-22', type: 'expansion' },
}

test('ordre des terrains et numéros', () => {
  assert.ok(landRank('Plains') < landRank('Forest'))
  assert.ok(landRank('Forest') < landRank('Wastes'))
  assert.ok(landRank('Wastes') < landRank('Snow-Covered Plains'))
  assert.equal(landRank('Sunken Hollow'), 1000)
  assert.ok(natCompare('9', '10') < 0)
  assert.ok(natCompare('250', '250a') < 0)
})

test('buildSets : regroupe par extension et trie les variantes', () => {
  const sets = buildSets(cards, meta)
  assert.equal(sets.length, 4)
  const bfz = sets.find((s) => s.code === 'bfz')
  assert.deepEqual(bfz.cards.map((c) => c.c), ['250', '250a', '272', '272a'])
  assert.equal(bfz.name, 'Battle for Zendikar')
  const znr = sets.find((s) => s.code === 'znr')
  assert.deepEqual(znr.cards.map((c) => c.n), ['Island', 'Sunken Hollow'])
})

test('stats et filtres', () => {
  const sets = buildSets(cards, meta)
  const owned = { 1: true, 2: true, 3: true, 4: true, 6: true }
  assert.deepEqual(setStats(sets.find((s) => s.code === 'bfz'), owned), { owned: 4, total: 4 })
  const g = globalStats(sets, owned)
  assert.equal(g.have, 5)
  assert.equal(g.total, 8)
  assert.equal(g.complete, 1)
  assert.equal(g.started, 2)

  const f = (o) => filterSets(sets, owned, { bfz: '12' }, { ...DEFAULT_FILTERS, ...o })
  assert.deepEqual(f({ status: 'complete' }).map((v) => v.set.code), ['bfz'])
  assert.deepEqual(f({ status: 'partial' }).map((v) => v.set.code), ['znr'])
  assert.deepEqual(f({ status: 'none' }).map((v) => v.set.code).sort(), ['khm', 'ogw'])
  assert.deepEqual(f({ status: 'nopage' }).map((v) => v.set.code), ['znr'])
  assert.deepEqual(f({ land: 'snow' }).map((v) => v.set.code), ['khm'])
  assert.deepEqual(f({ land: 'Forest' })[0].cards.map((c) => c.id), ['1', '2'])
  assert.deepEqual(f({ missingOnly: true }).map((v) => v.set.code).sort(), ['khm', 'ogw', 'znr'])
  assert.deepEqual(f({ q: 'kald' }).map((v) => v.set.code), ['khm'])
  assert.deepEqual(f({ q: 'hollow' }).map((v) => v.cards.length), [1])
})

test('tris', () => {
  const sets = buildSets(cards, meta)
  const order = (sort, pages = {}) => filterSets(sets, {}, pages, { ...DEFAULT_FILTERS, sort }).map((v) => v.set.code)
  assert.deepEqual(order('recent'), ['khm', 'znr', 'ogw', 'bfz'])
  assert.deepEqual(order('old'), ['bfz', 'ogw', 'znr', 'khm'])
  assert.deepEqual(order('name'), ['bfz', 'khm', 'ogw', 'znr'])
  assert.deepEqual(order('page', { znr: '2', bfz: '10' }), ['znr', 'bfz', 'khm', 'ogw'])
})

test('keepCard : basiques uniquement, sans foil only', () => {
  assert.equal(keepCard(cards[0]), true) // Forest nonfoil+foil
  assert.equal(keepCard(cards[4]), false) // Snow-Covered Island foil only
  assert.equal(keepCard(cards[7]), false) // Sunken Hollow, non-basique
  assert.equal(keepCard(mk('e', 'Plains', 'x', '1', { f: ['etched'] })), false) // etched only
  assert.equal(keepCard(mk('n', 'Plains', 'x', '2', { f: [] })), true) // finishes absent : on garde
  assert.deepEqual(buildSets(cards.filter(keepCard), meta).map((s) => s.code).sort(), ['bfz', 'ogw', 'znr'])
})

test('badges et CSV', () => {
  assert.deepEqual(cardBadges(mk('x', 'Forest', 'sld', '1', { p: ['prerelease', 'datestamped'] })), ['Prerelease', 'Datestamped'])
  const sets = buildSets(cards, meta)
  const csv = ownedToCsv(sets, { 1: true }, { bfz: '3' })
  assert.match(csv, /"BFZ";"Battle for Zendikar";"272";"Forest";"Artist";"3"/)
})

test('lien Cardmarket : idProduct sinon recherche « CODE numéro »', () => {
  const set = { code: 'fra' }
  assert.equal(cardmarketUrl(mk('a', 'Island', 'fra', '386', { m: 812345 }), set), 'https://www.cardmarket.com/fr/Magic/Products?idProduct=812345')
  assert.equal(cardmarketUrl(mk('b', 'Island', 'fra', '386'), set), 'https://www.cardmarket.com/fr/Magic/Products/Search?searchString=FRA+386')
})

test('CardTrader : état min selon l\'âge, meilleur prix, total manquantes', () => {
  const now = Date.parse('2026-10-01')
  assert.equal(worstCondition('2025-06-01', now), 'Near Mint')
  assert.equal(worstCondition('2020-01-01', now), 'Slightly Played')
  assert.equal(worstCondition('2009-10-02', now), 'Moderately Played')
  const entry = { b: 1, p: { 'Near Mint': 300, 'Slightly Played': 150, 'Moderately Played': 90, Played: 20 } }
  assert.deepEqual(bestPrice(entry, '2025-06-01', now), { cents: 300, condition: 'Near Mint' })
  assert.deepEqual(bestPrice(entry, '2020-01-01', now), { cents: 150, condition: 'Slightly Played' })
  assert.deepEqual(bestPrice(entry, '2009-10-02', now), { cents: 90, condition: 'Moderately Played' })
  assert.deepEqual(bestPrice({ p: { Mint: 250, 'Near Mint': 300 } }, '2025-06-01', now), { cents: 250, condition: 'Mint' })
  assert.equal(bestPrice({ p: { Played: 20 } }, '2025-06-01', now), null)
  assert.equal(bestPrice(undefined, '2025-06-01', now), null)
  const set = { date: '2025-06-01', cards: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }
  const prices = { a: { p: { 'Near Mint': 120 } }, b: { p: { 'Near Mint': 80 } }, c: { p: { Played: 5 } } }
  assert.deepEqual(missingCost(set, { a: true }, prices, now), { cents: 80, priced: 1, noOffer: 1 })
  assert.equal(formatPrice(1240).replace(/\s/g, ' '), '12,40 €')
})
