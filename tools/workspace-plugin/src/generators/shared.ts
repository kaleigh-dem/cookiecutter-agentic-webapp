import {
  addProjectConfiguration,
  formatFiles,
  names,
  offsetFromRoot,
  readJson,
  Tree,
  writeJson,
} from '@nx/devkit';

export interface GeneratorSchema {
  readonly name: string;
  readonly skipFormat?: boolean;
}

export interface NormalizedName {
  readonly className: string;
  readonly fileName: string;
  readonly propertyName: string;
}

interface LibraryProjectOptions {
  readonly dependencies?: Record<string, string>;
  readonly importPath: string;
  readonly jsx?: boolean;
  readonly projectName: string;
  readonly projectRoot: string;
  readonly tags: string[];
}

export function normalizeGeneratorName(value: string): NormalizedName {
  const normalized = names(value.trim());
  if (!normalized.fileName) {
    throw new Error('A non-empty name is required.');
  }

  return {
    className: normalized.className,
    fileName: normalized.fileName,
    propertyName: normalized.propertyName,
  };
}

export function assertPathAvailable(tree: Tree, path: string): void {
  if (tree.exists(path)) {
    throw new Error(`Refusing to overwrite existing path: ${path}`);
  }
}

export function appendBarrelExport(
  tree: Tree,
  barrelPath: string,
  exportPath: string,
): void {
  const exportLine = `export * from '${exportPath}';`;
  const current = tree.exists(barrelPath)
    ? (tree.read(barrelPath, 'utf-8') ?? '')
    : '';

  if (current.split('\n').includes(exportLine)) {
    return;
  }

  const prefix =
    current.length === 0 || current.endsWith('\n') ? current : `${current}\n`;
  tree.write(barrelPath, `${prefix}${exportLine}\n`);
}

export function createLibraryProject(
  tree: Tree,
  options: LibraryProjectOptions,
): void {
  const { importPath, projectName, projectRoot, tags } = options;
  assertPathAvailable(tree, `${projectRoot}/project.json`);

  addProjectConfiguration(tree, projectName, {
    root: projectRoot,
    sourceRoot: `${projectRoot}/src`,
    projectType: 'library',
    tags,
    targets: {
      build: {
        executor: 'nx:run-commands',
        outputs: [`{workspaceRoot}/dist/${projectRoot}`],
        options: {
          command: `tsc -p ${projectRoot}/tsconfig.lib.json`,
        },
      },
      typecheck: {
        executor: 'nx:run-commands',
        options: {
          command: `tsc -p ${projectRoot}/tsconfig.lib.json --noEmit`,
        },
      },
      lint: {
        executor: 'nx:run-commands',
        options: {
          command: `eslint ${projectRoot}`,
        },
      },
      test: {
        executor: 'nx:run-commands',
        options: {
          command: `vitest run ${projectRoot}/src --passWithNoTests`,
        },
      },
    },
  });

  writeJson(tree, `${projectRoot}/package.json`, {
    name: importPath,
    version: '0.1.0',
    private: true,
    main: './src/index.ts',
    types: './src/index.ts',
    exports: {
      '.': {
        types: './src/index.ts',
        import: './src/index.ts',
        default: './src/index.ts',
      },
    },
    ...(options.dependencies ? { dependencies: options.dependencies } : {}),
  });

  writeJson(tree, `${projectRoot}/tsconfig.json`, {
    extends: `${offsetFromRoot(projectRoot)}tsconfig.base.json`,
    files: [],
    include: [],
    references: [{ path: './tsconfig.lib.json' }],
  });

  writeJson(tree, `${projectRoot}/tsconfig.lib.json`, {
    extends: `${offsetFromRoot(projectRoot)}tsconfig.base.json`,
    compilerOptions: {
      outDir: `${offsetFromRoot(projectRoot)}dist/${projectRoot}`,
      rootDir: 'src',
      types: ['node'],
      ...(options.jsx
        ? {
            jsx: 'preserve',
            lib: ['dom', 'dom.iterable', 'esnext'],
            types: ['node', 'react', 'react-dom'],
          }
        : {}),
    },
    include: options.jsx ? ['src/**/*.ts', 'src/**/*.tsx'] : ['src/**/*.ts'],
  });

  tree.write(
    `${projectRoot}/eslint.config.mjs`,
    `import baseConfig from '${offsetFromRoot(projectRoot)}eslint.config.mjs';\n\nexport default [...baseConfig];\n`,
  );

  addRootTsconfigReference(tree, projectRoot);
}

export function addRootTsconfigReference(
  tree: Tree,
  projectRoot: string,
): void {
  if (!tree.exists('tsconfig.json')) {
    return;
  }

  const rootTsconfig = readJson<{ references?: Array<{ path: string }> }>(
    tree,
    'tsconfig.json',
  );
  const path = `./${projectRoot}`;
  const references = rootTsconfig.references ?? [];

  if (!references.some((reference) => reference.path === path)) {
    references.push({ path });
    references.sort((left, right) => left.path.localeCompare(right.path));
  }

  writeJson(tree, 'tsconfig.json', {
    ...rootTsconfig,
    references,
  });
}

export async function formatGeneratorFiles(
  tree: Tree,
  skipFormat: boolean | undefined,
): Promise<void> {
  if (!skipFormat) {
    await formatFiles(tree);
  }
}
