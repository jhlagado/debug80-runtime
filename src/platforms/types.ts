/**
 * @file Platform configuration types shared across runtimes.
 */

export interface SimpleMemoryRegion {
  start: number;
  end: number;
  kind?: 'rom' | 'ram' | 'unknown';
  readOnly?: boolean;
}

export interface SimplePlatformConfig {
  regions?: SimpleMemoryRegion[];
  appStart?: number;
  entry?: number;
  binFrom?: number;
  binTo?: number;
}

export interface SimplePlatformConfigNormalized {
  regions: SimpleMemoryRegion[];
  romRanges: Array<{ start: number; end: number }>;
  appStart: number;
  entry: number;
  binFrom: number | undefined;
  binTo: number | undefined;
}

export interface Tec1PlatformConfig {
  regions?: SimpleMemoryRegion[];
  appStart?: number;
  entry?: number;
  romHex?: string;
  ramInitHex?: string;
  updateMs?: number;
  yieldMs?: number;
}

export interface Tec1PlatformConfigNormalized {
  regions: SimpleMemoryRegion[];
  romRanges: Array<{ start: number; end: number }>;
  appStart: number;
  entry: number;
  romHex?: string;
  ramInitHex?: string;
  updateMs: number;
  yieldMs: number;
}

export interface Tec1gPlatformConfig {
  regions?: SimpleMemoryRegion[];
  appStart?: number;
  entry?: number;
  romHex?: string;
  ramInitHex?: string;
  updateMs?: number;
  yieldMs?: number;
  gimpSignal?: boolean;
  expansionBankHi?: boolean;
  matrixMode?: boolean;
  protectOnReset?: boolean;
  rtcEnabled?: boolean;
  sdEnabled?: boolean;
  sdImagePath?: string;
  sdHighCapacity?: boolean;
  expansionRomHex?: string;
  romArtifacts?: Tec1gRomArtifactConfig[];
  uiVisibility?: {
    tms9918?: boolean;
    glcd?: boolean;
    serial?: boolean;
    matrix?: boolean;
  };
}

export interface Tec1gPlatformConfigNormalized {
  regions: SimpleMemoryRegion[];
  romRanges: Array<{ start: number; end: number }>;
  appStart: number;
  entry: number;
  romHex?: string;
  ramInitHex?: string;
  updateMs: number;
  yieldMs: number;
  gimpSignal: boolean;
  expansionBankHi: boolean;
  matrixMode: boolean;
  protectOnReset: boolean;
  rtcEnabled: boolean;
  sdEnabled: boolean;
  sdImagePath?: string;
  sdHighCapacity: boolean;
  expansionRomHex?: string;
  tms9918Active?: boolean;
}

export type Tec1gRomArtifactRole = 'monitor' | 'expansion';

export interface Tec1gRomArtifactBankSelectConfig {
  kind?: 'tec1g-standard';
  initialBank?: number;
}

export interface Tec1gExpansionRomArtifactBankConfig {
  physicalBank: number;
  sourceFile: string;
  outputBin: string;
  outputDebugMap?: string;
}

export type Tec1gExpansionRomArtifactPackedOutputLayout = 'contiguous' | 'physical';

export interface Tec1gExpansionRomArtifactPackedOutputConfig {
  id: string;
  kind: 'packed';
  outputBin: string;
  banks: number[];
  layout?: Tec1gExpansionRomArtifactPackedOutputLayout;
}

export interface Tec1gExpansionRomArtifactPerBankOutputConfig {
  id: string;
  kind: 'perBank';
  outputDir: string;
  banks: number[];
}

export type Tec1gExpansionRomArtifactOutputConfig =
  Tec1gExpansionRomArtifactPackedOutputConfig | Tec1gExpansionRomArtifactPerBankOutputConfig;

interface Tec1gRomArtifactBaseConfig {
  id: string;
  role: Tec1gRomArtifactRole;
  active?: boolean;
  address?: number;
  size?: number;
  windowAddress?: number;
  windowSize?: number;
  imageSize?: number;
  bankSize?: number;
  bankCount?: number;
  build?: boolean;
  bankSelect?: Tec1gRomArtifactBankSelectConfig;
}

export interface Tec1gSourceRomArtifactConfig extends Tec1gRomArtifactBaseConfig {
  sourceFile: string;
  outputBin: string;
  outputDebugMap?: string;
  banks?: never;
  outputs?: never;
  binary?: never;
  debugMap?: never;
}

export interface Tec1gMultibankExpansionRomArtifactConfig extends Tec1gRomArtifactBaseConfig {
  role: 'expansion';
  outputBin: string;
  banks: Tec1gExpansionRomArtifactBankConfig[];
  outputs?: Tec1gExpansionRomArtifactOutputConfig[];
  sourceFile?: never;
  outputDebugMap?: never;
  binary?: never;
  debugMap?: never;
}

export interface Tec1gInactiveBinaryRomArtifactConfig extends Tec1gRomArtifactBaseConfig {
  active: false;
  binary: string;
  debugMap?: string;
  sourceFile?: never;
  outputBin?: never;
  outputDebugMap?: never;
  banks?: never;
  outputs?: never;
}

export type Tec1gRomArtifactConfig =
  | Tec1gSourceRomArtifactConfig
  | Tec1gMultibankExpansionRomArtifactConfig
  | Tec1gInactiveBinaryRomArtifactConfig;
