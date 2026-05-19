export class NotImplementedError extends Error {
  constructor(feature: string, hint?: string) {
    const suffix = hint ? ` — ${hint}` : "";
    super(`Not implemented: ${feature}${suffix}`);
    this.name = "NotImplementedError";
  }
}

export class LifecoachError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "LifecoachError";
  }
}
