import { motion } from 'framer-motion';

export default function AuthShell({ children }) {
  return (
    <div className="auth-shell">
      <div className="auth-mesh" aria-hidden />
      <div className="auth-blob auth-blob--cyan" aria-hidden />
      <div className="auth-blob auth-blob--violet" aria-hidden />
      <div className="auth-blob auth-blob--amber" aria-hidden />
      <div className="auth-gridlines" aria-hidden />

      <motion.div
        className="auth-card glass"
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
