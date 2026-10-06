import { useEffect, useMemo, useState } from 'react'
import { WANTS_FORMATS, wantsText } from './lib.js'

const FORMAT_KEY = 'fa-lands:wants-format'
const WANTS_URL = 'https://www.cardmarket.com/fr/Magic/Wants'

function savedFormat() {
  try {
    const f = localStorage.getItem(FORMAT_KEY)
    return WANTS_FORMATS.some(([k]) => k === f) ? f : 'code'
  } catch {
    return 'code'
  }
}

// Export des cartes manquantes pour une liste d'envies Cardmarket (puis Assistant d'achat)
export default function ExportDialog({ title, items, onClose }) {
  const [format, setFormat] = useState(savedFormat)
  const [copied, setCopied] = useState(false)
  const text = useMemo(() => wantsText(items, format), [items, format])

  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  useEffect(() => {
    try {
      localStorage.setItem(FORMAT_KEY, format)
    } catch {
      /* ignore */
    }
    setCopied(false)
  }, [format])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    a.download = `manquantes-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cartes'}.txt`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label="Exporter pour Cardmarket">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Manquantes → Cardmarket</h2>
        <p className="muted small">
          {title} · {items.length} carte{items.length > 1 ? 's' : ''}. Cardmarket : Wants › créer une liste › ajouter
          une liste de cartes › coller, puis lancer l'Assistant d'achat.
        </p>
        <div className="row chips">
          {WANTS_FORMATS.map(([k, label]) => (
            <button key={k} type="button" className={'chip' + (format === k ? ' on' : '')} onClick={() => setFormat(k)}>
              {label}
            </button>
          ))}
        </div>
        <textarea readOnly value={text} rows={10} onFocus={(e) => e.currentTarget.select()} aria-label="Liste à coller" />
        <div className="row">
          <button type="button" className="btn primary" onClick={copy}>{copied ? 'Copié ✓' : 'Copier'}</button>
          <button type="button" className="btn" onClick={download}>.txt</button>
          <a className="btn cm-btn" href={WANTS_URL} target="_blank" rel="noopener noreferrer">Mes listes Cardmarket ↗</a>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
