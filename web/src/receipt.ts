import { STATICS } from ".";
import { DBProduct, DBPurchase, DBReceipt } from "./models";

export class Store {
  id: string;
  name: string;
  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }
}

export class Receipt {
  id: string;
  imported: Date;
  date: Date;
  store: Store | null;
  sourcePdf: string;
  total: number;
  constructor(
    id: string,
    imported: Date,
    date: Date,
    store: Store,
    sourcePdf: string,
    total: number
  ) {
    this.id = id;
    this.imported = imported;
    this.date = date;
    this.store = store;
    this.sourcePdf = sourcePdf;
    this.total = total;
  }

  static async fromDB(db: DBReceipt): Promise<Receipt> {
    const store_db = await STATICS.pg.fetchStoreByID(db.store_id);
    if (!store_db) {
      throw new Error("Store not found");
    }
    const store = new Store(store_db.id, store_db.name);
    const r = new Receipt(
      db.id,
      db.imported,
      db.date,
      store,
      db.source_pdf,
      db.total
    );
    return r;
  }
}
