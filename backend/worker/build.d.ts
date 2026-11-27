// worker-build emits build/index.js. The smoke fixtures import its default entrypoint.
export default class ReleaseWorker {
  protected env: CloudflareEnv;
  public scheduled(controller: ScheduledController): Promise<void>;
}
