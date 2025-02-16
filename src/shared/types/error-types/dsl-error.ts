class DslError extends Error {
  traceLocation?: string;

  constructor(config: Partial<DslError> & { traceLocation?: string }) {
    super();
    if (config.name !== undefined) {
      this.name = config.name;
    }
    if (config.message !== undefined) {
      this.message = config.message;
    }
    this.stack = config.stack;
    this.traceLocation = config.traceLocation;
  }
}

export default DslError;
