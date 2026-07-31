from pathlib import Path
from cookiecutter.main import cookiecutter


def test_template_bakes(tmp_path: Path) -> None:
    project = Path(
        cookiecutter(
            ".",
            no_input=True,
            output_dir=tmp_path,
            extra_context={
                "project_name": "Example Platform",
                "author_name": "Test Author",
                "author_email": "test@example.com",
                "github_owner": "example",
            },
        )
    )

    assert project.name == "example-platform"
    assert (project / "AGENTS.md").exists()
    assert (project / "apps/web/package.json").exists()
    assert (project / "apps/api/package.json").exists()
    assert (project / "apps/worker/package.json").exists()
    assert (project / "packages/contracts/package.json").exists()
    assert (project / ".github/workflows/ci.yml").exists()
    assert (project / "LICENSE").exists()
