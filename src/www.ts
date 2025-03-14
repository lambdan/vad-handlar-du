import { join } from "path";
import { readFile } from "fs/promises";
import { Product } from "./product";
import { STATICS } from ".";
import { Logger } from "./logger";
import { Receipt } from "./receipt";
import { monthlySpending } from "./charts";

const APP_VERSION = require("../package.json").version;

export class www {
  private logger = new Logger("www");
  constructor() {}

  async constructHTML(content: string): Promise<string> {
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

    let totalSpent = 0;
    let totalReceipts = 0;

    for (const [ym, receipts] of groupedReceipts) {
      TR += `<tr>`;
      TR += `<td>${ym}</td>`;
      TR += `<td>${receipts.length}</td>`;
      let total = 0;
      for (const r of receipts) {
        total += r.total;
      }
      TR += `<td>${total.toFixed(2)}</td>`;
      TR += `</tr>`;
      totalSpent += total;
      totalReceipts += receipts.length;
    }

    html = html.replaceAll("<%TABLE_ROWS%>", TR);
    html = html.replaceAll("<%TOTAL_SPENT%>", totalSpent.toFixed(2));
    html = html.replaceAll("<%TOTAL_RECEIPTS%>", totalReceipts.toString());

    const monthlyData = await monthlySpending();

    const chart = `
      <canvas id="myChart"></canvas>
      <script>
      document.addEventListener("DOMContentLoaded", function () {
        const data = ${JSON.stringify(monthlyData)};
        const ctx = document.getElementById("myChart").getContext("2d");
        new Chart(ctx, {
          type: "bar",
          data: {
          labels: data.keys,
          datasets: [{
            label: "Spending",
            data: data.values,
          }]
          },
          options: {
          responsive: true,
          }
      });
      });
      </script>`;

    html = html.replaceAll("<%CHART%>", chart);

    return await this.constructHTML(html);
  }

  async importPage(): Promise<string> {
    let html = await readFile(
      join(__dirname, "../static/import.html"),
      "utf-8"
    );

    return await this.constructHTML(html);
  }

  async genericPage(htmlContent: string): Promise<string> {
    let html = await readFile(
      join(__dirname, "../static/generic.html"),
      "utf-8"
    );

    html = html.replace("<%MSG%>", htmlContent);
    return await this.constructHTML(html);
  }

  async errorPage(msg: string, title = "Error"): Promise<string> {
    let html = await readFile(join(__dirname, "../static/error.html"), "utf-8");
    html = html.replace("<%TITLE%>", title);
    html = html.replace("<%MSG%>", msg);
    return await this.constructHTML(html);
  }

  async productsPage(): Promise<string> {
    let html = await readFile(
      join(__dirname, "../static/products.html"),
      "utf-8"
    );

    let TR = "";
    const dbProducts = await STATICS.pg.fetchProducts();
    dbProducts.reverse();
    let totalSpent = 0;
    let totalPurchased = 0;

    const products = await Promise.all(
      dbProducts.map((p) => Product.fromDB(p))
    );

    products.sort((a, b) => {
      return b.lastPurchased().getTime() - a.lastPurchased().getTime();
    });

    for (const product of products) {
      totalSpent += product.totalSpent();
      totalPurchased += product.amountPurchased();

      TR += `<tr>`;
      TR += `<td><a href="/product/${product.id}">${product.name}</a><br><small class="text-muted">${product.sku}</small></td>`;
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
      TR += `<td title="${product.lowestPrice().date.toUTCString()}">${product
        .lowestPrice()
        .price.toFixed(2)}</td>`;
      TR += `<td title="${product.highestPrice().date.toUTCString()}">${product
        .highestPrice()
        .price.toFixed(2)}</td>`;
      TR += `<td >${product.differenceLowestHighest().toFixed(2)}</td>`;
    }
    html = html.replaceAll("<%TABLE_ROWS%>", TR);
    html = html.replaceAll("<%TOTAL_PURCHASES%>", totalPurchased.toFixed(0));
    html = html.replaceAll("<%TOTAL_SPENT%>", totalSpent.toFixed(2));
    html = html.replaceAll("<%PRODUCT_COUNT%>", dbProducts.length.toString());

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
      TR += `<td><a href="/product/${product.id}">${product.name}</a></td>`;
      TR += `<td class="text-muted">${product.sku}</td>`;
      TR += `<td>${p.amount} ${product.unit}</td>`;
      TR += `<td>${p.unit_price.toFixed(2)}</td>`;
      TR += `<td>${p.total_price.toFixed(2)}</td>`;
      TR += "</tr>";
    }

    html = html.replaceAll("<%TABLE_ROWS%>", TR);

    html = html.replaceAll("<%TOTAL%>", receipt.total.toFixed(2));

    return await this.constructHTML(html);
  }

  async productPage(id: string): Promise<string> {
    const dbProduct = await STATICS.pg.fetchProductByID(id);
    if (!dbProduct) {
      return await this.errorPage("Product not found");
    }

    const product = await Product.fromDB(dbProduct);

    let html = await readFile(
      join(__dirname, "../static/product.html"),
      "utf-8"
    );

    html = html.replaceAll("<%PRODUCT_ID%>", product.id);
    html = html.replaceAll("<%PRODUCT_NAME%>", product.name);
    html = html.replaceAll("<%SKU%>", product.sku);
    html = html.replaceAll(
      "<%FIRST_PURCHASED%>",
      product.firstPurchased().toUTCString()
    );
    html = html.replaceAll(
      "<%LAST_PURCHASED%>",
      product.lastPurchased().toUTCString()
    );

    html = html.replaceAll(
      "<%TIMES_PURCHASED%>",
      product.timesPurchased().toString()
    );

    html = html.replaceAll(
      "<%AMOUNT_PURCHASED%>",
      product.amountPurchased().toString() + " " + product.unit
    );

    html = html.replaceAll("<%TOTAL_SPENT%>", product.totalSpent().toFixed(2));

    html = html.replaceAll(
      "<%LOWEST_PRICE%>",
      product.lowestPrice().price.toFixed(2)
    );
    html = html.replaceAll(
      "<%LOWEST_PRICE_DATE%>",
      product.lowestPrice().date.toUTCString()
    );

    html = html.replaceAll(
      "<%HIGHEST_PRICE%>",
      product.highestPrice().price.toFixed(2)
    );

    html = html.replaceAll(
      "<%HIGHEST_PRICE_DATE%>",
      product.highestPrice().date.toUTCString()
    );

    html = html.replaceAll(
      "<%CHART%>",
      await product.chart_productCostOverTime()
    );

    let receiptList = "";
    product.purchases.sort((a, b) => {
      return b.datetime.getTime() - a.datetime.getTime();
    });
    for (const p of product.purchases) {
      receiptList += `<li><a href="/receipt/${p.receipt_id}">${p.receipt_id}</a></li>`;
    }
    html = html.replaceAll("<%RECEIPT_LIST%>", receiptList);

    const mergeCandiates = await STATICS.pg.fetchProducts();
    mergeCandiates.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });
    html = html.replaceAll(
      "<%PRODUCT_OPTIONS%>",
      mergeCandiates
        .map((p) => {
          return `<option value="${p.id}">${p.name}</option>`;
        })
        .join("")
    );

    return await this.constructHTML(html);
  }
}
