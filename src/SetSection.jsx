import { memo, useEffect, useRef, useState } from 'react'
import {
  CT_CONDITION_FR,
  bestPrice,
  cardBadges,
  cardmarketUrl,
  formatPrice,
  missingCost,
  setTypeLabel,
  worstCondition,
} from './lib.js'

export function SetIcon({ set, big = false }) {
  const [bad, setBad] = useState(false)
  return (
    <span className={'set-icon' + (big ? ' big' : '')} aria-hidden="true">
      {set.icon && !bad ? (
        <img src={set.icon} alt="" onError={() => setBad(true)} />
      ) : (
        <span className="set-code-fallback">{set.code.toUpperCase()}</span>
      )}
    </span>
  )
}

export function CardmarketLink({ card, set, compact = false }) {
  return (
    <a
      className={compact ? 'cm-link' : 'btn cm-btn'}
      href={cardmarketUrl(card, set)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Voir ${card.n} #${card.c} (${set.code.toUpperCase()}) sur Cardmarket`}
    >
      {compact ? 'CM ↗' : 'Cardmarket ↗'}
    </a>
  )
}

function TilePrice({ entry, set, currency }) {
  const best = bestPrice(entry, set.date)
  if (!best) return <span className="price none" title="Aucune offre CardTrader Zero dans l'état voulu">—</span>
  return (
    <span className="price" title={`CardTrader Zero, ${CT_CONDITION_FR[best.condition]}`}>
      {formatPrice(best.cents, currency)}
    </span>
  )
}

function SetPrice({ set, owned, price }) {
  if (!price || price.status === 'off') return null
  if (price.status === 'loading') return <p className="set-price">Prix CardTrader Zero…</p>
  if (price.status === 'error') return <p className="set-price">Prix CardTrader indisponibles ({price.error})</p>
  if (!price.data.matched) return <p className="set-price">Extension introuvable sur CardTrader</p>
  const { cents, priced, noOffer } = missingCost(set, owned, price.data.cards)
  if (!priced && !noOffer) return null
  return (
    <p className="set-price">
      CardTrader Zero · {priced} manquante{priced > 1 ? 's' : ''} ≈ <b>{formatPrice(cents, price.data.currency)}</b> hors port
      {noOffer ? ` · ${noOffer} sans offre` : ''} · état min {CT_CONDITION_FR[worstCondition(set.date)]}
      {price.data.stale ? ' · (cache)' : ''}
    </p>
  )
}

const CardTile = memo(function CardTile({ card, set, owned, priceEntry, currency, onToggleCard, onZoom }) {
  const badges = cardBadges(card)
  return (
    <div className={'tile' + (owned ? ' owned' : '')}>
      <button
        type="button"
        className="tile-img"
        aria-label={`Agrandir ${card.n}, n° ${card.c}`}
        onClick={() => onZoom(card, set)}
      >
        {card.i ? <img src={card.i} alt={card.n} loading="lazy" decoding="async" /> : <span className="noimg">{card.n}</span>}
      </button>
      <div className="meta">
        <label className="meta-head" title={owned ? 'Possédée' : 'Marquer comme possédée'}>
          <input
            type="checkbox"
            checked={owned}
            onChange={(e) => onToggleCard(card.id, e.target.checked)}
            aria-label={`${card.n}, n° ${card.c}, possédée`}
          />
          <span className="meta-name">{card.n}</span>
        </label>
        <div className="meta-sub">
          <span className="num">#{card.c}</span>
          {badges.map((b) => (
            <span className="badge" key={b}>{b}</span>
          ))}
          {currency && <TilePrice entry={priceEntry} set={set} currency={currency} />}
          <CardmarketLink card={card} set={set} compact />
        </div>
        {card.a && <div className="meta-artist" title={card.a}>{card.a}</div>}
      </div>
    </div>
  )
})

const SetSection = memo(function SetSection({
  set,
  cards,
  stats,
  owned,
  page,
  open,
  onOpen,
  onToggleCard,
  onToggleSet,
  onPage,
  onZoom,
  price,
}) {
  const all = stats.owned === stats.total
  const some = stats.owned > 0 && !all
  const boxRef = useRef(null)
  const [val, setVal] = useState(page)

  useEffect(() => {
    if (boxRef.current) boxRef.current.indeterminate = some
  }, [some])
  useEffect(() => setVal(page), [page])

  const commit = () => {
    if (val.trim() !== page.trim()) onPage(set.code, val)
  }
  const pct = Math.round((stats.owned / stats.total) * 100)
  const year = set.date.slice(0, 4)
  const filtered = cards.length !== set.cards.length
  const priceData = price?.status === 'ok' ? price.data : null

  return (
    <section className={'set' + (all ? ' complete' : '') + (stats.owned > 0 ? ' started' : '')}>
      <div className="set-head">
        <button type="button" className="set-toggle" onClick={() => onOpen(set.code)} aria-expanded={open}>
          <SetIcon set={set} big />
          <span className="set-title">
            <span className="set-name">{set.name}</span>
            <span className="set-sub">
              {set.code.toUpperCase()}
              {year ? ` · ${year}` : ''} · {setTypeLabel(set.type)}
              {filtered ? ` · ${cards.length} affichée${cards.length > 1 ? 's' : ''}` : ''}
            </span>
          </span>
          <span className="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>

        <div className="set-progress" title={`${stats.owned} sur ${stats.total}`}>
          <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
          <span className="count">{stats.owned}/{stats.total}</span>
        </div>

        <div className="set-actions">
          {(stats.owned > 0 || page) && (
            <label className="page">
              <span>Page</span>
              <input
                type="text"
                inputMode="text"
                maxLength={12}
                placeholder="—"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                aria-label={`Page du classeur pour ${set.name}`}
              />
            </label>
          )}
          <label className="all" title="Cocher / décocher toutes les cartes de l'extension">
            <input
              ref={boxRef}
              type="checkbox"
              checked={all}
              onChange={(e) => onToggleSet(set, e.target.checked)}
            />
            <span>Set complet</span>
          </label>
        </div>
      </div>

      {open && <SetPrice set={set} owned={owned} price={price} />}
      {open && (
        <div className="grid">
          {cards.map((c) => (
            <CardTile
              key={c.id}
              card={c}
              set={set}
              owned={!!owned[c.id]}
              priceEntry={priceData?.cards?.[c.id]}
              currency={priceData?.matched ? priceData.currency : null}
              onToggleCard={onToggleCard}
              onZoom={onZoom}
            />
          ))}
        </div>
      )}
    </section>
  )
})

export default SetSection
