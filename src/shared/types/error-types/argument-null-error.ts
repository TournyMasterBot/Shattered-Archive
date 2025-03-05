// Custom error class for argument null/whitespace errors
export class ArgumentNullError extends Error {
  constructor(parameterName: string) {
    super(`Parameter '${parameterName}' cannot be null, undefined, or whitespace.`);
    this.name = "ArgumentNullError";
  }
}

// Utility class with the static method
class ArgumentNull {
  static throwIfNullOrWhiteSpace(value: string | null | undefined, parameterName: string): void {
    /* Debug
    console.log("Checking for null parameter", {
      parameterName: parameterName,
      val: value,
      nullCheck: value === null,
      undefinedCheck: value === undefined,
      emptyCheck: value?.trim().length === 0
    });
    */
    if (value === null || value === undefined || value.trim().length === 0) {
      throw new ArgumentNullError(parameterName);
    }
  }
}
export default ArgumentNull;