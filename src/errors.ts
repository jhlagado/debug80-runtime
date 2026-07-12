export class HexParseError extends Error {
  readonly line?: number;
  readonly content: string;

  constructor(content: string, line?: number) {
    super(`Invalid HEX line: ${content}`);
    this.name = 'HexParseError';
    this.content = content;
    if (line !== undefined) {
      this.line = line;
    }
  }
}
