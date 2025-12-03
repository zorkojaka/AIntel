import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { AlertCircle } from "lucide-react";

interface ValidationBannerProps {
  missing: string[];
  onFix?: () => void;
}

export function ValidationBanner({ missing, onFix }: ValidationBannerProps) {
  if (missing.length === 0) return null;

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Manjkajoči podatki</AlertTitle>
      <AlertDescription className="mt-2">
        <ul className="list-inside list-disc space-y-1">
          {missing.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
        {onFix && (
          <Button variant="outline" size="sm" className="mt-3" onClick={onFix}>
            Popravi
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
