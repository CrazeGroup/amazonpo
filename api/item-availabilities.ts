import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleAvailability } from '../server/businessCentral';
export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleAvailability(req, res);
}
