import { useState } from 'react'
import { t } from '../lib/i18n.js'
import { useStore } from '../store/useStore.js'
import { Button, TextField, SelectRow } from './ui.jsx'
import { saveFood, deletePersonalRecord } from '../lib/personal/store-actions.js'

export const nutrientLabels = { kcal: 'Calories', protein: 'Protein', fat: 'Fat', carbs: 'Carbohydrates' }
export function NutrientFields({ value, onChange, suffix = '' }) {
  return <div className="personal-nutrients">{Object.entries(nutrientLabels).map(([key, label]) =>
    <label key={key}>{t(label)} {suffix}<TextField aria-label={`${t(label)} ${suffix}`.trim()} inputMode="decimal" placeholder="—" value={value[key] ?? ''}
      onChange={event => onChange({ ...value, [key]: event.target.value })} /></label>)}</div>
}

export default function PersonalFoodEditor({ food, onClose, onSaved }) {
  const [draft, setDraft] = useState(food || { name: '', brand: '', preparation: 'label', nutrients: {} })
  const [error, setError] = useState('')
  function save() {
    try {
      let saved
      useStore.getState().updatePersonal(state => {
        saved = saveFood(state, { ...draft, basis: '100g', source: { type: 'manual', ...(food?.source ? { basedOn: food.source } : {}) } })
      })
      onSaved?.(saved); onClose()
    } catch (err) { setError(err.message) }
  }
  return <section className="card personal-stack">
    <h2>{food ? t('Edit food') : t('Manual food')}</h2>
    <label>{t('Food name')}<TextField value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <label>{t('Brand')}<TextField value={draft.brand || ''} onChange={event => setDraft({ ...draft, brand: event.target.value })} /></label>
    <SelectRow title={t('Preparation')} value={draft.preparation} options={[
      { value: 'raw', label: t('Raw') }, { value: 'cooked', label: t('Cooked') }, { value: 'ready', label: t('Ready to eat') }, { value: 'label', label: t('From the label') },
    ]} onChange={value => setDraft({ ...draft, preparation: value })} />
    <p className="small muted">{t('Values per 100 g. Leave unknown values blank.')}</p>
    <NutrientFields value={draft.nutrients} onChange={nutrients => setDraft({ ...draft, nutrients })} />
    {error && <p role="alert" className="personal-error">{error}</p>}
    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
      <Button onClick={save}>{t('Save food')}</Button><Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
      {food?.createdAt && <Button variant="ghost" onClick={() => {
        useStore.getState().updatePersonal(state => deletePersonalRecord(state, 'nutrition', 'foods', food.id)); onClose()
      }}>{t('Delete')}</Button>}
    </div>
  </section>
}
