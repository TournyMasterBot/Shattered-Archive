import { Request } from "express";
import ApiError from "@shared/types/error-types/api-error";

class MessageEnvelope {
  statusCode: number | undefined;
  sessionId: string | undefined;
  requestId: string | undefined;
  payload?: any;
  errors: ApiError[] | undefined;

  constructor(request: Request, payload?: any, errors?: ApiError[]) {
    this.payload = payload;
    this.sessionId = request.shatteredSessionId;
    this.requestId = request.requestId;
    this.errors = errors ?? [];
    this.statusCode = this.computeStatusCode();
  }

  public setPayload(payload: any) {
    this.payload = payload;
  }

  public addError(err: ApiError) {
    this.errors!.push(err);
    this.statusCode = err.statusCode;
  }

  public unsetInternalErrors() {
    if (this.errors === undefined) {
      return;
    }
    for (const err of this.errors) {
      err.err = undefined;
    }
  }

  private computeStatusCode(): number {
    if (this.errors && this.errors.length > 0) {
      // Use the status code of the first error if available, otherwise default to 500.
      return this.errors[0].statusCode || 500;
    }
    return 200;
  }
}

export default MessageEnvelope;
