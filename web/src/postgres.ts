import {
  Client,
  Configuration,
  connect,
  Query,
  ResultIterator,
  ResultRecord,
} from "ts-postgres";

import { Logger } from "./logger";
import {
  DBProduct,
  DBPurchase,
  DBReceipt,
  DBReceiptSourceFile,
  DBStore,
  ReceiptImport,
  ReceiptSourceFileType,
} from "./models";

export class Postgres {
  private postgresClient: Client | null = null;
  private config: Configuration;
  private taskLoopRunning = false;
  private logger = new Logger("Postgres");

  constructor(config: Configuration) {
    this.config = config;
    this.connect();
  }

  async query<T extends ResultRecord<any>>(
    text: Query | string,
    values?: any[]
  ): Promise<ResultIterator<T>> {
    if (!this.postgresClient) {
      await this.connect();
    }
    this.logger.log(text, values);
    return await this.postgresClient!.query(text, values);
  }

  async connect() {
    this.logger.log("Connecting to Postgres");
    this.postgresClient = await connect(this.config);
    this.logger.log("Connected!");

    await this.query(
      `CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT
    )`
    );

    await this.query(
      `CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      imported TIMESTAMP,
      date TIMESTAMP,
      store_id TEXT,
      source_file_id TEXT,
      total FLOAT8
    )`
    );

    await this.query(
      `CREATE TABLE IF NOT EXISTS products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT,
      unit TEXT
    )`
    );

    await this.query(
      `CREATE TABLE IF NOT EXISTS purchases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_id TEXT,
      product_id TEXT,
      amount FLOAT8,
      unit_price FLOAT8,
      total_price FLOAT8,
      datetime TIMESTAMP)`
    );

    await this.query(
      `CREATE TABLE IF NOT EXISTS receipt_source_files (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      receiptType TEXT,
      md5 TEXT,
      base64 TEXT,
      uploaded TIMESTAMP
    )`
    );
  }

  async deleteReceipt(id: string) {
    await this.query("DELETE FROM receipts WHERE id = $1", [id]);
    await this.query("DELETE FROM purchases WHERE receipt_id = $1", [id]);
  }

  async importReceipt(receipt: ReceiptImport, replace: boolean) {
    if (!this.postgresClient) {
      await this.connect();
    }

    //console.log("Inserting", visit);

    let receiptInDB = await this.fetchReceiptByID(receipt.id);
    if (receiptInDB) {
      if (!replace) {
        console.log("Already exists, skipping");
        return;
      }
      await this.deleteReceipt(receipt.id);
    }

    let storeInDB = await this.fetchStoreByName(receipt.store);
    if (!storeInDB) {
      await this.insertStore(receipt.store);
      storeInDB = await this.fetchStoreByName(receipt.store);
    }

    await this.insertReceipt({
      id: receipt.id,
      imported: new Date(),
      date: new Date(receipt.datetime),
      store_id: storeInDB!.id,
      source_file_id: receipt.source_file_id,
      total: receipt.total,
    });

    for (const product of receipt.products) {
      let productInDB = await this.fetchProductByName(product.name);
      if (!productInDB) {
        await this.insertProduct(product.name, product.unit);
        productInDB = await this.fetchProductByName(product.name);
      }

      await this.insertPurchase({
        id: "",
        receipt_id: receipt.id,
        product_id: productInDB!.id,
        amount: product.amount,
        unit_price: product.unitPrice,
        total_price: product.totalPrice,
        datetime: new Date(receipt.datetime),
      });
    }
  }

  async insertStore(storeName: string): Promise<ResultRecord<any>> {
    if (!this.postgresClient) {
      await this.connect();
    }
    const q = await this.query("INSERT INTO stores (name) VALUES ($1)", [
      storeName,
    ]);
    return q;
  }

  async fetchStoreByName(storeName: string): Promise<DBStore | null> {
    const q = await this.query("SELECT * FROM stores WHERE name = $1", [
      storeName,
    ]);
    if (q.rows.length > 0) {
      return {
        id: q.rows[0][0] as string,
        name: q.rows[0][0] as string,
      } as DBStore;
    }
    return null;
  }

  async fetchStoreByID(storeID: string): Promise<DBStore | null> {
    const q = await this.query("SELECT * FROM stores WHERE id = $1", [storeID]);
    if (q.rows.length > 0) {
      return {
        id: q.rows[0][0] as string,
        name: q.rows[0][1] as string,
      } as DBStore;
    }
    return null;
  }

  async insertReceipt(receipt: DBReceipt): Promise<ResultRecord<any>> {
    if (!this.postgresClient) {
      await this.connect();
    }
    const q = await this.query(
      "INSERT INTO receipts (id, imported, date, store_id, source_file_id, total) VALUES ($1, to_timestamp($2), to_timestamp($3), $4, $5, $6)",
      [
        receipt.id,
        receipt.imported.getTime() / 1000,
        receipt.date.getTime() / 1000,
        receipt.store_id,
        receipt.source_file_id,
        receipt.total,
      ]
    );
    return q;
  }

  async fetchReceipts(): Promise<DBReceipt[]> {
    const q = await this.query("SELECT * FROM receipts");
    return q.rows.map(
      (r) =>
        ({
          id: r[0] as string,
          imported: new Date(r[1]),
          date: new Date(r[2]),
          store_id: r[3] as string,
          source_file_id: r[4] as string,
          total: r[5] as number,
        } as DBReceipt)
    );
  }

  async fetchReceiptByID(receiptID: string): Promise<DBReceipt | null> {
    const q = await this.query("SELECT * FROM receipts WHERE id = $1", [
      receiptID,
    ]);
    if (q.rows.length > 0) {
      return {
        id: q.rows[0][0] as string,
        imported: new Date(q.rows[0][1]),
        date: new Date(q.rows[0][2]),
        store_id: q.rows[0][3] as string,
        source_file_id: q.rows[0][4] as string,
        total: q.rows[0][5] as number,
      } as DBReceipt;
    }
    return null;
  }

  async insertProduct(
    productName: string,
    unit: string
  ): Promise<ResultRecord<any>> {
    if (!this.postgresClient) {
      await this.connect();
    }
    const q = await this.query(
      "INSERT INTO products (name, unit) VALUES ($1, $2)",
      [productName, unit]
    );
    return q;
  }

  async fetchProductByID(productID: string): Promise<DBProduct | null> {
    const q = await this.query("SELECT * FROM products WHERE id = $1", [
      productID,
    ]);
    if (q.rows.length > 0) {
      return {
        id: q.rows[0][0] as string,
        name: q.rows[0][1] as string,
        unit: q.rows[0][2] as string,
      } as DBProduct;
    }
    return null;
  }

  async fetchProducts(): Promise<DBProduct[]> {
    const q = await this.query("SELECT * FROM products");
    const prods = q.rows.map(
      (r) =>
        ({
          id: r[0] as string,
          name: r[1] as string,
          unit: r[2] as string,
        } as DBProduct)
    );
    const cleaned: DBProduct[] = [];
    for (const p of prods) {
      if (p.name.toLowerCase().startsWith("pant ")) {
        continue;
      }
      if (p.name.toLowerCase() === "pant") {
        continue;
      }
      cleaned.push(p);
    }
    return cleaned;
  }

  async fetchProductByName(productName: string): Promise<DBProduct | null> {
    const q = await this.query("SELECT * FROM products WHERE name = $1", [
      productName,
    ]);
    if (q.rows.length > 0) {
      return {
        id: q.rows[0][0] as string,
        name: q.rows[0][1] as string,
        unit: q.rows[0][2] as string,
      } as DBProduct;
    }
    return null;
  }

  async insertPurchase(purchase: DBPurchase): Promise<ResultRecord<any>> {
    if (!this.postgresClient) {
      await this.connect();
    }
    const q = await this.query(
      "INSERT INTO purchases (receipt_id, product_id, amount, unit_price, total_price, datetime) VALUES ($1, $2, $3, $4, $5, to_timestamp($6))",
      [
        purchase.receipt_id,
        purchase.product_id,
        purchase.amount,
        purchase.unit_price,
        purchase.total_price,
        purchase.datetime.getTime() / 1000,
      ]
    );
    return q;
  }

  async fetchPurchasesByReceiptID(receiptID: string): Promise<DBPurchase[]> {
    const q = await this.query(
      "SELECT * FROM purchases WHERE receipt_id = $1",
      [receiptID]
    );
    return q.rows.map(
      (r) =>
        ({
          id: r[0] as string,
          receipt_id: r[1] as string,
          product_id: r[2] as string,
          amount: r[3] as number,
          unit_price: r[4] as number,
          total_price: r[5] as number,
          datetime: new Date(r[6]),
        } as DBPurchase)
    );
  }

  async fetchPurchasesByProductID(productID: string): Promise<DBPurchase[]> {
    const q = await this.query(
      "SELECT * FROM purchases WHERE product_id = $1",
      [productID]
    );
    return q.rows.map(
      (r) =>
        ({
          id: r[0] as string,
          receipt_id: r[1] as string,
          product_id: r[2] as string,
          amount: r[3] as number,
          unit_price: r[4] as number,
          total_price: r[5] as number,
          datetime: new Date(r[6]),
        } as DBPurchase)
    );
  }

  async fetchPurchaseByID(purchaseID: string): Promise<DBPurchase | null> {
    const q = await this.query("SELECT * FROM purchases WHERE id = $1", [
      purchaseID,
    ]);
    if (q.rows.length > 0) {
      return {
        id: q.rows[0][0] as string,
        receipt_id: q.rows[0][1] as string,
        product_id: q.rows[0][2] as string,
        amount: q.rows[0][3] as number,
        unit_price: q.rows[0][4] as number,
        total_price: q.rows[0][5] as number,
        datetime: new Date(q.rows[0][6]),
      } as DBPurchase;
    }
    return null;
  }

  async insertReceiptSourceFile(
    receiptType: ReceiptSourceFileType,
    md5: string,
    base64: string
  ): Promise<ResultRecord<any>> {
    if (!this.postgresClient) {
      await this.connect();
    }
    const q = await this.query(
      "INSERT INTO receipt_source_files (receiptType, md5, base64, uploaded) VALUES ($1, $2, $3, to_timestamp($4))",
      [receiptType, md5, base64, new Date().getTime() / 1000]
    );
    return q;
  }

  async getReceiptSourceFileByMD5(
    md5: string
  ): Promise<DBReceiptSourceFile | null> {
    const q = await this.query(
      "SELECT * FROM receipt_source_files WHERE md5 = $1",
      [md5]
    );
    if (q.rows.length > 0) {
      return {
        id: q.rows[0][0] as string,
        type: q.rows[0][1] as ReceiptSourceFileType,
        md5: q.rows[0][2] as string,
        base64: q.rows[0][3] as string,
        uploaded: new Date(q.rows[0][4]),
      } as DBReceiptSourceFile;
    }
    return null;
  }

  async getReceiptSourceFileByID(
    id: string
  ): Promise<DBReceiptSourceFile | null> {
    const q = await this.query(
      "SELECT * FROM receipt_source_files WHERE id = $1",
      [id]
    );
    if (q.rows.length > 0) {
      return {
        id: q.rows[0][0] as string,
        type: q.rows[0][1] as ReceiptSourceFileType,
        md5: q.rows[0][2] as string,
        base64: q.rows[0][3] as string,
        uploaded: new Date(q.rows[0][4]),
      } as DBReceiptSourceFile;
    }
    return null;
  }

  /*
  async fetchGameIDFromGameName(gameName: string): Promise<number | null> {
    try {
      const result = await this.postgresClient!.query(
        "SELECT id FROM game WHERE name = $1",
        [gameName]
      );
      if (result.rows.length > 0) {
        return result.rows[0][0] as number;
      }
    } catch (error) {
      this.logger.error("Error fetching data:", error);
    }
    return null;
  }
*/
}
