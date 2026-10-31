// Surface minimale de Bun et de Node utilisée par les scripts de dev : évite d'installer @types/bun
// (zéro dépendance). Les valeurs sont volontairement larges — le typage fort vit dans les modules métier.
declare module 'bun' {
  export interface ServerWebSocket<T = unknown> {
    data: T;
    send(message: string | ArrayBufferLike): number;
    close(code?: number, reason?: string): void;
  }
}

declare const Bun: {
  serve(options: Record<string, any>): { port: number; stop(force?: boolean): Promise<void> };
  file(path: string): Blob & { exists(): Promise<boolean>; text(): Promise<string>; json(): Promise<any> };
  write(path: string, data: string | Blob | ArrayBufferLike): Promise<number>;
  spawn(command: string[], options?: Record<string, any>): any;
  spawnSync(command: string[], options?: Record<string, any>): { stdout: { toString(): string } };
  sleep(ms: number): Promise<void>;
};

declare const process: {
  env: Record<string, string | undefined>;
  platform: string;
  pid: number;
  argv: string[];
  exit(code?: number): never;
  on(event: string, listener: (...args: any[]) => void): void;
  stdout: { write(text: string): boolean };
};

interface ImportMeta {
  dir: string;
  main: boolean;
}

declare module 'node:crypto' {
  export function createHash(algorithm: string): { update(data: Uint8Array | string): { digest(encoding: 'hex'): string } };
}

declare module 'node:fs/promises' {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  export function readFile(path: string): Promise<Uint8Array>;
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
  export function rename(from: string, to: string): Promise<void>;
  export function rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
  export function writeFile(path: string, data: string | Uint8Array): Promise<void>;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
}
