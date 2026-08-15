import { describe, it, expect, beforeEach } from "vitest";
import { writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadClientSecrets, saveToken } from "./oauth.js";

describe("loadClientSecrets", () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(dir, { recursive: true });
  });

  it("reads installed client credentials", async () => {
    const path = join(dir, "credentials.json");
    await writeFile(path, JSON.stringify({
      installed: { client_id: "id", client_secret: "secret", redirect_uris: ["http://localhost"] }
    }));
    const result = await loadClientSecrets(path);
    expect(result).toEqual({ client_id: "id", client_secret: "secret", redirect_uris: ["http://localhost"] });
  });

  it("reads web client credentials", async () => {
    const path = join(dir, "credentials.json");
    await writeFile(path, JSON.stringify({
      web: { client_id: "wid", client_secret: "wsecret" }
    }));
    const result = await loadClientSecrets(path);
    expect(result.client_id).toBe("wid");
  });

  it("throws on missing client_id", async () => {
    const path = join(dir, "credentials.json");
    await writeFile(path, JSON.stringify({ installed: { client_secret: "s" } }));
    await expect(loadClientSecrets(path)).rejects.toThrow("client_id");
  });

  it("throws on missing file", async () => {
    await expect(loadClientSecrets(join(dir, "nope.json"))).rejects.toThrow("Unable to read");
  });
});

describe("saveToken", () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(dir, { recursive: true });
  });

  it("writes token as formatted JSON", async () => {
    const path = join(dir, "token.json");
    await saveToken(path, { access_token: "abc", refresh_token: "def" });
    const content = await readFile(path, "utf8");
    expect(JSON.parse(content)).toEqual({ access_token: "abc", refresh_token: "def" });
  });
});
