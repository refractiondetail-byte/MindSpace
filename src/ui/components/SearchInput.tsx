import { useRef } from 'react';

interface SearchInputProps {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
}

export function SearchInput({ query, onQueryChange, placeholder }: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="hud-panel relative max-w-xl">
      <label className="relative block">
        <span className="sr-only">{placeholder}</span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          className="field pr-20"
          placeholder={placeholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onQueryChange('');
              inputRef.current?.blur();
            }
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
          ⌘K
        </span>
      </label>
    </div>
  );
}
