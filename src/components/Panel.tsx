import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface PanelProps {
  title: ReactNode;
  icon?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** When true the body can be collapsed with the header button. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  as?: 'section' | 'div';
  id?: string;
}

export function Panel({ title, icon, aside, children, className, collapsible, defaultOpen = true, as = 'section', id }: PanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const headingId = useId();
  const Tag = as;
  return (
    <Tag className={`panel${className ? ' ' + className : ''}${open ? '' : ' is-collapsed'}`} aria-labelledby={headingId} id={id}>
      <header className="panel__head">
        {collapsible ? (
          <button
            type="button"
            className="panel__toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((v) => !v)}
          >
            {icon && <span className="panel__icon" aria-hidden="true">{icon}</span>}
            <h2 className="panel__title" id={headingId}>
              {title}
            </h2>
            <ChevronDown className="panel__chevron" size={16} aria-hidden="true" />
          </button>
        ) : (
          <div className="panel__heading">
            {icon && <span className="panel__icon" aria-hidden="true">{icon}</span>}
            <h2 className="panel__title" id={headingId}>
              {title}
            </h2>
          </div>
        )}
        {aside && <div className="panel__aside">{aside}</div>}
      </header>
      <div className="panel__body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </Tag>
  );
}
