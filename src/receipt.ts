import { STATICS } from ".";
import {
  DBReceipt,
  DBReceiptSourceFile,
  ReceiptImport,
  ReceiptSourceFileType,
} from "./models";
import path from "path";
import os from "os";
import fs from "fs/promises";

import { Logger } from "./logger";
import { spawn } from "child_process";

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
  source_file_id: string;
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
    this.source_file_id = sourcePdf;
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
      db.source_file_id,
      db.total
    );
    return r;
  }

  static async insertFromSourceFile(
    /** Source file ID */
    id: string,
    replace: boolean
  ): Promise<Receipt> {
    const src = await STATICS.pg.getReceiptSourceFileByID(id);
    if (!src) {
      throw new Error("Receipt not found");
    }

    let newReceipt: ReceiptImport | null = null;
    switch (src.type) {
      case ReceiptSourceFileType.PDF_COOP_V1:
        newReceipt = await Receipt.fromCoopV1PDF(src);
        break;
      case ReceiptSourceFileType.PDF_ICA_KIVRA_V1:
        newReceipt = await Receipt.fromICAKivraV1PDF(src);
        break;
      default:
        throw new Error("Unsupported source file type");
    }

    if (!newReceipt) {
      throw new Error("Failed to create receipt");
    }

    await STATICS.pg.importReceipt(newReceipt, replace);

    const exists2 = await STATICS.pg.fetchReceiptByID(newReceipt.id);

    if (!exists2) {
      throw new Error("Failed to insert receipt");
    }
    return Receipt.fromDB(exists2);
  }

  static async fromICAKivraV1PDF(
    src: DBReceiptSourceFile
  ): Promise<ReceiptImport> {
    const pdf = Buffer.from(src.base64, "base64");
    const pdf_path = path.join(os.tmpdir(), src.id);
    await fs.writeFile(pdf_path, pdf);

    let json = "";

    const proc = spawn("python3", ["pdf_parse_ica_kivra_v1.py", pdf_path]);

    await new Promise((resolve, reject) => {
      const pLog = new Logger("pdf_parse.py");
      proc.stdout.on("data", (data) => {
        pLog.log(data.toString());
        json += data;
      });
      proc.stderr.on("data", (data) => {
        pLog.error(data.toString());
      });
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Python script exited with code ${code}`));
        } else {
          resolve(null);
        }
      });
    });

    const parsed = JSON.parse(json) as ReceiptImport;
    parsed.source_file_id = src.id;
    return parsed;
  }

  static async fromCoopV1PDF(src: DBReceiptSourceFile): Promise<ReceiptImport> {
    // Reconstruct PDF from base64 and send it to the Python script
    const pdf = Buffer.from(src.base64, "base64");
    const pdf_path = path.join(os.tmpdir(), src.id);
    await fs.writeFile(pdf_path, pdf);

    let json = "";

    const proc = spawn("python3", ["pdf_parse_coop_v1.py", pdf_path]);

    await new Promise((resolve, reject) => {
      const pLog = new Logger("pdf_parse.py");
      proc.stdout.on("data", (data) => {
        pLog.log(data.toString());
        json += data;
      });
      proc.stderr.on("data", (data) => {
        pLog.error(data.toString());
      });
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Python script exited with code ${code}`));
        } else {
          resolve(null);
        }
      });
    });

    const parsed = JSON.parse(json) as ReceiptImport;
    parsed.source_file_id = src.id;
    return parsed;
  }
}
