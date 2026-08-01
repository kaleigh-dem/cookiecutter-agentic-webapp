export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { webServerTelemetry } = await import('./instrumentation.node');
    await webServerTelemetry;
  }
}
