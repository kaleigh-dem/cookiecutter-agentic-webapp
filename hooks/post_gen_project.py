from pathlib import Path
import shutil

ROOT = Path.cwd()


def remove(path: str) -> None:
    target = ROOT / path
    if target.is_dir():
        shutil.rmtree(target)
    elif target.exists():
        target.unlink()


if "{{ cookiecutter.include_worker }}" != "yes":
    remove("apps/worker")

if "{{ cookiecutter.include_redis }}" != "yes":
    compose = ROOT / "compose.yaml"
    text = compose.read_text()
    start = text.find("  redis:\n")
    if start != -1:
        end = text.find("\nvolumes:\n", start)
        if end == -1:
            text = text[:start].rstrip() + "\n"
        else:
            text = text[:start].rstrip() + "\n\n" + text[end + 1 :]
        compose.write_text(text)

license_name = "{{ cookiecutter.license }}"
for candidate in ("MIT", "Apache-2.0", "Proprietary"):
    path = ROOT / f"LICENSE.{candidate}"
    if candidate == license_name:
        path.rename(ROOT / "LICENSE")
    else:
        path.unlink(missing_ok=True)
