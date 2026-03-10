import { Injectable } from '@angular/core';

interface RuntimeEnv {
  FRONTEND_VERSION?: unknown;
  BACKEND_VERSION?: unknown;
  EXAFLOW_VERSION?: unknown;
  MIP_VERSION?: unknown;
}

export interface RuntimeVersionEntry {
  label: string;
  value: string;
}

interface RuntimeVersions {
  frontend: string | null;
  backend: string | null;
  exaflow: string | null;
  mip: string | null;
}

@Injectable({ providedIn: 'root' })
export class RuntimeEnvService {
  private readonly runtimeEnv = this.readRuntimeEnv();

  readonly versions = this.readVersions();
  readonly versionEntries = this.buildVersionEntries();
  readonly mipVersion = this.versions.mip;

  private readRuntimeEnv(): RuntimeEnv {
    if (typeof window === 'undefined') {
      return {};
    }

    return (window as Window & { __env?: RuntimeEnv }).__env ?? {};
  }

  private readVersions(): RuntimeVersions {
    return {
      frontend: this.readVersion('FRONTEND_VERSION', 'Frontend'),
      backend: this.readVersion('BACKEND_VERSION', 'Backend'),
      exaflow: this.readVersion('EXAFLOW_VERSION', 'Exaflow'),
      mip: this.readVersion('MIP_VERSION', 'MIP'),
    };
  }

  private buildVersionEntries(): RuntimeVersionEntry[] {
    const entries = [
      { label: 'Frontend', value: this.versions.frontend },
      { label: 'Backend', value: this.versions.backend },
      { label: 'Exaflow', value: this.versions.exaflow },
      { label: 'MIP', value: this.versions.mip },
    ];

    return entries.filter((entry): entry is RuntimeVersionEntry => entry.value !== null);
  }

  private readVersion(key: keyof RuntimeEnv, label: string): string | null {
    const value = this.readString(key);
    if (value) {
      return value;
    }

    console.warn(
      `[RuntimeEnv] Expected ${label} version in window.__env.${key}, but it was not provided. The UI will hide that version until it is set.`
    );
    return null;
  }

  private readString(key: keyof RuntimeEnv): string | null {
    const rawValue = this.runtimeEnv[key];
    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    const value = String(rawValue).trim();
    return value.length > 0 ? value : null;
  }
}
