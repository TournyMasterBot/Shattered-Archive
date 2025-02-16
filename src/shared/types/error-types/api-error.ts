interface ApiError extends Error {
  statusCode: number;
  message: string;
  err?: Error;
}

export default ApiError;
