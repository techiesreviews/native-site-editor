import { request as httpRequest } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSetupServer, manifest } from "../scripts/setup-browser.mjs";

const editorOrigin = "https://astro.techies.tools";

test("manifest contains hosted sign-in and Contents write and Metadata read permissions", () => {
  const value = manifest("http://127.0.0.1:8790", { editorOrigin });
  assert.equal(value.redirect_url, "http://127.0.0.1:8790/callback");
  assert.ok(
    value.callback_urls.includes("https://astro.techies.tools/auth/callback"),
  );
  assert.deepEqual(value.default_permissions, {
    contents: "write",
    metadata: "read",
  });
  assert.equal(value.request_oauth_on_install, false);
  assert.equal(value.hook_attributes.active, false);
});

test("browser setup requires its launch link, browser cookie and matching state; credentials stay private", async (t) => {
  let conversions = 0;
  let saved;
  let deployed;
  const setup = createSetupServer({
    port: 0,
    convert: async () => {
      conversions++;
      return {
        client_id: "Iv1.test",
        client_secret: "secret-value",
        slug: "editor-test",
        pem: "unused-key",
      };
    },
    save: async (values) => {
      saved = values;
    },
    deploy: async (values) => {
      deployed = values;
    },
    editorOrigin,
  });
  const launch = await setup.listen();
  t.after(() => setup.server.close());
  const origin = new URL(launch).origin;
  assert.equal((await fetch(origin)).status, 403);
  const start = await fetch(launch, { redirect: "manual" });
  const cookie = start.headers.get("set-cookie")!.split(";")[0];
  const html = await (
    await fetch(origin, { headers: { Cookie: cookie } })
  ).text();
  const state = html.match(/apps\/new\?state=([a-f0-9]+)/)![1];
  const callback = `${origin}/callback?code=sample&state=${state}`;
  assert.equal((await fetch(callback)).status, 403);
  assert.equal(
    (
      await fetch(`${origin}/callback?code=sample&state=wrong`, {
        headers: { Cookie: cookie },
      })
    ).status,
    400,
  );
  assert.equal(conversions, 0);
  const response = await fetch(callback, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  assert.equal(conversions, 1);
  assert.deepEqual(saved, deployed);
  assert.equal(saved.GITHUB_CLIENT_SECRET, "secret-value");
  assert.ok(!("pem" in saved));
  const result = await (
    await fetch(origin, { headers: { Cookie: cookie } })
  ).text();
  assert.ok(result.includes("editor-test/installations/new"));
  assert.ok(!result.includes("secret-value"));
  await fetch(callback, { headers: { Cookie: cookie } });
  assert.equal(conversions, 1);
});

test("a failed Cloudflare upload can be retried without registering another App", async (t) => {
  let conversions = 0;
  let uploads = 0;
  const setup = createSetupServer({
    port: 0,
    convert: async () => {
      conversions++;
      return {
        client_id: "Iv1.test",
        client_secret: "secret-value",
        slug: "editor-test",
      };
    },
    save: async () => {},
    deploy: async () => {
      if (++uploads === 1) throw new Error("do not expose secret-value");
    },
    editorOrigin,
  });
  const launch = await setup.listen();
  t.after(() => setup.server.close());
  const origin = new URL(launch).origin;
  const start = await fetch(launch, { redirect: "manual" });
  const cookie = start.headers.get("set-cookie")!.split(";")[0];
  const html = await (
    await fetch(origin, { headers: { Cookie: cookie } })
  ).text();
  const state = html.match(/apps\/new\?state=([a-f0-9]+)/)![1];
  const failed = await fetch(`${origin}/callback?code=sample&state=${state}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes("secret-value"));
  assert.equal(
    (
      await fetch(`${origin}/deploy`, {
        method: "POST",
        headers: { Cookie: cookie, Origin: "https://other.example" },
      })
    ).status,
    400,
  );
  const retry = await fetch(`${origin}/deploy`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: origin },
    redirect: "manual",
  });
  assert.equal(retry.status, 303);
  assert.equal(conversions, 1);
  assert.equal(uploads, 2);
});

test("tunnel setup uses its HTTPS callback, secure cookie and rejects other hosts", async (t) => {
  const publicOrigin = "https://setup-example.trycloudflare.com";
  const setup = createSetupServer({ port: 0, publicOrigin, editorOrigin });
  const launch = await setup.listen();
  t.after(() => setup.server.close());
  const local = `http://127.0.0.1:${setup.server.address().port}`;
  assert.ok(launch.startsWith(publicOrigin));
  assert.equal((await fetch(local)).status, 403);
  const throughTunnel = (url: string, cookie?: string): Promise<Response> =>
    new Promise((resolve, reject) => {
      const req = httpRequest(
        url,
        {
          headers: {
            Host: new URL(publicOrigin).host,
            ...(cookie ? { Cookie: cookie } : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const headers = new Headers();
            for (const [key, value] of Object.entries(res.headers))
              if (value)
                headers.set(
                  key,
                  Array.isArray(value) ? value.join(", ") : value,
                );
            resolve(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode,
                headers,
              }),
            );
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  const start = await throughTunnel(
    local + new URL(launch).pathname + new URL(launch).search,
  );
  assert.equal(start.status, 303);
  assert.match(start.headers.get("set-cookie")!, /; Secure/);
  const cookie = start.headers.get("set-cookie")!.split(";")[0];
  const page = await throughTunnel(local, cookie);
  const html = await page.text();
  assert.ok(html.includes(`${publicOrigin}/callback`));
  assert.ok(!html.includes(`${local}/callback`));
});
