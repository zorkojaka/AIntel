import { createContext, useContext, type ReactNode } from "react";

export const ProductPricesVisible = createContext(true);

export function ProductPrice({ children }: { children: ReactNode }) {
  return useContext(ProductPricesVisible) ? <b>{children}</b> : null;
}
