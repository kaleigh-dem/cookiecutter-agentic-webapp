from pathlib import Path

path = Path('tools/template/generated-workspace-e2e.mjs')
content = path.read_text()
old = "    execute('pnpm', ['check'], workspace);\n"
new = """    execute('pnpm', ['check'], workspace, {
      env: { NEXT_PUBLIC_AUTHENTICATION_PROFILE: 'none' },
    });
"""
if old not in content:
    raise SystemExit('generated-workspace check invocation not found')
path.write_text(content.replace(old, new, 1))
