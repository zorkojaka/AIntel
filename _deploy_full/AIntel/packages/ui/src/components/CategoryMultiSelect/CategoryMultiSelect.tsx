import React from 'react';
import type { Category } from '../../../../shared/types/category';

type CategoryMultiSelectProps = {
  categories: Category[];
  value: string[];
  onChange: (selected: string[]) => void;
  label?: string;
  description?: string;
  className?: string;
};

export function CategoryMultiSelect({
  categories,
  value,
  onChange,
  label,
  description,
  className = ''
}: CategoryMultiSelectProps) {
  const toggle = (slug: string) => {
    const next = value.includes(slug) ? value.filter((item) => item !== slug) : [...value, slug];
    onChange(next);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => {
          const isSelected = value.includes(category.slug);
          return (
            <button
              key={category.slug}
              type="button"
              onClick={() => toggle(category.slug)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                isSelected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground hover:border-primary'
              }`}
            >
              {category.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
