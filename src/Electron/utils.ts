import { join } from "node:path";

export function getResourcePath(resPath: string) {
  return join(process.cwd(), resPath);
}
