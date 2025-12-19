import { colorFromString } from "./utils";

export interface ReceiptImport {
  datetime: string;
  id: string;
  store: string;
  total: number;
  products: {
    sku: string;
    amount: number;
    name: string;
    totalPrice: number;
    unit: string;
    unitPrice: number;
  }[];
  source_file_id: string;
}

export class DBStore {
  id: string;
  name: string;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  equals(other: DBStore): boolean {
    return this.id === other.id && this.name === other.name;
  }

  color(): string {
    return colorFromString(this.name);
  }
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
  sku: string;
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
  PDF_ICA_KIVRA_V1 = "PDF_ICA_KIVRA_V1",
  PDF_COOP_V2 = "PDF_COOP_V2",
}

export interface DBReceiptSourceFile {
  /** PDF etc */
  id: string;
  type: ReceiptSourceFileType;
  md5: string;
  base64: string;
  uploaded: Date;
}
