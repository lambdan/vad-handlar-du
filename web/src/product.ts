import { STATICS } from ".";
import { DBProduct, DBPurchase } from "./models";

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

  lowestPrice(): number {
    let lowest = Number.MAX_VALUE;
    for (const p of this.purchases) {
      if (p.unit_price < lowest) {
        lowest = p.unit_price;
      }
    }
    return lowest;
  }

  highestPrice(): number {
    let highest = 0;
    for (const p of this.purchases) {
      if (p.unit_price > highest) {
        highest = p.unit_price;
      }
    }
    return highest;
  }
}
