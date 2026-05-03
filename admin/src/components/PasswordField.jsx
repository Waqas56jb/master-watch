import { useState } from 'react';
import { HiOutlineEye, HiOutlineEyeSlash } from 'react-icons/hi2';

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
          {show ? <HiOutlineEyeSlash size={20} /> : <HiOutlineEye size={20} />}
        </button>
      </div>
    </label>
  );
}
