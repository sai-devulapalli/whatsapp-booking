export class BookingConflictError extends Error {
  constructor(message = "That slot is no longer available.") {
    super(message);
    this.name = "BookingConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
