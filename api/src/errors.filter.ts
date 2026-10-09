import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";
import { CommandError } from "@edunazorat/shared";

/** Xatolar mijozga matn kaliti bilan: { key, params }, mijoz o'z tilida ko'rsatadi. */
@Catch()
export class ErrorsFilter implements ExceptionFilter {
  private readonly log = new Logger("Error");

  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;
    if (e instanceof CommandError) return res.status(e.status || 400).json({ key: e.key, params: e.params });
    if (e instanceof HttpException) {
      const status = e.getStatus();
      return res.status(status).json({ key: status === 404 ? "err.notFound" : status === 413 ? "err.fileTooLarge" : "err.network", params: status === 413 ? { mb: 2 } : {} });
    }
    this.log.error(e instanceof Error ? e.stack : String(e));
    return res.status(500).json({ key: "err.server", params: {} });
  }
}
