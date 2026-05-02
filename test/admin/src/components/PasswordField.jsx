import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordField({
  label,
  id,
  value,
  onChange,
  autoComplete,
  minLength,
  required = true,
  ariaLabelShow = 'Passwort anzeigen',
  ariaLabelHide = 'Passwort verbergen',
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="field">
      <span>{label}</span>
      <div className="field-password">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          required={required}
          minLength={minLength}
        />
        <button
          type="button"
          className="field-password-toggle"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? ariaLabelHide : ariaLabelShow}
        >
          {show ? <EyeOff size={20} strokeWidth={1.75} /> : <Eye size={20} strokeWidth={1.75} />}
        </button>
      </div>
    </label>
  );
}
