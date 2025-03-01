export interface ReceiptImport {
  datetime: string;
  id: string;
  store: string;
  total: number;
  products: {
    amount: number;
    name: string;
    totalPrice: number;
    unit: string;
    unitPrice: number;
  }[];
  sourcePdf: string;
}

export interface DBStore {
  id: string;
  name: string;
}

export interface DBReceipt {
  id: string;
  imported: Date;
  date: Date;
  store_id: string;
  source_pdf: string;
  total: number;
}

export interface DBProduct {
  id: string;
  name: string;
  unit: string;
}

export interface DBPurchase {
  id: string;
  receipt_id: string;
  product_id: string;
  amount: number;
  unit_price: number;
  total_price: number;
  datetime: Date;
}
