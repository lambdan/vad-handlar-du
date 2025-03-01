export class Logger {
  identifier: string;

  constructor(identifier: string) {
    this.identifier = identifier;
  }

  date(): string {
    return new Date().toISOString();
  }

  log(...messages: any[]) {
    console.log(`${this.date()} [${this.identifier}]`, ...messages);
  }

  warn(...messages: any[]) {
    console.warn(`${this.date()} [${this.identifier}]`, ...messages);
  }

  error(...messages: any[]) {
    console.error(`${this.date()} [${this.identifier}]`, ...messages);
  }
}
