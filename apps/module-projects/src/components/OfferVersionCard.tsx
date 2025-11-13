import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { FileText, MoreVertical, Download, Send, CheckCircle, XCircle } from "lucide-react";

export interface OfferVersion {
  id: string;
  version: number;
  status: "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired";
  amount: number;
  date: string;
  isSelected?: boolean;
}

interface OfferVersionCardProps {
  offer: OfferVersion;
  onOpen: () => void;
  onPDF: () => void;
  onMarkAsSelected?: () => void;
  onSend?: () => void;
  onConfirm?: () => void;
  onCancelConfirmation?: () => void;
}

const statusColors: Record<OfferVersion["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-700",
  viewed: "bg-purple-100 text-purple-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-700",
};

const statusLabels: Record<OfferVersion["status"], string> = {
  draft: "Osnutek",
  sent: "Poslano",
  viewed: "Videno",
  accepted: "Sprejeto",
  rejected: "Zavrnjeno",
  expired: "Poteklo",
};

export function OfferVersionCard({
  offer,
  onOpen,
  onPDF,
  onMarkAsSelected,
  onSend,
  onConfirm,
  onCancelConfirmation,
}: OfferVersionCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-1 items-center gap-4">
          <div className="text-lg font-semibold">v{offer.version}</div>
          <Badge className={statusColors[offer.status]}>
            {statusLabels[offer.status]}
          </Badge>
          {offer.isSelected && (
            <Badge className="bg-primary text-primary-foreground">Izbrano</Badge>
          )}
          <div className="text-muted-foreground">{offer.date}</div>
          <div className="ml-auto font-semibold">
            € {offer.amount.toLocaleString("sl-SI", { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="ml-4 flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onOpen}>
            Odpri
          </Button>
          <Button size="sm" variant="outline" onClick={onPDF}>
            <FileText className="mr-2 h-4 w-4" />
            PDF
          </Button>
          {onSend && offer.status === "draft" && (
            <Button size="sm" onClick={onSend}>
              <Send className="mr-2 h-4 w-4" />
              Pošlji
            </Button>
          )}
          {onConfirm && (offer.status === "sent" || offer.status === "viewed") && !offer.isSelected && (
            <Button size="sm" onClick={onConfirm}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Potrdi ponudbo
            </Button>
          )}
          {onCancelConfirmation && offer.isSelected && (
            <Button size="sm" variant="outline" onClick={onCancelConfirmation}>
              <XCircle className="mr-2 h-4 w-4" />
              Preklic potrditve
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onMarkAsSelected && !offer.isSelected && offer.status === "accepted" && (
                <DropdownMenuItem onClick={onMarkAsSelected}>
                  Označi kot izbrano
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onPDF}>
                <Download className="mr-2 h-4 w-4" />
                Prenesi PDF
              </DropdownMenuItem>
              <DropdownMenuItem>Podvoji</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Izbriši</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
