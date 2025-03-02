import { createHash } from "crypto";

export async function md5FromBuffer(buffer: Buffer): Promise<string> {
  const hash = createHash("md5");
  hash.update(buffer);
  return hash.digest("hex");
}
