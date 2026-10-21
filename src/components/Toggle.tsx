interface Props { checked: boolean; onChange(value: boolean): void; label: string; disabled?: boolean }
export function Toggle({ checked, onChange, label, disabled }: Props) {
  return <button type="button" className="toggle" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>;
}
