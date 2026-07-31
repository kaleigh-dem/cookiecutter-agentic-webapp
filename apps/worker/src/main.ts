function startWorker() {
  const interval = setInterval(() => {
    console.info(
      JSON.stringify({
        event: 'worker.heartbeat',
        timestamp: new Date().toISOString(),
      }),
    );
  }, 30_000);

  process.once('SIGTERM', () => {
    clearInterval(interval);
    process.exitCode = 0;
  });
}

startWorker();
