export type Transaction = {
  commit(): Promise<void>;
  rollback(): Promise<void>;
};
