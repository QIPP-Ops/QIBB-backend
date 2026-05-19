class BlobServiceClient {
  constructor() {}

  getContainerClient() {
    return {
      listBlobsFlat: async function* listBlobsFlat() {},
      getBlobClient: () => ({
        download: async () => ({ readableStreamBody: [] }),
      }),
    };
  }
}

module.exports = { BlobServiceClient };
