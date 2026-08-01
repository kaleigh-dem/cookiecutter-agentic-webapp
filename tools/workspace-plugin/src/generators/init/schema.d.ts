export type WorkspaceApplication = 'api' | 'web' | 'worker';
export type AuthenticationProfile =
  | 'development'
  | 'none'
  | 'oidc'
  | 'session';
export type WorkerTransport = 'none' | 'postgres' | 'redis';
export type DeploymentProfile = 'containers' | 'kubernetes' | 'local';

export interface InitGeneratorSchema {
  readonly applicationSlug: string;
  readonly displayName?: string;
  readonly packageScope: string;
  readonly repositoryOwner: string;
  readonly codeowners?: string | readonly string[];
  readonly applications?: string | readonly WorkspaceApplication[];
  readonly webPort?: number;
  readonly apiPort?: number;
  readonly databasePort?: number;
  readonly databaseName?: string;
  readonly authentication?: AuthenticationProfile;
  readonly workerTransport?: WorkerTransport;
  readonly telemetry?: boolean;
  readonly deploymentProfile?: DeploymentProfile;
  readonly ai?: boolean;
  readonly skipFormat?: boolean;
}
