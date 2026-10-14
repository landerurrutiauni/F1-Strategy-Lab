import { useId, type ReactNode } from 'react';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  /** Accessible name when the label is not plain text. */
  ariaLabel?: string;
}

interface SegmentedProps<T extends string | number> {
  legend: string;
  hideLegend?: boolean;
  name?: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  layout?: 'row' | 'grid';
}

/**
 * Radio group styled as a segmented control. Uses native radio inputs so arrow-key
 * navigation and screen-reader semantics come for free.
 */
export function Segmented<T extends string | number>({
  legend,
  hideLegend,
  name,
  value,
  options,
  onChange,
  className,
  layout = 'row',
}: SegmentedProps<T>) {
  const autoId = useId();
  const groupName = name ?? autoId;
  return (
    <fieldset className={`segmented segmented--${layout}${className ? ' ' + className : ''}`}>
      <legend className={hideLegend ? 'visually-hidden' : 'segmented__legend'}>{legend}</legend>
      <div className="segmented__options">
        {options.map((option) => {
          const id = `${groupName}-${option.value}`;
          const checked = option.value === value;
          return (
            <label key={String(option.value)} htmlFor={id} className={`segmented__option${checked ? ' is-checked' : ''}${option.disabled ? ' is-disabled' : ''}`}>
              <input
                id={id}
                type="radio"
                name={groupName}
                value={String(option.value)}
                checked={checked}
                disabled={option.disabled}
                aria-label={option.ariaLabel}
                onChange={() => onChange(option.value)}
              />
              <span className="segmented__label">{option.label}</span>
              {option.hint && <span className="segmented__hint">{option.hint}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
