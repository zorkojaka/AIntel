import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Plus, Search } from "lucide-react";

export interface Project {
  id: string;
  title: string;
  customer: string;
  status: "draft" | "offered" | "ordered" | "in-progress" | "delivered" | "completed" | "invoiced";
  offerAmount: number;
  invoiceAmount: number;
  createdAt: string;
}

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (projectId: string) => void;
  onNewProject: () => void;
}

const statusColors: Record<Project["status"], string> = {
  draft: "bg-gray-100 text-gray-700",
  offered: "bg-blue-100 text-blue-700",
  ordered: "bg-purple-100 text-purple-700",
  "in-progress": "bg-yellow-100 text-yellow-700",
  delivered: "bg-green-100 text-green-700",
  completed: "bg-green-100 text-green-700",
  invoiced: "bg-indigo-100 text-indigo-700",
};

const statusLabels: Record<Project["status"], string> = {
  draft: "Osnutek",
  offered: "Ponujeno",
  ordered: "Naročeno",
  "in-progress": "V teku",
  delivered: "Dostavljeno",
  completed: "Zaključeno",
  invoiced: "Zaračunano",
};

export function ProjectList({ projects, onSelectProject, onNewProject }: ProjectListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.customer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Projekti</h1>
        <Button onClick={onNewProject}>
          <Plus className="w-4 h-4 mr-2" />
          Nov projekt
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
            <SelectItem value="delivered">Dostavljeno</SelectItem>
            <SelectItem value="completed">Zaključeno</SelectItem>
            <SelectItem value="invoiced">Zaračunano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-[var(--radius-card)] bg-card overflow-hidden">
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
                <TableCell className="font-medium">{project.title}</TableCell>
                <TableCell>{project.customer}</TableCell>
                <TableCell>
                  <Badge className={statusColors[project.status]}>
                    {statusLabels[project.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {project.offerAmount > 0 ? project.offerAmount.toLocaleString("sl-SI", { minimumFractionDigits: 2 }) : "-"}
                </TableCell>
                <TableCell className="text-right">
                  {project.invoiceAmount > 0 ? project.invoiceAmount.toLocaleString("sl-SI", { minimumFractionDigits: 2 }) : "-"}
                </TableCell>
                <TableCell className="text-muted-foreground">{project.createdAt}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
