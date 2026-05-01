import { motion } from 'framer-motion';
import { Filter, Search } from 'lucide-react';

export default function CrmToolbar({ placeholder = 'Suche…', value = '', onChange, children }) {
  return (
    <motion.div
      className="crm-toolbar glass"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
    >
      <div className="crm-search-wrap">
        <Search className="crm-search-ico" size={18} strokeWidth={2} aria-hidden />
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
        <Filter size={18} className="crm-filter-icon" aria-hidden />
        {children}
      </div>
    </motion.div>
  );
}
