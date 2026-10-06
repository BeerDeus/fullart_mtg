// Chargement des terrains full art depuis l'API Scryfall (navigateur -> API publique, CORS ok)
// Requête : terrains de base (Plains/Island/Swamp/Mountain/Forest, neige, Wastes) full art, existant en papier, une ligne par impression.
// Les impressions foil only sont écartées côté client (voir keepCard dans lib.js).

const API = 'https://api.scryfall.com'
const QUERY = 't:basic is:full game:paper'
const CACHE_KEY = 'fa-lands:v3'
const OLD_CACHE_KEYS = ['fa-lands:v2']
const TTL_MS = 7 * 24 * 3600 * 1000
const PAGE_DELAY_MS = 120 // Scryfall demande 50-100 ms entre deux requêtes

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json;q=0.9,*/*;q=0.8' } })
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json()).details || ''
    } catch {
      /* ignore */
    }
    throw new Error(`Scryfall ${res.status}${detail ? ' : ' + detail : ''}`)
  }
  return res.json()
}

// On ne garde que les champs utiles (cache plus léger)
export function slim(c) {
  const img = c.image_uris || c.card_faces?.[0]?.image_uris || {}
  return {
    id: c.id,
    n: c.name,
    s: c.set,
    c: c.collector_number,
    a: c.artist || '',
    i: img.small || img.normal || '',
    l: img.normal || img.large || img.small || '',
    f: c.finishes || [],
    p: c.promo_types || [],
    t: c.type_line || '',
    r: c.released_at || '',
    m: c.cardmarket_id || Number(/idProduct=(\d+)/.exec(c.purchase_uris?.cardmarket || '')?.[1]) || 0,
  }
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeCache(data) {
  try {
    for (const k of OLD_CACHE_KEYS) localStorage.removeItem(k)
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    /* quota : on continue sans cache */
  }
}

async function fetchAllCards(onProgress) {
  const params = new URLSearchParams({
    q: QUERY,
    unique: 'prints',
    include_variations: 'true',
    order: 'set',
    dir: 'asc',
  })
  let url = `${API}/cards/search?${params}`
  const cards = []
  let total = 0
  while (url) {
    const page = await getJson(url)
    total = page.total_cards || total
    for (const c of page.data) cards.push(slim(c))
    onProgress?.({ loaded: cards.length, total })
    url = page.has_more ? page.next_page : null
    if (url) await sleep(PAGE_DELAY_MS)
  }
  return cards
}

async function fetchSetsMeta(codes) {
  const json = await getJson(`${API}/sets`)
  const meta = {}
  for (const s of json.data) {
    if (!codes.has(s.code)) continue
    meta[s.code] = {
      name: s.name,
      icon: s.icon_svg_uri,
      date: s.released_at || '',
      type: s.set_type || '',
      parent: s.parent_set_code || '',
    }
  }
  return meta
}

/**
 * @returns {{cards: object[], sets: Record<string, object>, fetchedAt: number, stale?: boolean, error?: string}}
 */
export async function loadData({ force = false, onProgress } = {}) {
  const cached = readCache()
  const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS
  if (cached && fresh && !force) return cached

  try {
    const cards = await fetchAllCards(onProgress)
    const sets = await fetchSetsMeta(new Set(cards.map((c) => c.s)))
    const data = { cards, sets, fetchedAt: Date.now() }
    writeCache(data)
    return data
  } catch (e) {
    if (cached) return { ...cached, stale: true, error: e.message }
    throw e
  }
}
