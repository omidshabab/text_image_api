export class UploadError extends Error {
  details: string;

  constructor(details: string) {
    super("Failed to upload file to both Liara and UploadThing");
    this.name = "UploadError";
    this.details = details;
  }
}

export class SceneValidationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "SceneValidationError";
    this.statusCode = statusCode;
  }
}

