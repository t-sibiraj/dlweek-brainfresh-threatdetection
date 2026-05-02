import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(`❌ Error: ${err.message}`);
  console.error(err.stack);

  if (err.message.startsWith("Invalid file type")) {
    res.status(400).json({ error: err.message });
    return;
  }

  if (err.message.includes("File too large")) {
    res.status(413).json({ error: "File size exceeds 100MB limit" });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}
