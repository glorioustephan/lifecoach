import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LifecoachConfig } from "../config/index.js";
import { createStorage, type Storage } from "../storage/index.js";

export interface TestStorageHandle {
  storage: Storage;
  cleanup: () => void;
}

export const createTestStorage = (embeddingDim = 2): TestStorageHandle => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "lifecoach-test-"));
  const config: LifecoachConfig = {
    dataDir,
    dbPath: path.join(dataDir, "lifecoach.db"),
    rawDir: path.join(dataDir, "raw"),
    snapshotsDir: path.join(dataDir, "snapshots"),
    anthropicApiKey: undefined,
    voyageApiKey: undefined,
    voyageEmbeddingModel: undefined,
    voyageRerankModel: undefined,
    todoistApiToken: undefined,
    capacitiesApiToken: undefined,
    capacitiesDefaultSpaceId: undefined,
    model: "test-model",
    extractionModel: "test-model",
    embeddingDim,
  };
  const storage = createStorage(config);
  return {
    storage,
    cleanup: () => {
      storage.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
};
