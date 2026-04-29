interface SortableHeaderProps {
  label: string;
  column: string;
  currentSort: { column: string | null; direction: 'asc' | 'desc' | null };
  onSort: (column: string) => void;
  className?: string;
}

export function SortableHeader({ label, column, currentSort, onSort, className }: SortableHeaderProps) {
  const isActive = currentSort.column === column;
  const arrow = isActive ? (currentSort.direction === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <th
      className={`cursor-pointer select-none hover:bg-gray-100 ${isActive ? 'text-blue-600 font-semibold' : ''} ${
        className ?? ''
      }`}
      onClick={() => onSort(column)}
    >
      {label}
      {arrow}
    </th>
  );
}
