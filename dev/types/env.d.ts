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
  argv: string[];
  exit(code?: number): never;
  on(event: string, listener: (...args: any[]) => void): void;
  stdout: { write(text: string): boolean };
};

interface ImportMeta {
  dir: string;
  main: boolean;
}
