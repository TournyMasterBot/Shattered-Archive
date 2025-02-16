import ApiError from "@shared/types/error-types/api-error";

class MessageEnvelope {
  statusCode: number | undefined;
  payload?: any;
  errors: ApiError[] | undefined;

  constructor(payload?: any, errors?: ApiError[]) {
    this.payload = payload;
    this.errors = errors ?? [];
    this.statusCode = this.computeStatusCode();
  }

  private computeStatusCode(): number {
    if (this.errors && this.errors.length > 0) {
      // Use the status code of the first error if available, otherwise default to 500.
      return this.errors[0].statusCode || 500;
    }
    // Unset errors before response
    if (this.errors?.length === 0) {
      this.errors = undefined;
    }
    return 200;
  }
}

export default MessageEnvelope;
