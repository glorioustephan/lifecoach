import type { LifecoachConfig } from "../config/index.js";
import { openDb, type DbHandle } from "./db.js";
import {
  ProfileRepository,
  SessionRepository,
  MessageRepository,
  FactRepository,
  DocumentRepository,
  MeasurementRepository,
  ReflectionRepository,
  InsightRepository,
  EmbeddingRepository,
  AttentionSignalRepository,
  JobRepository,
  IngestedFileRepository,
  TaskRepository,
  GoalRepository,
  ProjectRepository,
  ArtifactRepository,
  FinancialRepository,
} from "./repositories/index.js";

export interface Storage {
  handle: DbHandle;
  profile: ProfileRepository;
  sessions: SessionRepository;
  messages: MessageRepository;
  facts: FactRepository;
  documents: DocumentRepository;
  measurements: MeasurementRepository;
  reflections: ReflectionRepository;
  insights: InsightRepository;
  embeddings: EmbeddingRepository;
  signals: AttentionSignalRepository;
  jobs: JobRepository;
  ingestedFiles: IngestedFileRepository;
  tasks: TaskRepository;
  goals: GoalRepository;
  projects: ProjectRepository;
  artifacts: ArtifactRepository;
  financial: FinancialRepository;
  close: () => void;
}

export const createStorage = (config: LifecoachConfig): Storage => {
  const handle = openDb(config);
  const { db, embeddingDim } = handle;
  return {
    handle,
    profile: new ProfileRepository(db),
    sessions: new SessionRepository(db),
    messages: new MessageRepository(db),
    facts: new FactRepository(db),
    documents: new DocumentRepository(db),
    measurements: new MeasurementRepository(db),
    reflections: new ReflectionRepository(db),
    insights: new InsightRepository(db),
    embeddings: new EmbeddingRepository(db, embeddingDim),
    signals: new AttentionSignalRepository(db),
    jobs: new JobRepository(db),
    ingestedFiles: new IngestedFileRepository(db),
    tasks: new TaskRepository(db),
    goals: new GoalRepository(db),
    projects: new ProjectRepository(db),
    artifacts: new ArtifactRepository(db),
    financial: new FinancialRepository(db),
    close: handle.close,
  };
};

export type { DbHandle } from "./db.js";
export * from "./repositories/index.js";
