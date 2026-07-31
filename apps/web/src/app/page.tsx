import { HeroBanner } from '@agentic-webapp/ui';

import { ApiHealth } from './api-health';

export default function HomePage() {
  return (
    <main>
      <HeroBanner
        title="Agentic Webapp"
        description="Next.js, NestJS, Nx boundaries, affected CI, and workspace-aware agents."
      />
      <ApiHealth />
    </main>
  );
}
