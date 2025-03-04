import { STATICS } from ".";
import { DBProduct, DBPurchase, DBStore } from "./models";

export class Product {
  id: string;
  name: string;
  unit: string;
  purchases: DBPurchase[] = [];
  constructor(id: string, name: string, unit: string) {
    this.id = id;
    this.name = name;
    this.unit = unit;
  }

  static async fromDB(db: DBProduct): Promise<Product> {
    const p = new Product(db.id, db.name, db.unit);
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

  async chartUnitPriceOverTime() {
    const dates: Record<string, number> = {};
    for (const p of this.purchases) {
      dates[p.datetime.toISOString()] = p.unit_price;
    }
    return {
      labels: Object.keys(dates),
      values: Object.values(dates),
    };
  }

  getChart(): string {
    return `
    <canvas id="myChart"></canvas>
    <script>
      document.addEventListener("DOMContentLoaded", function () {
      fetch("/product/${this.id}/chartUnitPriceOverTime")
        .then(res => res.json())
        .then(data => {
        const ctx = document.getElementById("myChart").getContext("2d");
        new Chart(ctx, {
          type: "line",
          data: {
          labels: data.labels,
          datasets: [{
            label: 'Unit Price',
            data: data.values,
            borderWidth: 3, // Thicker lines
            pointRadius: 5, // Bigger dots
          }]
          },
          options: {
          responsive: true,
          plugins: {
            legend: {
            display: false
            }
          },
          scales: {
            x: {
            type: 'time',
            time: {
              unit: 'month'
            },
            },
            y: {
              min: Math.max(Math.min(...data.values) - 2, 0),
              max: Math.max(...data.values) + 2
            }
          }
          }
        });
        })
        .catch(err => console.error("Failed to load chart data:", err));
      });
    </script>`;
  }
}
