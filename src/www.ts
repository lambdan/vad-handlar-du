import { join } from "path";
import { readFile } from "fs/promises";
import { Product } from "./product";
import { STATICS } from ".";
import { Logger } from "./logger";
import { Receipt } from "./receipt";

const APP_VERSION = require("../package.json").version;

export class www {
  private logger = new Logger("www");
  constructor() {}

  async constructHTML(
    content: string,
    title = "Playtime tracking using Discord"
  ): Promise<string> {
    let header = await readFile(
      join(__dirname, "../static/_header.html"),
      "utf-8"
    );
    //header = header.replace("<%TITLE%>", sanitizeHTML(title));
    let footer = await readFile(
      join(__dirname, "../static/_footer.html"),
      "utf-8"
    );
    footer = footer.replace("<%VERSION%>", APP_VERSION);
    return (
      header +
      content +
      footer +
      `<!--- Constructed ${new Date().toISOString()} -->`
    );
  }

  async frontPage(): Promise<string> {
    let html = await readFile(
      join(__dirname, "../static/frontpage.html"),
      "utf-8"
    );

    let TR = "";

    // Fetch all receipts, and group them by month
    const receipts = await STATICS.pg.fetchReceipts();
    // Sort by date (newest first)

    receipts.sort((a, b) => {
      return b.date.getTime() - a.date.getTime();
    });

    const groupedReceipts = new Map<string, Receipt[]>();
    for (const r of receipts) {
      const receipt = await Receipt.fromDB(r);
      const year = receipt.date.toISOString().split("-")[0];
      const month = receipt.date.toISOString().split("-")[1];
      const ym = `${year}-${month}`;
      if (!groupedReceipts.has(ym)) {
        groupedReceipts.set(ym, []);
      }
      groupedReceipts.get(ym)!.push(receipt);
    }

    for (const [ym, receipts] of groupedReceipts) {
      TR += `<tr>`;
      TR += `<td>${ym}</td>`;
      TR += `<td>${receipts.length}</td>`;
      let total = 0;
      for (const r of receipts) {
        total += r.total;
      }
      TR += `<td>${total.toFixed(2)}</td>`;
    }

    html = html.replaceAll("<%TABLE_ROWS%>", TR);
    return await this.constructHTML(html);
  }

  async importPage(): Promise<string> {
    let html = await readFile(
      join(__dirname, "../static/import.html"),
      "utf-8"
    );

    return await this.constructHTML(html);
  }

  async errorPage(msg: string, title = "Error"): Promise<string> {
    let html = await readFile(join(__dirname, "../static/error.html"), "utf-8");
    html = html.replace("<%TITLE%>", title);
    html = html.replace("<%MSG%>", msg);
    return await this.constructHTML(html, "Error");
  }

  async productsPage(): Promise<string> {
    let html = await readFile(
      join(__dirname, "../static/products.html"),
      "utf-8"
    );

    let TR = "";
    const products = await STATICS.pg.fetchProducts();
    products.reverse();
    let totalSpent = 0;
    let totalPurchased = 0;
    // Sort by recency

    for (const p of products) {
      const product = await Product.fromDB(p);

      totalSpent += product.totalSpent();
      totalPurchased += product.amountPurchased();

      TR += `<tr>`;
      TR += `<td>${product.name}</td>`;
      TR += `<td>${product.timesPurchased()}</td>`;

      // Amount (decimals for weights)
      if (product.unit == "KG") {
        TR += `<td>${product.amountPurchased().toFixed(1)} ${
          product.unit
        }</td>`;
      } else {
        TR += `<td>${product.amountPurchased()} ${product.unit}</td>`;
      }

      TR += `<td>${product.totalSpent().toFixed(2)}</td>`;

      TR += `<td sorttable_customkey="${product
        .lastPurchased()
        .getTime()}">${product.lastPurchased().toUTCString()}</td>`;
      TR += `<td >${product.lowestPrice()}</td>`;
      TR += `<td>${product.highestPrice()}</td>`;
    }
    html = html.replaceAll("<%TABLE_ROWS%>", TR);
    html = html.replaceAll("<%TOTAL_PURCHASES%>", totalPurchased.toFixed(0));
    html = html.replaceAll("<%TOTAL_SPENT%>", totalSpent.toFixed(2));
    html = html.replaceAll("<%PRODUCT_COUNT%>", products.length.toString());

    return await this.constructHTML(html);
  }

  async receiptsPage(): Promise<string> {
    let html = await readFile(
      join(__dirname, "../static/receipts.html"),
      "utf-8"
    );

    let totalSpent = 0;
    let TR = "";
    const receipts = await STATICS.pg.fetchReceipts();
    receipts.sort((a, b) => {
      return b.date.getTime() - a.date.getTime();
    });

    for (const r of receipts) {
      const receipt = await Receipt.fromDB(r);

      TR += `<tr>`;
      TR += `<td><a href="/receipt/${receipt.id}">${receipt.id}</a></td>`;
      TR += `<td sorttable_customkey="${receipt.date.getTime()}">${receipt.date.toUTCString()}</td>`;
      TR += `<td>${receipt.store?.name}</td>`;
      TR += `<td>${receipt.total.toFixed(2)}</td>`;

      totalSpent += receipt.total;
    }
    html = html.replaceAll("<%TABLE_ROWS%>", TR);

    html = html.replaceAll("<%TOTAL_SPENT%>", totalSpent.toFixed(2));

    html = html.replaceAll("<%RECEIPT_COUNT%>", receipts.length.toString());

    return await this.constructHTML(html);
  }

  async receiptPage(id: string): Promise<string> {
    const receipt = await STATICS.pg.fetchReceiptByID(id);
    if (!receipt) {
      return await this.errorPage("Receipt not found");
    }

    let html = await readFile(
      join(__dirname, "../static/receipt.html"),
      "utf-8"
    );

    const store = await STATICS.pg.fetchStoreByID(receipt.store_id);

    html = html.replaceAll("<%RECEIPT_ID%>", receipt.id);
    html = html.replaceAll("<%SOURCE_FILE_ID%>", receipt.source_file_id);
    html = html.replaceAll("<%DATE%>", receipt.date.toUTCString());
    html = html.replaceAll("<%IMPORTED%>", receipt.imported.toUTCString());
    html = html.replaceAll("<%STORE%>", store?.name || "Unknown");

    const purchases = await STATICS.pg.fetchPurchasesByReceiptID(receipt.id);

    let TR = "";

    for (const p of purchases) {
      const product = await STATICS.pg.fetchProductByID(p.product_id);
      if (!product) {
        this.logger.error("Product not found", p.product_id);
        continue;
      }

      TR += "<tr>";
      TR += `<td>${product.name}</td>`;
      TR += `<td>${p.amount} ${product.unit}</td>`;
      TR += `<td>${p.unit_price.toFixed(2)}</td>`;
      TR += `<td>${p.total_price.toFixed(2)}</td>`;
      TR += "</tr>";
    }

    html = html.replaceAll("<%TABLE_ROWS%>", TR);

    html = html.replaceAll("<%TOTAL%>", receipt.total.toFixed(2));

    return await this.constructHTML(html);
  }
}
