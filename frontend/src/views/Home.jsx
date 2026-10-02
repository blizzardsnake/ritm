import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutines, effectiveRoutineIds, nextTrainingDay, streakWeeks, lastBW } from '../lib/history.js'
import { fmtNum, fmtDate, todayISO, isoOf, weekKey, weekStartOf, weekDayOffset, DAYS, DAYN } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { bwSheet, goalSheet, dayOverrideSheet, calendarSheet, startFlow, starterPlanSheet, bwDeltaColor, weighInsSheet } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Icon from '../components/Icon.jsx'
import RitmBrand from '../components/RitmBrand.jsx'
import { Button } from '../components/ui.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { summarizeNutritionDay } from '../lib/personal/nutrition.js'
import { mealCountText, nutrientDisplay } from '../lib/personal/ui-format.js'
import HealthDayCards from '../components/HealthDayCards.jsx'

// Home = what to do now + a quick glance. Deep charts & history live in Stats.
export default function Home() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const [weekOffset, setWeekOffset] = useState(0)
  const nutritionToday = summarizeNutritionDay(S.nutrition, todayISO())

  const today = new Date()
  // A weekday can hold several routines. `todayRoutines` is the whole day; `routine` is the
  // first, kept for the one-routine glyph. The derived session name joins them (§9).
  const todayRoutines = effectiveRoutines(S, todayISO())
  const routine = todayRoutines[0] || null
  const todayName = todayRoutines.map(r => r.name).join(' + ')
  const todayOvr = S.dayPlan[todayISO()] !== undefined
  // An open editor on a saved workout (lib/session-edit.js) holds S.active too, but it is not a
  // session in progress: the row takes you back to it as an edit, the way the tab bar does.
  const editingSaved = !!S.active?.editingWorkoutId
  // On a rest day, saying when you train next beats leaving the row as a full stop.
  const next = !S.active && !todayRoutines.length ? nextTrainingDay(S, todayISO()) : null
  const bw = lastBW(S)
  const prevBW = S.bodyweight.length > 1 ? S.bodyweight[S.bodyweight.length - 2] : null
  const delta = bw && prevBW ? bw.w - prevBW.w : null

  const ws = weekStartOf(S)
  // The first day of the shown week. Named for the role, not for Monday — which day that is
  // is the setting.
  const wkStart = new Date(today)
  wkStart.setDate(today.getDate() - weekDayOffset(today.getDay(), ws) + weekOffset * 7)
  const doneDays = new Set(S.workouts.map(w => w.d))
  // The last session logged for today, if any — what the row below reports instead of asking
  // you to start the one you already did. Last wins, so a second session names itself.
  const doneToday = S.workouts.filter(w => w.d === todayISO()).at(-1) || null
  const strip = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(wkStart); d.setDate(wkStart.getDate() + i)
    const iso = isoOf(d)
    const eff = effectiveRoutineIds(S, iso).length > 0, ovr = S.dayPlan[iso] !== undefined, done = doneDays.has(iso)
    const dot = done ? ' done' : ovr && eff ? ' ovr' : eff ? ' plan' : ''
    strip.push(<div key={i} className={'wday' + (iso === todayISO() ? ' today' : '')} {...tappable(() => dayOverrideSheet(iso))}>
      <div className="lbl">{t(DAYS[d.getDay()])}</div><div className="num">{d.getDate()}</div><div className={'dot' + dot} /></div>)
  }
  const wkEnd = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 6)
  const wkLabel = weekOffset === 0 ? t('This week') : `${wkStart.getDate()} ${wkStart.toLocaleDateString(dateLocale(), { month: 'short' })} – ${wkEnd.getDate()} ${wkEnd.toLocaleDateString(dateLocale(), { month: 'short' })}`

  const wThisWeek = S.workouts.filter(w => weekKey(w.d, ws) === weekKey(todayISO(), ws)).length
  // Days scheduled, not routines — a combined day counts as 1, matching wThisWeek (one w).
  const plannedPerWeek = Object.values(S.week).filter(ids => ids?.length).length
  const bwPoints = S.bodyweight.slice(-30).map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))

  // today's session shown right under the week strip
  const onToday = () => { if (S.active) nav('/workout'); else if (todayRoutines.length) startFlow(effectiveRoutineIds(S, todayISO())); else dayOverrideSheet(todayISO()) }

  return <div className="narrow ritm-home">
    <div className="hdr ritm-home-header">
      <div><RitmBrand compact /><h1>{user ? t('Hi {0}', user.name) : t('Your day')}</h1><div className="sub">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="gear" /></button>
    </div>

    <section className={'ritm-workout-hero' + (doneToday && !S.active ? ' done' : '')}>
      <div className="ritm-hero-top"><span><Icon name="dumbbell" />{t('Training')}</span><span className="ritm-hero-date">{t('Today')} · {today.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}</span></div>
      <div className="ritm-workout-art" aria-hidden="true"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" /><circle cx="100" cy="100" r="66" /><circle cx="100" cy="100" r="44" /><path d="M12 100h35m106 0h35M100 12v35m0 106v35" /></svg><Icon name={S.active ? 'timer' : doneToday ? 'checkCircle' : routine ? 'dumbbell' : 'moon'} /></div>
      <div className="today-row" {...tappable(onToday)}>
        <div className="row" style={{ gap: 9, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div className="lbl2">{S.active ? t('Keep your rhythm') : doneToday ? t('A good day of training') : routine ? t('Your next step') : t('Recovery is part of progress')}</div>
            <div className="ttl">{S.active ? (editingSaved ? S.active.name : t('{0} — in progress', S.active.name))
              : doneToday ? (doneToday.name ? t('{0} — done', doneToday.name) : t('Workout done'))
              : routine ? todayName : t('Rest day')}{todayOvr && routine && !doneToday ? ' · ' + t('rescheduled') : ''}</div>
            {next && !doneToday && <div className="ss">{t('Next session: {0}, {1}', t(DAYN[next.weekday]), next.routine.name)}</div>}
            {routine && !S.active && !doneToday && <div className="ss">{t('{0} exercises', todayRoutines.reduce((sum, item) => sum + item.ex.length, 0))}</div>}
          </div>
        </div>
        {S.active ? <span className="tag" style={{ color: 'var(--orange)', background: 'color-mix(in srgb,var(--orange) 16%,transparent)' }}>{editingSaved ? t('Edit') : t('Resume')}</span>
          : doneToday ? <span className="tag" style={{ color: 'var(--green)', background: 'color-mix(in srgb,var(--green) 16%,transparent)' }}>{t('Done')}</span>
          : routine ? <span className="tag acc">{t('Start')}</span>
          : <Icon name="plus" className="chev" />}
      </div>
      <Button className="ritm-hero-action" icon={S.active ? 'play' : doneToday ? 'chart' : routine ? 'play' : 'plus'} onClick={() => S.active || (!doneToday && routine) ? onToday() : nav(doneToday ? '/stats' : '/workout')}>
        {S.active ? (editingSaved ? t('Edit workout') : t('Resume workout')) : doneToday ? t('See your results') : routine ? t('Start workout') : t('Choose a workout')}
      </Button>
      {!S.active && <div className="ritm-hero-secondary">
        <Button size="sm" variant="ghost" icon="reset" onClick={() => nav('/workout')}>
          {t('Choose a different workout')}
        </Button>
      </div>}
    </section>

    <div className="ritm-home-overview">
      <div className="card tappable ritm-home-food" {...tappable(() => nav('/nutrition'))}>
        <div className="ritm-tile-top"><span className="ritm-icon-tile"><Icon name="nutrition" /></span><Icon name="chevronRight" /></div>
        <h2>{t('Nutrition today')}</h2>
        <div className="ritm-tile-number">{nutrientDisplay(nutritionToday.totals.kcal)}<span>{t('kcal')}</span></div>
        <p className="small muted">{nutritionToday.itemCount ? mealCountText(nutritionToday.mealCount) : t('Start with breakfast')}</p>
        <div className="ritm-tile-macros">{[['protein', 'P'], ['fat', 'F'], ['carbs', 'C']].map(([key, label]) => <span key={key}><i>{t(label)}</i>{nutrientDisplay(nutritionToday.totals[key])}</span>)}</div>
        <p className="small muted">{nutritionToday.complete ? t('Day complete') : t('Partial diary')}</p>
        <span className="ritm-tile-link">{t('Open diary')}<Icon name="arrowUp" /></span>
      </div>
      <div className="card tappable ritm-home-training" {...tappable(() => nav('/stats'))}>
        <div className="ritm-tile-top"><span className="ritm-icon-tile"><Icon name="chart" /></span><Icon name="chevronRight" /></div>
        <h2>{t('This week')}</h2>
        <div className="ritm-tile-number">{wThisWeek}<span>{t('Workouts')}</span></div>
        <p className="small muted">{plannedPerWeek ? t('{0} training days planned', plannedPerWeek) : t('At your own pace')}</p>
        <div className="ritm-week-bars" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => { const day = new Date(today); day.setDate(day.getDate() - weekDayOffset(day.getDay(), ws) + index); const done = doneDays.has(isoOf(day)); return <i key={index} className={done ? 'done' : ''} /> })}</div>
        <span className="ritm-tile-link">{t('View progress')}<Icon name="arrowUp" /></span>
      </div>
    </div>

    <div className="card ritm-home-health">
      <div className="ritm-section-heading"><div><span className="ritm-eyebrow">{t('Recovery signals')}</span><h2>{t('Watch & recovery')}</h2></div><Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/health')}>{t(S.health?.config?.origins?.length ? 'Details' : 'Connect watch data')}</Button></div>
      {S.health?.config?.origins?.length ? <HealthDayCards health={S.health} date={todayISO()} compact /> : <p className="small muted">{t('Steps, sleep and energy from the sources you choose. Missing values stay unknown.')}</p>}
    </div>

    <div className="card ritm-home-calendar">
      <div className="ritm-section-heading"><h2>{t('Your training rhythm')}</h2><button className="iconbtn" onClick={calendarSheet} aria-label={t('Calendar')}><Icon name="calendar" /></button></div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setWeekOffset(w => w - 1)} aria-label={t('Previous week')}><Icon name="chevronLeft" /></button>
        <div className="small muted" style={{ fontWeight: 500 }}>{wkLabel}</div>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setWeekOffset(w => w + 1)} aria-label={t('Next week')}><Icon name="chevronRight" /></button>
      </div>
      <div className="week">{strip}</div>
    </div>

    {/* Jump to the gym check-in cards (QR membership codes). Shown here as a quick tap on
        arrival at the gym; folds away per user via the "Gym check-in" switch in Settings. */}
    {S.checkIn !== false && (
      <div className="card tappable" style={{ cursor: 'pointer' }} {...tappable(() => nav('/checkin'))}>
        <div className="row between">
          <div className="row" style={{ gap: 9 }}>
            <span className="lrow-i" style={{ background: 'var(--blue)' }}><Icon name="qr" /></span>
            <div>
              <div className="lbl2">{t('At the gym')}</div>
              <div className="ttl">{t('Check in')}</div>
            </div>
          </div>
          <Icon name="chevronRight" className="chev" />
        </div>
      </div>
    )}

    {!S.routines.length && !S.active && (
      <div className="card">
        <div className="row" style={{ gap: 10, marginBottom: 6 }}>
          <span className="lrow-i"><Icon name="sparkles" /></span>
          <div className="big" style={{ fontSize: 22 }}>{t('Welcome!')}</div>
        </div>
        <div className="muted small" style={{ marginBottom: 12 }}>{t('Set up your weekly routine to get going — or load a ready-made starter plan.')}</div>
        <Button variant="primary" icon="sparkles" onClick={starterPlanSheet}>{t('Load starter plan')}</Button>
        <div style={{ height: 8 }} /><Button onClick={() => nav('/plan')}>{t('Build my own plan')}</Button>
      </div>
    )}

    {S.showWeightCard !== false && <div className="card ritm-home-weight">
      <div className="row between bw-head" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{t('Body weight')}</h2>
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" icon="target" style={S.targetW ? { color: 'var(--yellow)' } : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
          <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
        </div>
      </div>
      {bw ? <>
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <div className="big">{fmtNum(bw.w)} <span className="muted" style={{ fontSize: '1rem' }}>{S.unit}</span></div>
          {/* only when it actually moved — an unchanged weight used to read as "− 0" */}
          {!!delta && (
            <span className="small row" style={{ gap: 2, fontWeight: 500, color: bwDeltaColor(delta, bw.w) }}>
              <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} style={{ fontSize: 12 }} />
              {fmtNum(Math.abs(delta))}
            </span>
          )}
          <span className="dim small" style={{ marginInlineStart: 'auto' }}>{fmtDate(bw.d, true)}</span>
        </div>
        {S.targetW && (
          <div className="small row" style={{ color: 'var(--yellow)', marginTop: 4, gap: 5 }}>
            <Icon name="target" style={{ fontSize: 13 }} />
            <span>{t('Goal')} {fmtNum(S.targetW)} {S.unit} · {Math.abs(S.targetW - bw.w) < 0.05 ? t('reached!') : t(S.targetW > bw.w ? '{0} to gain' : '{0} to lose', fmtNum(Math.abs(S.targetW - bw.w)) + ' ' + S.unit)}</span>
          </div>
        )}
        <div className="chart" style={{ marginTop: 8 }}><LineChart points={bwPoints} h={130} unit={S.unit} goal={S.targetW} /></div>
        {/* every weigh-in, week by week with its average (Discord 'Weight') */}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
          <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={weighInsSheet}>{t('All weigh-ins')}</Button>
        </div>
      </> : <div className="muted small">{S.weighIn === false
        ? t('No entries yet — log your weight to start the curve.')
        : t("No entries yet — log your weight to start the curve. It's also asked before every workout.")}</div>}
    </div>}

    <div className="card tappable" style={{ cursor: 'pointer' }} {...tappable(() => calendarSheet())}>
      <div className="row between">
        <div>
          <div className="row" style={{ gap: 7, fontSize: 22, fontWeight: 600, letterSpacing: '-.021em' }}>
            <Icon name="flame" style={{ color: 'var(--orange)' }} />
            {t('{0} week streak', streakWeeks(S))}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>{wThisWeek}{plannedPerWeek ? ' / ' + plannedPerWeek : ''} {t('this week')} · {t(S.workouts.length === 1 ? '{0} workout total' : '{0} workouts total', S.workouts.length)}</div>
        </div>
        <Icon name="calendar" className="chev" style={{ fontSize: 20 }} />
      </div>
    </div>
  </div>
}
