export interface D8Symbol {
  name: string;
  address: number;
}

type D8FileEntry = {
  symbols?: unknown;
};

type D8MapLike = {
  files?: Record<string, D8FileEntry>;
};

/** Language-neutral symbol lookup over the public D8 map structure. */
export class D8Symbols {
  private readonly byName = new Map<string, number[]>();

  constructor(debugMap: unknown) {
    if (debugMap === null || typeof debugMap !== 'object') {
      return;
    }
    const files = (debugMap as D8MapLike).files;
    if (files === undefined || files === null || typeof files !== 'object') {
      return;
    }
    for (const file of Object.values(files)) {
      if (!Array.isArray(file.symbols)) {
        continue;
      }
      for (const candidate of file.symbols) {
        if (candidate === null || typeof candidate !== 'object') {
          continue;
        }
        const symbol = candidate as Partial<D8Symbol>;
        if (typeof symbol.name !== 'string' || !Number.isInteger(symbol.address)) {
          continue;
        }
        const address = (symbol.address ?? 0) & 0xffff;
        const addresses = this.byName.get(symbol.name) ?? [];
        if (!addresses.includes(address)) {
          addresses.push(address);
        }
        this.byName.set(symbol.name, addresses);
      }
    }
  }

  address(name: string): number {
    const exact = this.byName.get(name);
    if (exact !== undefined) {
      return this.requireUnique(name, exact);
    }

    const folded = name.toLowerCase();
    const matches = [...this.byName.entries()].filter(
      ([candidate]) => candidate.toLowerCase() === folded
    );
    if (matches.length === 0) {
      throw new Error(`Unknown D8 symbol: ${name}`);
    }
    const addresses = [...new Set(matches.flatMap(([, values]) => values))];
    return this.requireUnique(name, addresses);
  }

  has(name: string): boolean {
    try {
      this.address(name);
      return true;
    } catch {
      return false;
    }
  }

  private requireUnique(name: string, addresses: number[]): number {
    if (addresses.length !== 1 || addresses[0] === undefined) {
      const rendered = addresses.map((address) => `0x${address.toString(16).padStart(4, '0')}`);
      throw new Error(`Ambiguous D8 symbol ${name}: ${rendered.join(', ')}`);
    }
    return addresses[0];
  }
}
