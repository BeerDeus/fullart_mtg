// Logique pure (tri, regroupement, filtres, stats) — testée dans tests/lib.test.mjs

export const BASE_LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']
const SNOW = 'Snow-Covered '

export const isBasic = (c) => /\bBasic\b/.test(c.t)
export const isSnow = (c) => c.n.startsWith(SNOW)
// Terrains de base uniquement, et pas les impressions foil only (existent aussi en non-foil, ou sont de simples doublons foil)
export const keepCard = (c) => isBasic(c) && (c.f.length === 0 || c.f.includes('nonfoil'))

export function landRank(name) {
  const snow = name.startsWith(SNOW)
  const i = BASE_LANDS.indexOf(snow ? name.slice(SNOW.length) : name)
  if (i === -1) return 1000
  return snow ? 100 + i : i
}

export function natCompare(a, b) {
  const pa = parseInt(a, 10)
  const pb = parseInt(b, 10)
  if (!Number.isNaN(pa) && !Number.isNaN(pb) && pa !== pb) return pa - pb
  return String(a).localeCompare(String(b), 'en', { numeric: true })
}

export function compareCards(x, y) {
  const d = landRank(x.n) - landRank(y.n)
  if (d) return d
  if (landRank(x.n) === 1000) {
    const byName = x.n.localeCompare(y.n)
    if (byName) return byName
  }
  return natCompare(x.c, y.c)
}

export function buildSets(cards, setsMeta) {
  const map = new Map()
  for (const c of cards) {
    let s = map.get(c.s)
    if (!s) {
      const m = setsMeta[c.s] || {}
      s = {
        code: c.s,
        name: m.name || c.s.toUpperCase(),
        icon: m.icon || null,
        date: m.date || c.r || '',
        type: m.type || '',
        cards: [],
      }
      map.set(c.s, s)
    }
    s.cards.push(c)
  }
  for (const s of map.values()) s.cards.sort(compareCards)
  return [...map.values()]
}

export function setStats(set, owned) {
  let n = 0
  for (const c of set.cards) if (owned[c.id]) n++
  return { owned: n, total: set.cards.length }
}

export function landMatch(c, land) {
  if (land === 'all') return true
  if (land === 'snow') return isSnow(c)
  return c.n === land
}

const PAGE_NUM = (p) => {
  const m = String(p ?? '').match(/\d+/)
  return m ? parseInt(m[0], 10) : Infinity
}

export const DEFAULT_FILTERS = {
  q: '',
  sort: 'recent', // recent | old | name | page
  status: 'all', // all | complete | partial | none | any | nopage
  type: 'all',
  land: 'all',
  missingOnly: false,
}

/**
 * @returns {{set: object, cards: object[], stats: {owned:number,total:number}}[]}
 */
export function filterSets(sets, owned, pages, f) {
  const q = f.q.trim().toLowerCase()
  const out = []
  for (const set of sets) {
    if (f.type !== 'all' && set.type !== f.type) continue
    const stats = setStats(set, owned)
    const page = String(pages[set.code] ?? '').trim()
    if (f.status === 'complete' && !(stats.owned === stats.total)) continue
    if (f.status === 'partial' && !(stats.owned > 0 && stats.owned < stats.total)) continue
    if (f.status === 'none' && stats.owned !== 0) continue
    if (f.status === 'any' && stats.owned === 0) continue
    if (f.status === 'nopage' && !(stats.owned > 0 && !page)) continue

    const setHit = !q || set.name.toLowerCase().includes(q) || set.code.includes(q)
    let cards = set.cards
    if (q && !setHit) cards = cards.filter((c) => `${c.n} ${c.a} ${c.c}`.toLowerCase().includes(q))
    if (f.land !== 'all') cards = cards.filter((c) => landMatch(c, f.land))
    if (f.missingOnly) cards = cards.filter((c) => !owned[c.id])
    if (cards.length === 0) continue
    out.push({ set, cards, stats })
  }

  const byName = (a, b) => a.set.name.localeCompare(b.set.name)
  const cmp = {
    recent: (a, b) => b.set.date.localeCompare(a.set.date) || byName(a, b),
    old: (a, b) => a.set.date.localeCompare(b.set.date) || byName(a, b),
    name: byName,
    page: (a, b) => {
      const pa = PAGE_NUM(pages[a.set.code])
      const pb = PAGE_NUM(pages[b.set.code])
      if (pa === pb) return byName(a, b)
      return pa < pb ? -1 : 1
    },
  }[f.sort] || byName
  out.sort(cmp)
  return out
}

export function globalStats(sets, owned) {
  let total = 0
  let have = 0
  let complete = 0
  let started = 0
  for (const s of sets) {
    const st = setStats(s, owned)
    total += st.total
    have += st.owned
    if (st.owned === st.total) complete++
    if (st.owned > 0) started++
  }
  return { total, have, complete, started, sets: sets.length }
}

const PROMO_FR = {
  prerelease: 'Prerelease',
  datestamped: 'Datestamped',
  release: 'Release',
  promopack: 'Promo pack',
  buyabox: 'Buy-a-box',
  bundle: 'Bundle',
  gameday: 'Game Day',
  fnm: 'FNM',
  judgegift: 'Judge',
  planeswalkerstamped: 'Stamped',
  stamped: 'Stamped',
  setpromo: 'Set promo',
  boosterfun: 'Booster Fun',
  surgefoil: 'Surge foil',
  galaxyfoil: 'Galaxy foil',
  textured: 'Texturé',
  neonink: 'Neon ink',
  confettifoil: 'Confetti foil',
  gilded: 'Gilded',
  serialized: 'Numéroté',
}

export function cardBadges(c) {
  const out = []
  for (const p of c.p.slice(0, 2)) out.push(PROMO_FR[p] || p.replace(/_/g, ' '))
  return out
}

// Page produit Cardmarket si Scryfall connaît l'idProduct, sinon recherche « CODE numéro » (ex « FRA 386 »)
const CARDMARKET = 'https://www.cardmarket.com/fr/Magic/Products'
export function cardmarketUrl(c, set) {
  if (c.m) return `${CARDMARKET}?idProduct=${c.m}`
  return `${CARDMARKET}/Search?${new URLSearchParams({ searchString: `${set.code.toUpperCase()} ${c.c}` })}`
}

export const SET_TYPE_FR = {
  core: 'Édition de base',
  expansion: 'Extension',
  masters: 'Masters',
  draft_innovation: 'Draft innovation',
  funny: 'Humoristique',
  promo: 'Promo',
  box: 'Coffret',
  memorabilia: 'Memorabilia',
  commander: 'Commander',
  starter: 'Starter',
  token: 'Jetons',
  treasure_chest: 'Treasure chest',
  duel_deck: 'Duel Deck',
  from_the_vault: 'From the Vault',
  spellbook: 'Spellbook',
  premium_deck: 'Premium Deck',
  archenemy: 'Archenemy',
  planechase: 'Planechase',
  vanguard: 'Vanguard',
  masterpiece: 'Masterpiece / Expeditions',
  alchemy: 'Alchemy',
  minigame: 'Minigame',
  eternal: 'Eternal',
}

export const setTypeLabel = (t) => SET_TYPE_FR[t] || (t ? t.replace(/_/g, ' ') : 'Autre')

export function ownedToCsv(sets, owned, pages) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [['Code', 'Extension', 'N° collector', 'Carte', 'Artiste', 'Page classeur']]
  for (const s of sets) {
    for (const c of s.cards) {
      if (owned[c.id]) rows.push([s.code.toUpperCase(), s.name, c.c, c.n, c.a, pages[s.code] || ''])
    }
  }
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n')
}

// --- Prix CardTrader Zero
// États CardTrader du meilleur au pire ; équivalences Cardmarket : Slightly Played ≈ Excellent, Moderately Played ≈ Good / Light Played
export const CT_CONDITIONS = ['Mint', 'Near Mint', 'Slightly Played', 'Moderately Played', 'Played', 'Heavily Played', 'Poor']
export const CT_CONDITION_FR = {
  Mint: 'Mint',
  'Near Mint': 'NM',
  'Slightly Played': 'Excellent',
  'Moderately Played': 'Good / LP',
  Played: 'Played',
  'Heavily Played': 'Heavily Played',
  Poor: 'Poor',
}
// Pire état accepté selon l'âge de l'extension : récent = NM, puis on tolère plus d'usure
export const CT_AGE_RULES = [
  [10, 'Moderately Played'],
  [4, 'Slightly Played'],
  [0, 'Near Mint'],
]

export function worstCondition(releaseDate, now = Date.now()) {
  const years = (now - Date.parse(releaseDate)) / (365.25 * 24 * 3600 * 1000)
  if (Number.isNaN(years)) return 'Near Mint'
  return CT_AGE_RULES.find(([min]) => years >= min)?.[1] || 'Near Mint'
}

// entry = { b: idBlueprint, p: { 'Near Mint': cents, … } } → { cents, condition } | null
export function bestPrice(entry, releaseDate, now = Date.now()) {
  if (!entry?.p) return null
  const allowed = CT_CONDITIONS.slice(0, CT_CONDITIONS.indexOf(worstCondition(releaseDate, now)) + 1)
  let best = null
  for (const condition of allowed) {
    const cents = entry.p[condition]
    if (cents != null && (!best || cents < best.cents)) best = { cents, condition }
  }
  return best
}

// Total des cartes manquantes d'une extension
export function missingCost(set, owned, cardsPrices, now = Date.now()) {
  let cents = 0
  let priced = 0
  let noOffer = 0
  for (const c of set.cards) {
    if (owned[c.id]) continue
    const best = bestPrice(cardsPrices?.[c.id], set.date, now)
    if (best) {
      cents += best.cents
      priced++
    } else noOffer++
  }
  return { cents, priced, noOffer }
}

export const formatPrice = (cents, currency = 'EUR') =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100)

// --- Export des manquantes vers une liste d'envies Cardmarket
export const WANTS_FORMATS = [
  ['code', 'Nom (CODE) n°'],
  ['set', 'Nom (Extension)'],
  ['name', 'Nom seul, regroupé'],
  ['links', 'Liens Cardmarket'],
]

// entries = [{ set, cards }] (extensions affichées) → [{ card, set }] non possédées
export function missingItems(entries, owned) {
  const out = []
  for (const { set, cards } of entries) for (const card of cards) if (!owned[card.id]) out.push({ card, set })
  return out
}

export function wantsText(items, format) {
  if (format === 'name') {
    const qty = new Map()
    for (const { card } of items) qty.set(card.n, (qty.get(card.n) || 0) + 1)
    return [...qty].map(([n, q]) => `${q} ${n}`).join('\n')
  }
  const line = {
    code: ({ card, set }) => `1 ${card.n} (${set.code.toUpperCase()}) ${card.c}`,
    set: ({ card, set }) => `1 ${card.n} (${set.name})`,
    links: ({ card, set }) => `${card.n} #${card.c} (${set.code.toUpperCase()}) ${cardmarketUrl(card, set)}`,
  }[format]
  return items.map(line).join('\n')
}
