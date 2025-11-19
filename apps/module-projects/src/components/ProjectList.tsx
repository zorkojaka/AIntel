import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ProjectStatus, ProjectSummary, Category } from "../types";

interface ProjectListProps {
  projects: ProjectSummary[];
  onSelectProject: (projectId: string) => void;
  categories: Category[];
}

const statusColors: Record<ProjectStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  offered: "bg-blue-100 text-blue-700",
  ordered: "bg-purple-100 text-purple-700",
  "in-progress": "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  invoiced: "bg-indigo-100 text-indigo-700",
};

const statusLabels: Record<ProjectStatus, string> = {
  draft: "Osnutek",
  offered: "Ponujeno",
  ordered: "Naročeno",
  "in-progress": "V teku",
  completed: "Zaključeno",
  invoiced: "Zaračunano",
};

export function ProjectList({ projects, onSelectProject, categories }: ProjectListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((category) => map.set(category.id, category.name));
    return map;
  }, [categories]);

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.customer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Išči po nazivu ali stranki..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Vsi statusi</SelectItem>
            <SelectItem value="draft">Osnutek</SelectItem>
            <SelectItem value="offered">Ponujeno</SelectItem>
            <SelectItem value="ordered">Naročeno</SelectItem>
            <SelectItem value="in-progress">V teku</SelectItem>
            <SelectItem value="completed">Zaključeno</SelectItem>
            <SelectItem value="invoiced">Zaračunano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-[var(--radius-card)] border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Projekt</TableHead>
              <TableHead>Stranka</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ponudba (€)</TableHead>
              <TableHead className="text-right">Računi (€)</TableHead>
              <TableHead>Datum</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProjects.map((project) => (
              <TableRow
                key={project.id}
                className="cursor-pointer"
                onClick={() => onSelectProject(project.id)}
              >
                <TableCell className="font-medium">
                  <div className="flex flex-col gap-1">
                    <span>{project.title}</span>
                    {project.categories && project.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {project.categories.map((categoryId) => (
                          <Badge key={`${project.id}-${categoryId}`} variant="outline">
                            {categoryLookup.get(categoryId) ?? "Neznano"}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>{project.customer}</TableCell>
                <TableCell>
                  <Badge className={statusColors[project.status]}>
                    {statusLabels[project.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  € {project.offerAmount.toLocaleString("sl-SI", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right">
                  € {project.invoiceAmount.toLocaleString("sl-SI", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>{project.createdAt}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
