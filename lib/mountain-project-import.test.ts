import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchMountainProjectImport } from "./mountain-project-import";
import { parseMountainProjectUserId } from "./mountain-project-profile";
import { MAX_IMPORT_ROWS } from "./sends-import";

const HEADER =
  'Date,Route,Rating,Notes,URL,Pitches,Location,"Avg Stars","Your Stars",Style,"Lead Style","Route Type","Your Rating",Length,"Rating Code"';

function tick({ route = "Double Play", style = "Send", leadStyle = "", date = "2026-09-12" } = {}) {
  return `${date},"${route}",V6,"Fun",https://www.mountainproject.com/route/1/x,1,"Washington > Exit 38",3.3,3,${style},${leadStyle},Boulder,V6,12,20600`;
}

function csvResponse(body: string, username = "eric-bonilla") {
  return new Response(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "X-Mountain-Project-User": username },
  });
}

const options = () => ({ signal: new AbortController().signal });
afterEach(() => vi.unstubAllGlobals());

describe("parseMountainProjectUserId", () => {
  it("accepts a bare user ID and every public profile link shape", () => {
    expect(parseMountainProjectUserId(" 200226064 ")).toBe("200226064");
    expect(
      parseMountainProjectUserId("https://www.mountainproject.com/user/200226064/eric-bonilla"),
    ).toBe("200226064");
    expect(
      parseMountainProjectUserId(
        "https://www.mountainproject.com/user/200226064/eric-bonilla/ticks",
      ),
    ).toBe("200226064");
    expect(parseMountainProjectUserId("mountainproject.com/user/200226064/eric-bonilla")).toBe(
      "200226064",
    );
    expect(parseMountainProjectUserId("http://www.mountainproject.com/user/200226064")).toBe(
      "200226064",
    );
  });

  it("rejects other hosts, credentials, ports and non-numeric IDs", () => {
    for (const input of [
      "https://mountainproject.example.com/user/200226064/eric-bonilla",
      "https://user:pass@www.mountainproject.com/user/200226064/eric-bonilla",
      "https://www.mountainproject.com:8443/user/200226064/eric-bonilla",
      "https://www.mountainproject.com/route/105842909/rainy-day-dream-away",
      "https://www.mountainproject.com/user/eric-bonilla",
      "eric-bonilla",
      "0",
      "12345678901234",
      "",
      42,
    ]) {
      expect(() => parseMountainProjectUserId(input)).toThrow(/Mountain Project/);
    }
  });
});

describe("Mountain Project import", () => {
  it("downloads the tick export through the proxy and maps the export's columns", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(csvResponse(`${HEADER}\n${tick()}\n${tick({ route: "SCL Low" })}`));
    vi.stubGlobal("fetch", fetcher);
    const result = await fetchMountainProjectImport(
      "https://www.mountainproject.com/user/200226064/eric-bonilla/ticks",
      options(),
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("/api/import/mountain-project?userId=200226064");
    expect(result.username).toBe("200226064");
    expect(result.displayName).toBe("@eric-bonilla");
    expect(result.parsed.rows.map((row) => row.Route)).toEqual(["Double Play", "SCL Low"]);
    expect(result.parsed.rows[0].Location).toBe("Washington > Exit 38");
    expect(result.parsed.derived).toEqual(["Lead Style or Style"]);
  });

  it("names the profile by user ID when the proxy could not resolve a display name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(csvResponse(`${HEADER}\n${tick()}`, "")),
    );
    const result = await fetchMountainProjectImport("200226064", options());
    expect(result.displayName).toBe("user 200226064");
  });

  it("warns about tick styles that are not Betabook ascent styles", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          csvResponse(
            [
              HEADER,
              tick({ style: "Send" }),
              tick({ style: "TR" }),
              tick({ style: "Lead", leadStyle: "Fell" }),
            ].join("\n"),
          ),
        ),
    );
    const { parsed } = await fetchMountainProjectImport("200226064", options());
    const warning = parsed.warnings.find((text) => text.includes("rope styles"));
    expect(warning).toContain("“TR”");
    expect(warning).toContain("“Fell”");
    expect(warning).not.toContain("“Send”");
    expect(warning).toContain("are not Betabook ascent styles");
  });

  it("does not warn when every tick style maps to an ascent style", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          csvResponse([HEADER, tick({ style: "Send" }), tick({ style: "Flash" })].join("\n")),
        ),
    );
    const { parsed } = await fetchMountainProjectImport("200226064", options());
    expect(parsed.warnings).toEqual([]);
  });

  it("surfaces the proxy's error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { error: "That Mountain Project profile could not be found." },
            { status: 502 },
          ),
        ),
    );
    await expect(fetchMountainProjectImport("200226064", options())).rejects.toThrow(
      "That Mountain Project profile could not be found.",
    );
  });

  it("rejects a response that is not a Mountain Project tick export", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(csvResponse("Date,Climb,Grade\n2026-01-01,Rock,V2")),
    );
    await expect(fetchMountainProjectImport("200226064", options())).rejects.toThrow(
      /unfamiliar tick export/i,
    );
  });

  it("rejects a response that is not CSV at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("<html></html>", { headers: { "Content-Type": "text/html" } }),
        ),
    );
    await expect(fetchMountainProjectImport("200226064", options())).rejects.toThrow(
      /unfamiliar tick export/i,
    );
  });

  it("rejects a tick list above the row cap", async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => tick());
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(csvResponse([HEADER, ...rows].join("\n"))),
    );
    await expect(fetchMountainProjectImport("200226064", options())).rejects.toThrow(/too large/i);
  });

  it("reports downloaded bytes as the export streams in", async () => {
    const encoder = new TextEncoder();
    const chunks = [`${HEADER}\n`, `${tick()}\n`, `${tick({ route: "SCL Low" })}\n`];
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        for (const chunk of chunks) stream.enqueue(encoder.encode(chunk));
        stream.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(body, {
          headers: { "Content-Type": "text/csv", "X-Mountain-Project-User": "eric-bonilla" },
        }),
      ),
    );
    const loaded: number[] = [];
    const { parsed } = await fetchMountainProjectImport("200226064", {
      signal: new AbortController().signal,
      onProgress: (bytes) => loaded.push(bytes),
    });
    let total = 0;
    expect(loaded).toEqual(chunks.map((chunk) => (total += encoder.encode(chunk).byteLength)));
    expect(parsed.rows).toHaveLength(2);
  });

  it("stops without parsing rows when the caller cancels", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort();
      return csvResponse(`${HEADER}\n${tick()}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const onProgress = vi.fn<(bytes: number) => void>();
    await expect(
      fetchMountainProjectImport("200226064", { signal: controller.signal, onProgress }),
    ).rejects.toThrow(/aborted/i);
    expect(onProgress).not.toHaveBeenCalled();
  });
});
