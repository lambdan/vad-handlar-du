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
  source_file_id: string;
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
  source_file_id: string;
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

export enum ReceiptSourceFileType {
  PDF_COOP_V1 = "PDF_COOP_V1",
}

export interface DBReceiptSourceFile {
  /** PDF etc */
  id: string;
  type: ReceiptSourceFileType;
  md5: string;
  base64: string;
  uploaded: Date;
}
