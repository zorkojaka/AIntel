import { Item } from "./ItemsTable";
import { OfferVersion } from "./OfferVersionCard";
import { Template } from "./TemplateEditor";

interface TemplateData {
  customer: {
    name: string;
    taxId: string;
    address: string;
    paymentTerms: string;
  };
  project: {
    id: string;
    title: string;
    description: string;
  };
  offer: OfferVersion;
  items: Item[];
}

export function renderTemplate(template: Template, data: TemplateData): string {
  let html = template.content;

  // Calculate totals
  const totalNet = data.items.reduce((sum, item) => {
    const lineTotal = item.quantity * item.price * (1 - item.discount / 100);
    return sum + lineTotal;
  }, 0);

  const totalVAT = data.items.reduce((sum, item) => {
    const lineTotal = item.quantity * item.price * (1 - item.discount / 100);
    const vatAmount = lineTotal * (item.vatRate / 100);
    return sum + vatAmount;
  }, 0);

  const totalGross = totalNet + totalVAT;

  // Generate items table rows
  const itemsHtml = data.items
    .map((item) => {
      const lineNet = item.quantity * item.price * (1 - item.discount / 100);
      const lineTotal = lineNet * (1 + item.vatRate / 100);
      return `
      <tr>
        <td>${item.name}</td>
        <td>${item.quantity}</td>
        <td>${item.unit}</td>
        <td style="text-align: right">€ ${item.price.toFixed(2)}</td>
        <td style="text-align: right">${item.vatRate}%</td>
        <td style="text-align: right">€ ${lineTotal.toFixed(2)}</td>
      </tr>
    `;
    })
    .join("");

  // Replace customer placeholders
  html = html.replace(/\{\{customerName\}\}/g, data.customer.name);
  html = html.replace(/\{\{customerAddress\}\}/g, data.customer.address);
  html = html.replace(/\{\{customerTaxId\}\}/g, data.customer.taxId);
  html = html.replace(/\{\{paymentTerms\}\}/g, data.customer.paymentTerms);

  // Replace project placeholders
  html = html.replace(/\{\{projectId\}\}/g, data.project.id);
  html = html.replace(/\{\{projectTitle\}\}/g, data.project.title);
  html = html.replace(/\{\{projectDescription\}\}/g, data.project.description);

  // Replace offer placeholders
  html = html.replace(/\{\{offerVersion\}\}/g, data.offer.version.toString());
  html = html.replace(/\{\{offerDate\}\}/g, data.offer.date);
  html = html.replace(/\{\{offerAmount\}\}/g, data.offer.amount.toFixed(2));

  // Replace items and totals
  html = html.replace(/\{\{items\}\}/g, itemsHtml);
  html = html.replace(/\{\{totalNet\}\}/g, totalNet.toFixed(2));
  html = html.replace(/\{\{totalVAT\}\}/g, totalVAT.toFixed(2));
  html = html.replace(/\{\{totalGross\}\}/g, totalGross.toFixed(2));

  // AI placeholders (will be filled later with AI integration)
  html = html.replace(/\{\{problemSummary\}\}/g, "[AI: Povzetek problema bo generiran]");
  html = html.replace(/\{\{solutionDescription\}\}/g, "[AI: Opis rešitve bo generiran]");
  html = html.replace(/\{\{milestones\}\}/g, "[AI: Časovnica bo generirana]");

  return html;
}

export function downloadHTML(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function openPreview(html: string) {
  const previewWindow = window.open("", "_blank");
  if (previewWindow) {
    previewWindow.document.write(html);
    previewWindow.document.close();
  }
}
