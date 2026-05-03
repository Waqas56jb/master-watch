import { motion } from 'framer-motion';

export default function CrmDataShell({ children, toolbar }) {
  return (
    <motion.div
      className={`crm-stack glass${toolbar ? '' : ' crm-stack--body-only'}`.trim()}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      {toolbar}
      {children}
    </motion.div>
  );
}
