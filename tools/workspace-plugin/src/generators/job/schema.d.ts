import type { GeneratorSchema } from '../shared';

export interface JobGeneratorSchema extends GeneratorSchema {
  readonly queue?: string;
}
