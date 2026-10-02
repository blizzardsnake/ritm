import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { MOBILE, shareExport } from '../lib/mobile.js'
import { buildAnalysis, renderAnalysisMarkdown, shiftDate } from '../lib/personal/report.js'
import { createExchangeSnapshot, writePrivateAnalysis } from '../lib/personal/exchange.js'
import { Button, TextField } from '../components/ui.jsx'
import '../personal.css'

export default function AnalysisExport() {
  const nav = useNavigate()
  const [from, setFrom] = useState(shiftDate(todayISO(), -6))
  const [to, setTo] = useState(todayISO())
  const [snapshot, setSnapshot] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function generate() {
    setBusy(true); setMessage('')
    try {
      const report = buildAnalysis(structuredClone(useStore.getState().S), { from, to })
      const next = await createExchangeSnapshot(report)
      if (MOBILE) await writePrivateAnalysis(next)
      setSnapshot(next)
    } catch (error) { setSnapshot(null); setMessage(error.message) }
    finally { setBusy(false) }
  }
  function allHistory() {
    const S = useStore.getState().S
    const dates = [...(S.workouts || []).map(w => w.d), ...(S.nutrition?.meals || []).map(m => m.date), ...(S.health?.daily || []).map(d => d.date), ...(S.bodyweight || []).map(b => b.d)].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d || '')).sort()
    setFrom(dates[0] || todayISO()); setTo(todayISO()); setSnapshot(null)
  }
  async function exportFile(markdown = false) {
    const content = markdown ? renderAnalysisMarkdown(snapshot.payload) : JSON.stringify(snapshot, null, 2)
    const filename = `opengym-personal-analysis-${snapshot.payload.window.to}.${markdown ? 'md' : 'json'}`
    try {
      if (MOBILE) await shareExport(content, filename)
      else {
        const url = URL.createObjectURL(new Blob([content], { type: markdown ? 'text/markdown;charset=utf-8' : 'application/json' }))
        const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 60000)
      }
      setMessage(t('Report exported'))
    } catch (error) { setMessage(error.message) }
  }
  return <div className="narrow personal-stack">
    <div className="hdr"><div><h1>{t('Analysis report')}</h1><p className="sub">{t('Training, nutrition and recovery in one file')}</p></div><Button variant="ghost" onClick={() => nav(-1)}>{t('Back')}</Button></div>
    <div className="personal-panel personal-stack">
      <div className="row"><label>{t('From date')}<TextField type="date" value={from} onChange={event => { setFrom(event.target.value); setSnapshot(null) }} /></label><label>{t('To date')}<TextField type="date" value={to} onChange={event => { setTo(event.target.value); setSnapshot(null) }} /></label></div>
      <Button variant="ghost" onClick={allHistory}>{t('Select all history')}</Button>
      <p className="sub">{t('Includes four previous weeks of context and the current training plan. Unknown values stay unknown.')}</p>
      <Button variant="primary" disabled={busy} onClick={generate}>{busy ? t('Preparing report…') : t('Prepare report')}</Button>
    </div>
    {message && <p role="status" className="personal-panel">{message}</p>}
    {snapshot && <div className="personal-panel personal-stack">
      <h2>{t('Report ready')}</h2>
      <p>{new Date(snapshot.generatedAt).toLocaleString()} · {snapshot.payload.summaries.workouts.count} {t('Workouts')}</p>
      <p className="sub">{t('Incomplete food days: {0}', snapshot.payload.quality.incompleteFoodDays)} · {t('Days without activity data: {0}', snapshot.payload.quality.missingHealthDays)}</p>
      <Button icon="download" variant="primary" onClick={() => exportFile()}>{t('Export analysis JSON')}</Button>
      <Button icon="download" variant="tinted" onClick={() => exportFile(true)}>{t('Export readable report')}</Button>
      <p className="sub">{t('The report contains your personal history. Share it with the intended analyst.')}</p>
      <details><summary>{t('Preview report')}</summary><pre className="personal-report">{renderAnalysisMarkdown(snapshot.payload)}</pre></details>
    </div>}
    <div className="personal-panel sub">{t('Full JSON and photo/video backups remain available in Settings.')}</div>
  </div>
}
