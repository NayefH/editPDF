type Props<T extends string> = { label: string; value: T; onChange: (value: T) => void; items: { id: T; label: string }[] }

export function MobilePaneNav<T extends string>({ label, value, onChange, items }: Props<T>) {
  return <nav className="mobile-pane-nav" aria-label={label}>{items.map(item => <button key={item.id} type="button" aria-pressed={value === item.id} onClick={() => onChange(item.id)}>{item.label}</button>)}</nav>
}
