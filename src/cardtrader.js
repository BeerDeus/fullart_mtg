// Prix CardTrader Zero via le proxy PHP (public/api/cardtrader.php) : le token CardTrader reste côté serveur.
// Une requête par extension, 2 en parallèle max pour ménager l'API.

const ENDPOINT = '/api/cardtrader.php'
const CONCURRENCY = 2

const queue = []
let running = 0
let disabled = false // proxy absent (dev Vite) ou non configuré : on n'insiste pas

function next() {
  while (running < CONCURRENCY && queue.length) {
    const { code, resolve, reject } = queue.shift()
    running++
    request(code)
      .then(resolve, reject)
      .finally(() => {
        running--
        next()
      })
  }
}

async function request(code) {
  if (disabled) throw Object.assign(new Error('CardTrader indisponible'), { off: true })
  const res = await fetch(`${ENDPOINT}?set=${encodeURIComponent(code)}`, { headers: { Accept: 'application/json' } })
  const type = res.headers.get('content-type') || ''
  if (res.status === 404 || res.status === 503 || !type.includes('json')) {
    disabled = true
    throw Object.assign(new Error('CardTrader indisponible'), { off: true })
  }
  const json = await res.json()
  if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`)
  return json
}

/** @returns {Promise<{set: string, currency: string, matched: boolean, cards: Record<string, {b: number, p: Record<string, number>}>, fetchedAt: number, stale?: boolean}>} */
export function fetchSetPrices(code) {
  return new Promise((resolve, reject) => {
    queue.push({ code, resolve, reject })
    next()
  })
}
