import { motion } from 'framer-motion';
import { HiOutlineFunnel, HiOutlineMagnifyingGlass } from 'react-icons/hi2';

export default function CrmToolbar({
  placeholder = 'Suche…',
  value = '',
  onChange,
  children,
  embedded = false,
}) {
  return (
    <motion.div
      className={`crm-toolbar ${embedded ? 'crm-toolbar--embedded' : 'crm-toolbar glass'}`.trim()}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: embedded ? 0 : 0.04 }}
    >
      <div className="crm-search-wrap">
        <HiOutlineMagnifyingGlass className="crm-search-ico" aria-hidden />
        <input
          type="search"
          className="crm-search"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Suche"
        />
      </div>
      <div className="crm-toolbar-filters">
        <HiOutlineFunnel className="crm-filter-icon" aria-hidden />
        {children}
      </div>
    </motion.div>
  );
}
