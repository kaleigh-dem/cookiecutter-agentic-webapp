# AgentTasks feature guidance

- Keep route files thin and place feature behavior here.
- Do not import Node-only projects.
- Keep network access behind typed client functions.
- Export only supported entry points from src/index.ts.
- Add accessible states for loading, empty, error, and success behavior.
