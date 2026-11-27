// oxlint-disable-next-line import/no-relative-parent-imports -- run the production scheduled handler.
import Worker from "../../../backend/worker/build";

export default class FailCatalogCompletion extends Worker {
  public override scheduled(event: ScheduledController) {
    const bucket = this.env.CATALOG_EXPORTS;
    const create = bucket.createMultipartUpload.bind(bucket);
    bucket.createMultipartUpload = async (...args) => {
      const upload = await create(...args);
      upload.complete = async () => {
        await bucket.put("fixture-upload-id", upload.uploadId);
        throw new Error("Injected R2 completion failure");
      };
      return upload;
    };
    return super.scheduled(event);
  }
}
