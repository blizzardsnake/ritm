import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, getLang } from '../lib/i18n.js'
import { MOBILE } from '../lib/mobile.js'
import { EXIDX } from '../lib/exercises.js'
import { exerciseNameText } from '../lib/format.js'
import { isWarmupRow } from '../lib/workout-model.js'
import { applyProposal, previewProposal, validateProposal, saveProposal, undoProposal } from '../lib/personal/proposal.js'
import { weeklyConsent, requestWeeklyReview } from '../lib/personal/weekly.js'
import { isBuiltinAI } from '../../../api/coach/core/providers.js'
import { Button, Switch, TextArea } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

const labels = { weight: 'Weight', sets: 'Sets', reps: 'Reps', kcal: 'Calories', protein: 'Protein', fat: 'Fat', carbs: 'Carbs' }
const shown = value => value == null ? '—' : value.toLocaleString()
const nameOf = (S, id) => exerciseNameText(EXIDX[id] || S.customEx?.find(ex => ex.id === id) || { n: id })
const changeName = (S, c) => c.type === 'nutrition' ? t('Nutrition target')
  : `${S.routines.find(r => r.id === c.routineId)?.name || c.routineId} · ${nameOf(S, c.exerciseId)}`
const unitText = unit => t(({ kg: 'kg', lb: 'lb', sets: 'Sets', reps: 'Reps', g: 'g', kcal: 'kcal' })[unit] || unit)

export default function WeeklyReview({ snapshot }) {
  const S = useStore(s => s.S), settings = useStore(s => s.coachLocal), nav = useNavigate()
  const [proposal, setProposal] = useState(null), [selected, setSelected] = useState([])
  const [consented, setConsented] = useState(false), [note, setNote] = useState('')
  const [stage, setStage] = useState(''), [message, setMessage] = useState('')
  const controller = useRef(null), upload = useRef(null), mounted = useRef(true)
  const builtin = isBuiltinAI(settings)
  const configured = MOBILE && (builtin || settings?.mode === 'byok' && settings?.freeOnly === true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])
  useEffect(() => {
    const old = [...(S.weeklyReviews?.proposals || [])].reverse().find(p => !p.deletedAt && p.analysisHash === snapshot.checksum)
    setProposal(old || null); setSelected(old?.changes.map(c => c.id) || []); setConsented(false); setMessage('')
  }, [snapshot.checksum])
  useEffect(() => setConsented(false), [settings?.provider, settings?.model, settings?.baseUrl, settings?.freeOnly, settings?.mode])
  const applied = S.weeklyReviews?.journal?.find(j => j.id === proposal?.id)
  let preview = null
  try { if (proposal && !applied) preview = previewProposal(S, proposal, selected) } catch { preview = { conflicts: [{ code: 'invalid' }], nextSessions: [], before: [] } }
  const accept = (doc, author = { type: 'file' }) => {
    const current = useStore.getState().S
    const validated = validateProposal(doc, current, snapshot)
    useStore.getState().updatePersonal(s => saveProposal(s, validated, { author }))
    setProposal(validated); setSelected(validated.changes.map(c => c.id))
  }
  async function analyse() {
    setMessage(''); setStage('preparing'); controller.current = new AbortController()
    try {
      const next = await requestWeeklyReview(structuredClone(useStore.getState().S), snapshot, { consent: consented ? weeklyConsent(settings) : null,
        note, language: getLang(), signal: controller.current.signal, onStage: value => mounted.current && setStage(value) })
      if (mounted.current) accept(next, { type: 'ai', provider: builtin ? 'Pollinations' : 'OpenRouter', model: settings.model })
    } catch (error) { if (mounted.current) setMessage(error.message) }
    finally { if (mounted.current) setStage(''); controller.current = null }
  }
  async function importFile(event) {
    setMessage('')
    try {
      const file = event.target.files?.[0]
      if (!file) return
      if (file.size > 2 * 1024 * 1024) throw new Error(t('The suggestion file is too large'))
      accept(await file.text())
    } catch (error) { setMessage(error.message) }
    finally { event.target.value = '' }
  }
  function apply() {
    try {
      useStore.getState().updatePersonal(s => Object.assign(s, applyProposal(s, proposal, selected)))
      setMessage(t('Changes applied to future sessions'))
    } catch (error) { setMessage(error.message) }
  }
  function undo(review) {
    try {
      const result = undoProposal(useStore.getState().S, review.id)
      if (result.conflicts.length) {
        const names = result.conflicts.map(c => { const change = review.changes.find(item => item.id === c.changeId); return change ? `${changeName(S, change)} · ${t(labels[change.field])}` : t('Active workout') })
        setMessage(`${t('Manual changes prevent undo')}: ${names.join('; ')}`); return
      }
      useStore.getState().updatePersonal(s => Object.assign(s, result.state))
      setMessage(t('Changes undone'))
    } catch (error) { setMessage(error.message) }
  }
  const busy = !!stage
  return <section className="personal-stack ritm-weekly" aria-label={t('Weekly review')}>
    <div className="personal-panel ritm-weekly-cloud personal-stack">
      <div className="ritm-weekly-heading"><span className="ritm-weekly-icon"><Icon name="sparkles" /></span><div><h2>{t('Weekly review')}</h2><p className="sub">{t('Training, food and recovery — one picture')}</p></div></div>
      <div className="ritm-weekly-summary"><span><b>{snapshot.payload.summaries.workouts.count}</b> {t('Workouts')}</span><span><b>{snapshot.payload.quality.incompleteFoodDays}</b> {t('Incomplete food days')}</span><span><b>{snapshot.payload.quality.missingHealthDays}</b> {t('Days without activity')}</span></div>
      {configured ? <>
        <p className="sub">{t(builtin ? 'Pollinations receives the report below when you request an analysis. Free service; availability and limits apply.' : 'OpenRouter and its model provider receive the data below. Free models only; availability and daily limits apply.')} <b>{settings.model}</b></p>
        <details className="ritm-weekly-disclosure"><summary>{t('What will be sent')}</summary><ul><li>{t('Your current program and completed sets, weights, reps, effort and notes')}</li><li>{t('Food names, portions and notes, daily macros and which days are complete')}</li><li>{t('Body weight and available steps, sleep, energy and recovery summaries from selected sources')}</li><li>{t('Your goals, equipment, limitations and the note below, if you filled them in')}</li></ul></details>
        <label className="personal-stack sub">{t('What should the AI consider?')}<TextArea rows={3} value={note} maxLength={2000} onChange={e => setNote(e.target.value)} placeholder={t('For example: tired this week, want to keep strength')} /></label>
        <div className="ritm-weekly-consent"><Switch data-weekly-consent checked={consented} disabled={busy} onChange={setConsented} aria-label={t('Allow this report to be sent')} /><span>{t('Allow this report to be sent')}</span></div>
        <Button variant="primary" icon="sparkles" busy={busy} disabled={!consented || busy} onClick={analyse}>{busy ? t(stage === 'validating' ? 'Checking the recommendation…' : stage === 'preparing' ? 'Preparing the analysis…' : 'Analysing your week…') : t('Analyse this week')}</Button>
        {busy && <Button variant="ghost" onClick={() => controller.current?.abort()}>{t('Cancel')}</Button>}
      </> : <><p className="sub">{t('Connect free AI in the Android app to analyse directly from your phone. You can also share the report and import a suggestion file.')}</p>{MOBILE && <Button icon="sparkles" variant="primary" onClick={() => nav('/coach/setup')}>{t('Connect free AI')}</Button>}</>}
      <p className="sub">{t('Nothing changes until you choose and apply a recommendation.')}</p>
      <input ref={upload} type="file" accept=".json,application/json" hidden onChange={importFile} />
      <Button variant="tinted" icon="upload" disabled={busy} onClick={() => upload.current.click()}>{t('Import recommendation')}</Button>
    </div>
    {message && <p className="personal-panel" role="status">{message}</p>}
    {proposal && <div className="personal-panel personal-stack" data-weekly-proposal>
      <div className="ritm-weekly-heading"><span className="ritm-weekly-icon"><Icon name="check" /></span><div><span className="sub">{proposal.window.from} — {proposal.window.to}</span><h2>{proposal.title}</h2></div></div>
      <p className="ritm-weekly-text">{proposal.summary}</p>
      {!!proposal.limitations.length && <div className="ritm-weekly-limitations"><b>{t('Limits of this analysis')}</b><ul>{proposal.limitations.map((l, index) => <li key={index}>{l}</li>)}</ul></div>}
      {!proposal.changes.length && <p className="sub">{t('No plan changes suggested')}</p>}
      {preview?.conflicts.length > 0 && <p role="alert" className="ritm-weekly-limitations">{t('The plan changed — prepare a new report and analysis before applying this suggestion.')}</p>}
      {proposal.changes.filter(c => !applied || applied.selectedIds.includes(c.id)).map(c => {
        const before = preview?.before?.find(b => b.changeId === c.id)
        const journalBefore = applied?.before?.find(b => b.changeId === c.id)
        const current = c.type === 'exercise' ? S.routines.find(r => r.id === c.routineId)?.ex.find(e => e.id === c.exerciseId)?.[c.field]
          : S.nutrition.targets.find(target => target.id === 'default' && !target.deletedAt)?.[c.field]
        return <div className="ritm-weekly-change" key={c.id} data-weekly-change={c.id}>
          <div className="ritm-weekly-change-top">{!applied && <Switch checked={selected.includes(c.id)} aria-label={`${t('Select change')}: ${c.id}`} onChange={checked => setSelected(ids => checked ? [...ids, c.id] : ids.filter(id => id !== c.id))} />}<div><small>{changeName(S, c)}</small><h3>{t(labels[c.field])}</h3></div><strong>{shown(before?.value ?? journalBefore?.value ?? current)} <span>→</span> {shown(c.value)} <small>{unitText(c.unit)}</small></strong></div>
          <p>{c.reason}</p><details><summary>{t('Evidence')}</summary><ul>{c.evidence.map(e => <li key={e}>{e}</li>)}</ul></details>
        </div>
      })}
      {!!preview?.nextSessions.length && <div className="personal-stack"><h3>{t('The next session will actually start with')}</h3>{preview.nextSessions.map(session => <div key={session.routineId} className="ritm-weekly-next" data-next-session><b>{session.name}</b>{session.entries.map((e, i) => <p key={i}>{nameOf(S, e.id)}<br /><strong>{e.sets.filter(row => !isWarmupRow(row)).map(row => `${shown(row.w)} ${unitText(S.unit || 'kg')} × ${shown(row.r)}`).join(' · ')}</strong></p>)}</div>)}</div>}
      {!applied && !!proposal.changes.length && <Button variant="primary" icon="check" disabled={busy || !selected.length || !!preview?.conflicts.length} onClick={apply}>{t('Apply selected changes')}</Button>}
      {applied && <p className="sub">{t(applied.undoneAt ? 'Changes undone' : 'Changes applied to future sessions')}</p>}
    </div>}
    {!!S.weeklyReviews?.journal?.length && <div className="personal-panel personal-stack"><h2>{t('Review history')}</h2>{[...S.weeklyReviews.journal].filter(j => !j.deletedAt).reverse().slice(0, 12).map(review => <div className="ritm-weekly-journal" key={review.id}><div><b>{review.title}</b><p className="sub">{new Date(review.appliedAt).toLocaleString()} · {t(review.undoneAt ? 'Changes undone' : 'Applied')}</p></div>{!review.undoneAt && <Button variant="ghost" icon="undo" onClick={() => undo(review)}>{t('Undo changes')}</Button>}</div>)}</div>}
  </section>
}
