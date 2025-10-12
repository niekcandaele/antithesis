import { Request, Response } from 'express';

/**
 * Check if the current request is an htmx AJAX request
 * @param req - Express request object
 * @returns true if the request has the HX-Request header set to 'true'
 */
export function isHtmxRequest(req: Request): boolean {
  return req.headers['hx-request'] === 'true';
}

/**
 * Instruct htmx to perform a client-side redirect
 * @param res - Express response object
 * @param url - URL to redirect to
 */
export function htmxRedirect(res: Response, url: string): void {
  res.setHeader('HX-Redirect', url);
}

/**
 * Trigger a custom event on the client side after the response is received
 * @param res - Express response object
 * @param eventName - Name of the event to trigger
 */
export function htmxTrigger(res: Response, eventName: string): void {
  res.setHeader('HX-Trigger', eventName);
}
