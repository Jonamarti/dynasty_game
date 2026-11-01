// Type declarations for the sibling ESM runtime guard (Node resolves .mjs to .d.mts).
export declare const PINNED_NODE: '22.23.3';

export interface RuntimeRecord {
  schema: 1;
  kind: string;
  node: string;
  v8: string;
  platform: string;
  arch: string;
  required_node: typeof PINNED_NODE;
  compatible: boolean;
}

export declare function runtimeRecord(
  kind: string,
  versions?: Pick<NodeJS.ProcessVersions, 'node' | 'v8'>,
  platform?: string,
  arch?: string,
): RuntimeRecord;

export declare function assertSupportedRuntime(
  versions?: Pick<NodeJS.ProcessVersions, 'node' | 'v8'>,
): RuntimeRecord;
