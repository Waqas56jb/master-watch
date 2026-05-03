import { HiOutlineInbox } from 'react-icons/hi2';

export default function EmptyState({ title = 'Keine Einträge', hint }) {
  return (
    <div className="empty-state">
      <span className="empty-state__ico" aria-hidden>
        <HiOutlineInbox />
      </span>
      <p className="empty-state__title">{title}</p>
      {hint ? <p className="empty-state__hint muted">{hint}</p> : null}
    </div>
  );
}
