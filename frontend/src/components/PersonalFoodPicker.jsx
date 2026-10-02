import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { Button, TextField } from './ui.jsx'
import { searchCatalogue, createFoodLookup } from '../lib/personal/food-search.js'
import { requestFoodJson } from '../lib/personal/food-http.js'
import { saveFood } from '../lib/personal/store-actions.js'
import { scanCode } from '../lib/scan.js'
import { MOBILE } from '../lib/mobile.js'

const cache = {
  get(key) { try { return JSON.parse(localStorage.getItem(`personal-food:${key}`)) ?? undefined } catch { return undefined } },
  set(key, value) { try { localStorage.setItem(`personal-food:${key}`, JSON.stringify(value)) } catch { /* diary persistence is independent */ } },
}
let sessionLookup, sessionEmail
function lookupFor(email) {
  if (!sessionLookup || sessionEmail !== email) {
    sessionEmail = email
    sessionLookup = createFoodLookup({ request: requestFoodJson, cache, contactEmail: email })
  }
  return sessionLookup
}

export const nutrientText = nutrients => [
  [nutrients?.kcal, t('kcal')], [nutrients?.protein, t('P')], [nutrients?.fat, t('F')], [nutrients?.carbs, t('C')],
].map(([value, label]) => `${label}: ${value == null ? '—' : Math.round(value * 10) / 10}`).join(' · ')

export default function PersonalFoodPicker({ onSelect, onManual, onEdit }) {
  const S = useStore(state => state.S)
  const [query, setQuery] = useState('')
  const [barcode, setBarcode] = useState('')
  const [email, setEmail] = useState(S.personalProfile?.foodContactEmail || '')
  const [onlyFavourites, setOnlyFavourites] = useState(false)
  const [remote, setRemote] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const foods = useMemo(() => {
    const available = new Map(searchCatalogue(query).map(food => [food.id, food]))
    for (const food of [...(S.nutrition?.foods || []), ...(S.nutrition?.recipes || []), ...remote]) {
      if (food.deletedAt || !`${food.name} ${food.brand || ''}`.toLowerCase().includes(query.toLowerCase())) continue
      available.set(food.id, food)
    }
    const favourites = new Set((S.nutrition?.foods || []).filter(food => !food.deletedAt && food.favourite).map(food => food.id))
    return [...available.values()].filter(food => !onlyFavourites || favourites.has(food.id))
      .sort((a, b) => Number(favourites.has(b.id)) - Number(favourites.has(a.id)))
  }, [S.nutrition, query, remote, onlyFavourites])
  async function fetchFoods(code = null) {
    setBusy(true); setError('')
    try {
      useStore.getState().updatePersonal(state => { state.personalProfile.foodContactEmail = email.trim(); state.personalProfile.updatedAt = Date.now() })
      const lookup = lookupFor(email.trim())
      const results = code ? [await lookup.barcode(code)] : await lookup.search(query)
      setRemote(results)
      if (code) setQuery('')
      if (!results.length) setError(t('Nothing found. Add the label manually.'))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const favourite = food => useStore.getState().updatePersonal(state => {
    const old = state.nutrition.foods.find(item => item.id === food.id)
    saveFood(state, { ...food, favourite: !old?.favourite })
  })
  return <div className="personal-stack">
    <TextField aria-label={t('Find a food')} placeholder={t('Find a food')} value={query} onChange={event => setQuery(event.target.value)} />
    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
      <Button size="sm" variant="ghost" onClick={() => setOnlyFavourites(value => !value)}>{onlyFavourites ? t('All foods') : t('Favourites')}</Button>
      <Button size="sm" onClick={onManual}>{t('Manual food')}</Button>
    </div>
    <details>
      <summary>{t('Search Open Food Facts or scan a barcode')}</summary>
      <div className="personal-stack" style={{ marginTop: 12 }}>
        <label>{t('Contact e-mail for Open Food Facts')}<TextField type="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
        <p className="small muted">{t('Sent with searches to identify this app. Your diary stays private.')}</p>
        <Button busy={busy} disabled={!query.trim()} onClick={() => fetchFoods()}>{busy ? t('Searching…') : t('Search online')}</Button>
        <div className="row" style={{ gap: 8 }}>
          <TextField aria-label={t('Barcode')} inputMode="numeric" value={barcode} onChange={event => setBarcode(event.target.value)} placeholder={t('Barcode')} />
          <Button disabled={busy || !barcode} onClick={() => fetchFoods(barcode)}>{t('Find')}</Button>
        </div>
        {MOBILE && <Button variant="ghost" disabled={busy} onClick={async () => {
          try { const code = await scanCode(); if (code) { setBarcode(code.value); await fetchFoods(code.value) } } catch (err) { setError(err.message) }
        }}>{t('Scan barcode')}</Button>}
      </div>
    </details>
    {error && <p role="alert" className="personal-error">{error}</p>}
    <div className="personal-food-list">
      {foods.map(food => <div className="personal-food-row" key={food.id}>
        <button type="button" className="personal-food-select" onClick={() => onSelect(food)}>
          <strong>{food.name}</strong>{food.brand && <span className="small muted">{food.brand}</span>}
          <span className="small muted">{nutrientText(food.nutrients)} / {food.basis === '100ml' ? t('100 ml — density required') : '100 г'}</span>
          <span className="small muted">{food.source?.type === 'usda' ? 'USDA' : food.source?.type === 'openfoodfacts' ? 'Open Food Facts' : food.source?.type === 'recipe' ? t('Recipe') : t('Manual')}</span>
        </button>
        <div className="personal-stack">
          <Button variant="ghost" size="sm" aria-label={t('Favourite {0}', food.name)} onClick={() => favourite(food)}>{S.nutrition?.foods?.find(item => item.id === food.id && !item.deletedAt)?.favourite ? '★' : '☆'}</Button>
          {onEdit && <Button variant="ghost" size="sm" onClick={() => onEdit(food)}>{t('Edit')}</Button>}
        </div>
      </div>)}
      {!foods.length && <p className="muted">{t('No matching foods')}</p>}
    </div>
  </div>
}
