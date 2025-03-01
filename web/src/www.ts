import { join } from "path";
import { readFile } from "fs/promises";
import { Product } from "./product";

import { STATICS } from ".";
import { Logger } from "./logger";

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
    //html = html.replace("<%CHART%>", STATICS.totals.getChart());
    let table = "";

    html = html.replace("<%CHART%>", table);
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
    for (const p of products) {
      const product = await Product.fromDB(p);
      TR += `<tr>`;
      TR += `<td>${product.name}</td>`;
      TR += `<td>${product.timesPurchased()}</td>`;

      if (product.unit == "KG") {
        TR += `<td>${product.amountPurchased().toFixed(1)} ${
          product.unit
        }</td>`;
      } else {
        TR += `<td>${product.amountPurchased()} ${product.unit}</td>`;
      }

      TR += `<td sorttable_customkey="${product
        .lastPurchased()
        .getTime()}">${product.lastPurchased().toUTCString()}</td>`;
      TR += `<td >${product.lowestPrice()}</td>`;
      TR += `<td>${product.highestPrice()}</td>`;
    }
    html = html.replaceAll("<%TABLE_ROWS%>", TR);

    return await this.constructHTML(html);
  }
}
