import { STATICS } from ".";
import { DBProduct, DBPurchase, DBStore } from "./models";

export class Product {
  id: string;
  sku: string;
  name: string;
  unit: string;
  purchases: DBPurchase[] = [];
  constructor(id: string, name: string, unit: string, sku: string) {
    this.id = id;
    this.name = name;
    this.unit = unit;
    this.sku = sku;
  }

  static async fromDB(db: DBProduct): Promise<Product> {
    const p = new Product(db.id, db.name, db.unit, db.sku);
    p.purchases = await STATICS.pg.fetchPurchasesByProductID(db.id);

    // sort dates
    p.purchases.sort((a, b) => {
      return a.datetime.getTime() - b.datetime.getTime();
    });

    return p;
  }

  amountPurchased(): number {
    let sum = 0;
    for (const p of this.purchases) {
      sum += p.amount;
    }
    return sum;
  }

  timesPurchased(): number {
    return this.purchases.length;
  }

  firstPurchased(): Date {
    let first = new Date();
    for (const p of this.purchases) {
      if (p.datetime < first) {
        first = p.datetime;
      }
    }
    return first;
  }

  lastPurchased(): Date {
    let last = new Date(0);
    for (const p of this.purchases) {
      if (p.datetime > last) {
        last = p.datetime;
      }
    }
    return last;
  }

  /* Returns when the product was the cheapest, and when */
  lowestPrice(): { price: number; date: Date } {
    let price = Number.MAX_VALUE;
    let date = new Date();
    for (const p of this.purchases) {
      if (p.unit_price < price) {
        price = p.unit_price;
        date = p.datetime;
      }
    }
    return { price, date };
  }

  /** Returns when the product was the most expensive, and when */
  highestPrice(): { price: number; date: Date } {
    let price = 0;
    let date = new Date();
    for (const p of this.purchases) {
      if (p.unit_price > price) {
        price = p.unit_price;
        date = p.datetime;
      }
    }
    return { price, date };
  }

  averagePrice(): number {
    return this.totalSpent() / this.amountPurchased();
  }

  /* Difference in lowest and highest price (i.e. biggest price increase) */
  differenceLowestHighest(): number {
    return this.highestPrice().price - this.lowestPrice().price;
  }

  totalSpent(): number {
    let total = 0;
    for (const p of this.purchases) {
      total += p.total_price;
    }
    return total;
  }

  async storesPurchasedAt(): Promise<DBStore[]> {
    const storeIDs = new Set<string>();
    const stores = new Array<DBStore>();
    for (const p of this.purchases) {
      const receipt = await STATICS.pg.fetchReceiptByID(p.receipt_id);
      const store = await STATICS.pg.fetchStoreByID(receipt!.store_id);
      if (!store) {
        continue;
      }
      if (store.id && !storeIDs.has(store.id)) {
        stores.push(store);
        storeIDs.add(store.id);
      }
    }
    return stores;
  }

  async chart_productCostOverTime(): Promise<string> {
    const data: {
      date: string;
      unit_price: number;
      store: string;
      color: string;
    }[] = [];

    for (const p of this.purchases) {
      const db_receipt = await STATICS.pg.fetchReceiptByID(p.receipt_id)!;
      const db_store = await STATICS.pg.fetchStoreByID(db_receipt!.store_id)!;

      data.push({
        date: p.datetime.toISOString(),
        unit_price: p.unit_price,
        store: db_store!.name,
        color: db_store!.color(),
      });
    }

    const yMin = Math.max(0, this.lowestPrice().price * 0.9);
    const yMax = this.highestPrice().price * 1.1;

    return `
    <canvas id="myChart"></canvas>
    <script>
        const data = ${JSON.stringify(data)}; 
          const ctx = document.getElementById("myChart").getContext("2d");
          const stores = [...new Set(data.map(d => d.store))];
          const datasets = stores.map(store => ({
            label: store,
            data: data.filter(d => d.store === store).map(d => ({ x: d.date, y: d.unit_price })),
            borderColor: data.find(d => d.store === store).color,
            borderWidth: 4,
            pointRadius: 6,
          }));

          new Chart(ctx, {
            type: "line",
            data: {
              datasets: datasets
            },
            options: {
              responsive: true,
              
              scales: {
                x: {
                  type: 'time',
                  time: {
                    unit: 'month'
                  },
                },
                y: {
                  min: ${yMin},
                  max: ${yMax}
                }
              }
            }
          });

    </script>`;
  }
}
