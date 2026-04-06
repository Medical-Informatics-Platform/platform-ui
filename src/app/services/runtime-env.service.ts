import { Injectable, isDevMode } from '@angular/core';

interface RuntimeEnv {
  MIP_VERSION?: unknown;
  GUIDE_COVARIATE?: unknown;
  GUIDE_VARIABLE?: unknown;
}

export interface RuntimeVersionEntry {
  label: string;
  value: string;
}

export interface RuntimeGuideTarget {
  value: string;
  label: string;
}

interface RuntimeVersions {
  mip: string | null;
}

@Injectable({ providedIn: 'root' })
export class RuntimeEnvService {
  private readonly runtimeEnv = this.readRuntimeEnv();

  readonly versions = this.readVersions();
  readonly versionEntries = this.buildVersionEntries();
  readonly mipVersion = this.versions.mip;
  readonly guideCovariate = this.readGuideTarget('GUIDE_COVARIATE', 'Sex');
  readonly guideVariable = this.readGuideTarget('GUIDE_VARIABLE', 'Age');

  private readRuntimeEnv(): RuntimeEnv {
    if (typeof window === 'undefined') {
      return {};
    }

    return (window as Window & { __env?: RuntimeEnv }).__env ?? {};
  }

  private readVersions(): RuntimeVersions {
    return {
      mip: this.readVersion('MIP_VERSION', 'MIP'),
    };
  }

  private buildVersionEntries(): RuntimeVersionEntry[] {
    const entries = [
      { label: 'Version', value: this.versions.mip },
    ];

    return entries.filter((entry): entry is RuntimeVersionEntry => entry.value !== null);
  }

  private readVersion(key: keyof RuntimeEnv, label: string): string | null {
    const value = this.readString(key);
    if (value) {
      return value;
    }

    if (isDevMode()) {
      return '9.0.0';
    }

    console.warn(
      `[RuntimeEnv] Expected ${label} version in window.__env.${key}, but it was not provided. The UI will hide that version until it is set.`
    );
    return null;
  }

  private readGuideTarget(key: keyof RuntimeEnv, fallback: string): RuntimeGuideTarget {
    const value = this.readString(key) ?? fallback;

    return {
      value,
      label: this.formatGuideTargetLabel(value),
    };
  }

  private readString(key: keyof RuntimeEnv): string | null {
    const rawValue = this.runtimeEnv[key];
    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    const value = String(rawValue).trim();
    return value.length > 0 ? value : null;
  }

  private formatGuideTargetLabel(value: string): string {
    const normalized = value
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ');

    if (!normalized) {
      return value;
    }

    return normalized
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
