import { toast as t, Slide } from 'react-toastify';

const base = { transition: Slide, hideProgressBar: false, autoClose: 3200 };

export const notify = {
  ok: (msg, opts = {}) => t.success(msg, { ...base, ...opts }),
  err: (msg, opts = {}) => t.error(msg, { ...base, ...opts }),
  info: (msg, opts = {}) => t.info(msg, { ...base, ...opts }),
};
