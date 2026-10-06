import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { FieldPath, deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { auth, db, provider } from './firebase.js'
import { loadData } from './scryfall.js'
import { fetchSetPrices } from './cardtrader.js'
import {
  BASE_LANDS,
  CT_CONDITION_FR,
  DEFAULT_FILTERS,
  buildSets,
  cardBadges,
  filterSets,
  globalStats,
  keepCard,
  bestPrice,
  formatPrice,
  ownedToCsv,
  setTypeLabel,
  worstCondition,
} from './lib.js'
import SetSection, { CardmarketLink, SetIcon } from './SetSection.jsx'

const FILTERS_KEY = 'fa-lands:filters'

const LAND_CHIPS = [
  ['all', 'Tous'],
  ...BASE_LANDS.map((l) => [l, l]),
  ['snow', 'Neige'],
]

function loadFilters() {
  try {
    const f = { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}'), q: '' }
    // valeur de filtre périmée (ex: ancien chip « Non-basiques ») -> retour à « Tous »
    if (!LAND_CHIPS.some(([v]) => v === f.land)) f.land = 'all'
    return f
  } catch {
    return DEFAULT_FILTERS
  }
}

function authMessage(e) {
  switch (e?.code) {
    case 'auth/unauthorized-domain':
      return "Domaine non autorisé : ajoute-le dans Firebase > Authentication > Paramètres > Domaines autorisés."
    case 'auth/popup-blocked':
      return 'Popup bloquée par le navigateur : autorise-la puis réessaie.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return ''
    default:
      return `Connexion impossible (${e?.code || e?.message || 'erreur inconnue'})`
  }
}

function CardPrice({ card, set, price }) {
  if (!price || price.status === 'off') return null
  if (price.status === 'loading') return <div className="ct-price muted">Prix CardTrader Zero…</div>
  if (price.status === 'error') return <div className="ct-price muted">Prix CardTrader indisponible ({price.error})</div>
  const worst = CT_CONDITION_FR[worstCondition(set.date)]
  const best = bestPrice(price.data.cards?.[card.id], set.date)
  return (
    <div className="ct-price">
      {best ? (
        <>CardTrader Zero : dès <b>{formatPrice(best.cents, price.data.currency)}</b> ({CT_CONDITION_FR[best.condition]})</>
      ) : (
        <span className="muted">Aucune offre CardTrader Zero</span>
      )}
      <span className="muted"> · état min {worst}</span>
    </div>
  )
}

function Lightbox({ zoom, owned, price, onToggle, onClose }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const { card, set } = zoom
  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={card.n}>
      <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <img src={card.l || card.i} alt={card.n} />
        <div className="lightbox-cap">
          <SetIcon set={set} />
          <div>
            <b>{card.n}</b> · #{card.c}
            <div className="muted">
              {set.name} ({set.code.toUpperCase()}){card.a ? ` · ${card.a}` : ''}
            </div>
            <div className="muted">{cardBadges(card).join(' · ')}</div>
            <CardPrice card={card} set={set} price={price} />
          </div>
          <div className="lightbox-actions">
            <CardmarketLink card={card} set={set} />
            <span className="spacer" />
            <label className={'check-inline own-toggle' + (owned ? ' on' : '')}>
              <input type="checkbox" checked={owned} onChange={(e) => onToggle(card.id, e.target.checked)} />
              Possédée
            </label>
            <button type="button" className="btn" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = vérification en cours
  const [authError, setAuthError] = useState('')
  const [data, setData] = useState(null)
  const [load, setLoad] = useState({ loading: true, progress: null, error: '' })
  const [owned, setOwned] = useState({})
  const [pages, setPages] = useState({})
  const [pending, setPending] = useState(false)
  const [filters, setFilters] = useState(loadFilters)
  const [open, setOpen] = useState(() => new Set())
  const [zoom, setZoom] = useState(null)
  const [toast, setToast] = useState('')
  const [prices, setPrices] = useState({}) // code set → { status: loading|ok|error|off, data?, error? }
  const pricesAsked = useRef(new Set())

  const refRef = useRef(null)
  const ownedRef = useRef(owned)
  ownedRef.current = owned

  // --- auth
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), [])
  const login = async () => {
    setAuthError('')
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      setAuthError(authMessage(e))
    }
  }

  // --- données Scryfall
  const fetchData = useCallback(async (force = false) => {
    setLoad({ loading: true, progress: null, error: '' })
    try {
      const d = await loadData({ force, onProgress: (p) => setLoad((l) => ({ ...l, progress: p })) })
      setData(d)
      setLoad({
        loading: false,
        progress: null,
        error: d.stale ? `Scryfall injoignable, données en cache affichées (${d.error})` : '',
      })
    } catch (e) {
      setLoad({ loading: false, progress: null, error: e.message })
    }
  }, [])
  useEffect(() => {
    fetchData(false)
  }, [fetchData])

  // --- Firestore : users/{uid}/binder/lands  { owned: {cardId: true}, pages: {setCode: "12"}, updatedAt }
  useEffect(() => {
    if (!user) {
      setOwned({})
      setPages({})
      refRef.current = null
      return undefined
    }
    const ref = doc(db, 'users', user.uid, 'binder', 'lands')
    refRef.current = ref
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setPending(snap.metadata.hasPendingWrites)
        if (snap.exists()) {
          const d = snap.data()
          setOwned(d.owned || {})
          setPages(d.pages || {})
        } else if (!snap.metadata.fromCache) {
          setDoc(ref, { owned: {}, pages: {}, updatedAt: Date.now() }).catch(() => {})
        }
      },
      (err) => setToast(`Lecture Firestore refusée (${err.code}). Vérifie les règles.`),
    )
    return () => {
      unsub()
      refRef.current = null
    }
  }, [user])

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const patch = useCallback(async (pairs) => {
    const ref = refRef.current
    if (!ref) return
    const args = []
    for (const [path, value] of pairs) args.push(new FieldPath(...path), value)
    args.push('updatedAt', Date.now())
    try {
      await updateDoc(ref, ...args)
    } catch (e) {
      if (e.code === 'not-found') {
        try {
          await setDoc(ref, { owned: {}, pages: {}, updatedAt: Date.now() })
          await updateDoc(ref, ...args)
        } catch (e2) {
          setToast(`Sauvegarde impossible (${e2.code || e2.message})`)
        }
      } else {
        setToast(`Sauvegarde impossible (${e.code || e.message})`)
      }
    }
  }, [])

  const toggleCard = useCallback(
    (id, on) => patch([[['owned', id], on ? true : deleteField()]]),
    [patch],
  )

  const toggleSet = useCallback(
    (set, on) => {
      const cur = ownedRef.current
      if (!on) {
        const n = set.cards.filter((c) => cur[c.id]).length
        if (!window.confirm(`Décocher les ${n} carte(s) de « ${set.name} » ?`)) return
      }
      const pairs = set.cards
        .filter((c) => !!cur[c.id] !== on)
        .map((c) => [['owned', c.id], on ? true : deleteField()])
      if (pairs.length) patch(pairs)
    },
    [patch],
  )

  const setPage = useCallback(
    (code, value) => {
      const v = value.trim()
      patch([[['pages', code], v ? v : deleteField()]])
    },
    [patch],
  )

  // --- dérivés
  const sets = useMemo(() => (data ? buildSets(data.cards.filter(keepCard), data.sets) : []), [data])
  const setTypes = useMemo(() => [...new Set(sets.map((s) => s.type))].sort(), [sets])
  const visible = useMemo(() => filterSets(sets, owned, pages, filters), [sets, owned, pages, filters])
  const g = useMemo(() => globalStats(sets, owned), [sets, owned])

  useEffect(() => {
    try {
      const { q, ...rest } = filters
      localStorage.setItem(FILTERS_KEY, JSON.stringify(rest))
    } catch {
      /* ignore */
    }
  }, [filters])

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }))
  const toggleOpen = useCallback(
    (code) =>
      setOpen((s) => {
        const n = new Set(s)
        if (n.has(code)) n.delete(code)
        else n.add(code)
        return n
      }),
    [],
  )
  const onZoom = useCallback((card, set) => setZoom({ card, set }), [])

  // --- prix CardTrader Zero : chargés à l'ouverture d'une extension
  useEffect(() => {
    for (const code of open) {
      if (pricesAsked.current.has(code)) continue
      pricesAsked.current.add(code)
      setPrices((p) => ({ ...p, [code]: { status: 'loading' } }))
      fetchSetPrices(code).then(
        (d) => setPrices((p) => ({ ...p, [code]: { status: 'ok', data: d } })),
        (e) => setPrices((p) => ({ ...p, [code]: { status: e.off ? 'off' : 'error', error: e.message } })),
      )
    }
  }, [open])

  const exportCsv = () => {
    const blob = new Blob([ownedToCsv(sets, owned, pages)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'collection-full-art.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  // --- rendu
  if (user === undefined) {
    return <div className="center"><p className="muted">Chargement…</p></div>
  }

  if (!user) {
    return (
      <div className="center">
        <div className="login">
          <img src="/favicon.svg" alt="" width="72" height="72" />
          <h1>Classeur Full Art</h1>
          <p className="muted">Tous les terrains full art de Magic, avec le suivi de ta collection et de ton classeur.</p>
          <button type="button" className="btn primary" onClick={login}>Se connecter avec Google</button>
          {authError && <p className="error">{authError}</p>}
        </div>
      </div>
    )
  }

  const pct = g.total ? Math.round((g.have / g.total) * 100) : 0
  const pctLoad = load.progress?.total ? Math.round((load.progress.loaded / load.progress.total) * 100) : 0

  return (
    <div className="app">
      <header className="top">
        <div className="top-title">
          <img src="/favicon.svg" alt="" width="36" height="36" />
          <div>
            <h1>Classeur Full Art</h1>
            <div className="muted small">
              {data ? `${g.have} / ${g.total} cartes · ${g.complete} sets complets sur ${g.sets}` : 'Chargement du catalogue…'}
              {pending ? ' · synchronisation…' : ''}
            </div>
          </div>
        </div>
        <div className="top-actions">
          <button type="button" className="btn" onClick={exportCsv} disabled={!data || !g.have} title="Exporter ma collection en CSV">
            Export CSV
          </button>
          <button type="button" className="btn" onClick={() => fetchData(true)} disabled={load.loading} title="Recharger le catalogue depuis Scryfall">
            Actualiser
          </button>
          {user.photoURL && <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />}
          <button type="button" className="btn" onClick={() => signOut(auth)}>Déconnexion</button>
        </div>
        {data && (
          <div className="global-bar" aria-label={`${pct}% de la collection`}>
            <div className="fill" style={{ width: `${pct}%` }} />
          </div>
        )}
      </header>

      {data && (
        <div className="toolbar">
          <input
            className="search"
            type="search"
            placeholder="Rechercher une extension, une carte, un artiste…"
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
          />
          <div className="row">
            <select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)} aria-label="Tri">
              <option value="recent">Plus récentes d'abord</option>
              <option value="old">Plus anciennes d'abord</option>
              <option value="name">Nom A→Z</option>
              <option value="page">Page du classeur</option>
            </select>
            <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Statut">
              <option value="all">Toutes les extensions</option>
              <option value="complete">Complètes</option>
              <option value="partial">En cours</option>
              <option value="any">Au moins 1 carte</option>
              <option value="none">Aucune carte</option>
              <option value="nopage">Possédées sans n° de page</option>
            </select>
            <select value={filters.type} onChange={(e) => setFilter('type', e.target.value)} aria-label="Type d'extension">
              <option value="all">Tous types</option>
              {setTypes.map((t) => (
                <option key={t} value={t}>{setTypeLabel(t)}</option>
              ))}
            </select>
            <label className="check-inline">
              <input type="checkbox" checked={filters.missingOnly} onChange={(e) => setFilter('missingOnly', e.target.checked)} />
              Manquantes seulement
            </label>
          </div>
          <div className="row chips">
            {LAND_CHIPS.map(([v, label]) => (
              <button
                key={v}
                type="button"
                className={'chip' + (filters.land === v ? ' on' : '')}
                onClick={() => setFilter('land', v)}
              >
                {label}
              </button>
            ))}
            <span className="spacer" />
            <span className="muted small">{visible.length} extension{visible.length > 1 ? 's' : ''}</span>
            <button type="button" className="btn small" onClick={() => setOpen(new Set(visible.map((v) => v.set.code)))}>
              Tout déplier
            </button>
            <button type="button" className="btn small" onClick={() => setOpen(new Set())}>Tout replier</button>
          </div>
        </div>
      )}

      <main>
        {load.loading && !data && (
          <div className="loading">
            <p>Chargement des terrains full art depuis Scryfall…</p>
            <div className="bar big"><div className="fill" style={{ width: `${pctLoad}%` }} /></div>
            <p className="muted small">
              {load.progress ? `${load.progress.loaded} / ${load.progress.total} cartes` : 'Connexion…'}
              {' '}(uniquement au premier lancement, ensuite mis en cache)
            </p>
          </div>
        )}
        {load.error && (
          <div className="banner error">
            {load.error}
            {!data && (
              <button type="button" className="btn" onClick={() => fetchData(true)}>Réessayer</button>
            )}
          </div>
        )}
        {data && visible.length === 0 && <p className="muted center-text">Aucune extension ne correspond aux filtres.</p>}
        {visible.map(({ set, cards, stats }) => (
          <SetSection
            key={set.code}
            set={set}
            cards={cards}
            stats={stats}
            owned={owned}
            page={String(pages[set.code] ?? '')}
            open={open.has(set.code)}
            price={prices[set.code]}
            onOpen={toggleOpen}
            onToggleCard={toggleCard}
            onToggleSet={toggleSet}
            onPage={setPage}
            onZoom={onZoom}
          />
        ))}
      </main>

      {data && (
        <footer className="foot muted small">
          Catalogue du {new Date(data.fetchedAt).toLocaleDateString('fr-FR')} · Données et images : Scryfall ·
          Magic: The Gathering est une marque de Wizards of the Coast ; ce site est un outil de fan non affilié.
        </footer>
      )}

      {zoom && (
        <Lightbox
          zoom={zoom}
          owned={!!owned[zoom.card.id]}
          price={prices[zoom.set.code]}
          onToggle={toggleCard}
          onClose={() => setZoom(null)}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
