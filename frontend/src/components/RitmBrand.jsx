export default function RitmBrand({ compact = false }) {
  return <span className={'ritm-brand' + (compact ? ' compact' : '')} aria-label="RITM">
    <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 25V7h9a6.5 6.5 0 0 1 0 13H8m9 0 8 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg><span>RITM</span>
  </span>
}
