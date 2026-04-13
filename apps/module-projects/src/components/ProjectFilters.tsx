import { Search } from "lucide-react";
import { Category } from "../types";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface ProjectFiltersProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  phaseFilter: string;
  onPhaseFilterChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  categories: Category[];
}

export function ProjectFilters({
  searchQuery,
  onSearchQueryChange,
  phaseFilter,
  onPhaseFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  categories,
}: ProjectFiltersProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <div className="relative flex-1">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Išči po nazivu ali stranki..."
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          className="pl-9"
        />
      </div>
      <Select value={phaseFilter} onValueChange={onPhaseFilterChange}>
        <SelectTrigger className="w-full md:w-48">
          <SelectValue placeholder="Faza" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Vse faze</SelectItem>
          <SelectItem value="draft">Zahteve</SelectItem>
          <SelectItem value="offered">Ponudbe</SelectItem>
          <SelectItem value="ordered">Priprava</SelectItem>
          <SelectItem value="in-progress">Izvedba</SelectItem>
          <SelectItem value="completed">Račun</SelectItem>
          <SelectItem value="invoiced">Račun (zaračunano)</SelectItem>
        </SelectContent>
      </Select>
      <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
        <SelectTrigger className="w-full md:w-56">
          <SelectValue placeholder="Kategorija" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Vse kategorije</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.slug} value={category.slug}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
