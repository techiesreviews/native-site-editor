export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public conflicts?: string[],
    /** Of `conflicts`, the paths GitHub deleted (the rest it changed). */
    public gone?: string[],
  ) {
    super(message);
  }
}
