from pathlib import Path

import pytest
from cookiecutter.main import cookiecutter


def bake(tmp_path: Path, **extra_context: str) -> Path:
    context = {
        "project_name": "Example Platform",
        "author_name": "Test Author",
        "author_email": "test@example.com",
        "github_owner": "example",
        **extra_context,
    }
    return Path(
        cookiecutter(
            ".",
            no_input=True,
            output_dir=tmp_path,
            extra_context=context,
        )
    )


def test_template_bakes(tmp_path: Path) -> None:
    project = bake(tmp_path)

    assert project.name == "example-platform"
    assert (project / "AGENTS.md").exists()
    assert (project / "apps/web/package.json").exists()
    assert (project / "apps/api/package.json").exists()
    assert (project / "apps/worker/package.json").exists()
    assert (project / "packages/contracts/package.json").exists()
    assert (project / ".github/workflows/ci.yml").exists()
    assert (project / "LICENSE").exists()


@pytest.mark.parametrize(
    ("include_worker", "include_redis"),
    [
        ("yes", "yes"),
        ("no", "yes"),
        ("yes", "no"),
        ("no", "no"),
    ],
)
def test_optional_components(
    tmp_path: Path,
    include_worker: str,
    include_redis: str,
) -> None:
    project = bake(
        tmp_path,
        project_name=f"Options {include_worker} {include_redis}",
        include_worker=include_worker,
        include_redis=include_redis,
    )

    assert (project / "apps/worker").exists() is (include_worker == "yes")

    compose = (project / "compose.yaml").read_text()
    assert ("  redis:\n" in compose) is (include_redis == "yes")
    assert "volumes:\n  postgres-data:" in compose
