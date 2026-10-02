import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { Button, TextField } from './ui.jsx'
import PersonalFoodPicker, { nutrientText } from './PersonalFoodPicker.jsx'
import PersonalFoodEditor from './PersonalFoodEditor.jsx'
import { saveRecipe, deletePersonalRecord } from '../lib/personal/store-actions.js'
import { recipeNutrients, snapshotMealItem } from '../lib/personal/nutrition.js'

export default function PersonalRecipeEditor({ recipe, onClose }) {
  const [draft, setDraft] = useState(recipe || { name: '', finalGrams: '', ingredients: [] })
  const [food, setFood] = useState(null)
  const [grams, setGrams] = useState('100')
  const [manual, setManual] = useState(false)
  const [error, setError] = useState('')
  let preview = null
  try { preview = recipeNutrients(draft.ingredients, draft.finalGrams) } catch { /* incomplete form */ }
  function addIngredient() {
    try { setDraft({ ...draft, ingredients: [...draft.ingredients, snapshotMealItem(food, grams)] }); setFood(null); setError('') }
    catch (err) { setError(err.message) }
  }
  function save() {
    try { useStore.getState().updatePersonal(state => saveRecipe(state, draft)); onClose() } catch (err) { setError(err.message) }
  }
  return <section className="card personal-stack">
    <h2>{t('Recipe')}</h2>
    <label>{t('Recipe name')}<TextField value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <label>{t('Final cooked weight, g')}<TextField inputMode="decimal" value={draft.finalGrams} onChange={event => setDraft({ ...draft, finalGrams: event.target.value })} /></label>
    <p className="small muted">{t('Weigh the whole cooked batch. Portions use this weight.')}</p>
    {draft.ingredients.map((item, index) => <div className="row between" key={index}>
      <span>{item.food.name}: {item.grams} {t('g')}</span><Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, i) => i !== index) })}>{t('Remove')}</Button>
    </div>)}
    {preview && <p>{nutrientText(preview)} / 100 {t('g')}</p>}
    {food ? <div className="personal-stack">
      <strong>{food.name}</strong><TextField aria-label={t('Ingredient weight, g')} inputMode="decimal" value={grams} onChange={event => setGrams(event.target.value)} />
      <Button onClick={addIngredient}>{t('Add ingredient')}</Button><Button variant="ghost" onClick={() => setFood(null)}>{t('Cancel')}</Button>
    </div> : <PersonalFoodPicker onSelect={setFood} onManual={() => setManual(true)} />}
    {manual && <PersonalFoodEditor onClose={() => setManual(false)} onSaved={setFood} />}
    {error && <p role="alert" className="personal-error">{error}</p>}
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <Button onClick={save}>{t('Save recipe')}</Button><Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
      {recipe && <Button variant="ghost" onClick={() => {
        useStore.getState().updatePersonal(state => deletePersonalRecord(state, 'nutrition', 'recipes', recipe.id)); onClose()
      }}>{t('Delete')}</Button>}
    </div>
  </section>
}
