"use client";

interface EmailSearchProps {
  value: string;
  disabled?: boolean;
  searching?: boolean;
  onChange: (value: string) => void;
  onSearch: () => void;
  onClear: () => void;
}

export function EmailSearch({
  value,
  disabled,
  searching,
  onChange,
  onSearch,
  onClear,
}: EmailSearchProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSearch();
    }
  };

  return (
    <div className="email-search">
      <div className="email-search-field">
        <svg
          className="email-search-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <input
          type="search"
          className="email-search-input"
          placeholder="Поиск по адресу, имени, теме, тексту…"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Поиск писем"
        />
        {value && (
          <button
            type="button"
            className="email-search-clear"
            onClick={onClear}
            disabled={disabled}
            title="Очистить"
            aria-label="Очистить поиск"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      <button
        type="button"
        className="email-search-submit"
        onClick={onSearch}
        disabled={disabled || !value.trim()}
      >
        {searching ? "Поиск…" : "Поиск"}
      </button>
    </div>
  );
}
