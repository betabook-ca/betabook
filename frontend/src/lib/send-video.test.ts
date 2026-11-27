import { describe, expect, it } from "vitest";

import {
  parseSendVideoLink,
  readSendVideo,
  SEND_VIDEO_INVALID_MESSAGE,
  SEND_VIDEO_SHARE_LINK_MESSAGE,
  sendVideoEmbedUrl,
  sendVideoLabel,
  sendVideoThumbnailUrl,
  readSendVideos,
  SEND_VIDEO_LIMIT_MESSAGE,
  sendVideoUrl,
  validateSendVideosInput,
  type SendVideo,
} from "@/lib/send-video";

const ID = "dQw4w9WgXcQ";

function stored(input: string): string | null {
  const parsed = parseSendVideoLink(input);
  return parsed.ok ? sendVideoUrl(parsed.video) : null;
}

describe("parseSendVideoLink", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, `https://www.youtube.com/watch?v=${ID}`],
    [
      `youtube.com/watch?v=${ID}&si=tracking&feature=share`,
      `https://www.youtube.com/watch?v=${ID}`,
    ],
    [`https://m.youtube.com/watch?v=${ID}&list=PL123`, `https://www.youtube.com/watch?v=${ID}`],
    [`https://youtu.be/${ID}?si=abc`, `https://www.youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/live/${ID}`, `https://www.youtube.com/watch?v=${ID}`],
    [`https://www.youtube-nocookie.com/embed/${ID}`, `https://www.youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/shorts/${ID}?feature=share`, `https://www.youtube.com/shorts/${ID}`],
    [`  http://YOUTU.BE/${ID}  `, `https://www.youtube.com/watch?v=${ID}`],
  ])("reads the YouTube link %s", (input, expected) => {
    expect(stored(input)).toBe(expected);
  });

  it.each([
    ["t=90", 90],
    ["t=90s", 90],
    ["t=1m30s", 90],
    ["t=1h2m3s", 3723],
    ["start=45", 45],
  ])("keeps a start time given as %s", (param, seconds) => {
    const parsed = parseSendVideoLink(`https://www.youtube.com/watch?v=${ID}&${param}`);
    expect(parsed).toEqual({
      ok: true,
      video: { provider: "youtube", id: ID, format: "video", start: seconds },
    });
    expect(stored(`https://youtu.be/${ID}?${param}`)).toBe(
      `https://www.youtube.com/watch?v=${ID}&t=${seconds}s`,
    );
  });

  it("drops a start time that is zero or unreadable rather than refusing the link", () => {
    expect(stored(`https://youtu.be/${ID}?t=0`)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(stored(`https://youtu.be/${ID}?t=soon`)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });

  it.each([
    ["https://www.instagram.com/reel/C9Xq3uGxJ5R/", "https://www.instagram.com/reel/C9Xq3uGxJ5R/"],
    ["instagram.com/reels/C9Xq3uGxJ5R", "https://www.instagram.com/reel/C9Xq3uGxJ5R/"],
    ["https://www.instagram.com/tv/C9Xq3uGxJ5R/", "https://www.instagram.com/reel/C9Xq3uGxJ5R/"],
    [
      "https://www.instagram.com/some.climber/reel/C9Xq3uGxJ5R/?igsh=abc",
      "https://www.instagram.com/reel/C9Xq3uGxJ5R/",
    ],
    [
      "https://www.instagram.com/p/C9Xq3uGxJ5R/?img_index=2",
      "https://www.instagram.com/p/C9Xq3uGxJ5R/",
    ],
    ["https://instagr.am/p/C9Xq3uGxJ5R", "https://www.instagram.com/p/C9Xq3uGxJ5R/"],
    [
      "https://www.instagram.com/constructor/reel/C9Xq3uGxJ5R/",
      "https://www.instagram.com/reel/C9Xq3uGxJ5R/",
    ],
  ])("reads the Instagram link %s", (input, expected) => {
    expect(stored(input)).toBe(expected);
  });

  it.each([
    "",
    "not a link",
    "https://vimeo.com/123456",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/@betabook",
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://evil.example/?u=https://youtu.be/dQw4w9WgXcQ",
    "javascript:alert(1)//youtu.be/dQw4w9WgXcQ",
    "ftp://youtu.be/dQw4w9WgXcQ",
    "https://www.instagram.com/some.climber/",
    "https://www.instagram.com/reels/",
    "https://www.instagram.com/p/bad!code/",
    // Names every object inherits must not read as a kind of post.
    "https://www.instagram.com/toString/C9Xq3uGxJ5R/",
    "https://www.instagram.com/constructor/C9Xq3uGxJ5R/",
  ])("refuses %j", (input) => {
    expect(parseSendVideoLink(input)).toEqual({ ok: false, error: SEND_VIDEO_INVALID_MESSAGE });
  });

  it("explains that an Instagram share link has to be opened first", () => {
    expect(parseSendVideoLink("https://www.instagram.com/share/reel/BAabc123XYZ")).toEqual({
      ok: false,
      error: SEND_VIDEO_SHARE_LINK_MESSAGE,
    });
  });
});

describe("readSendVideo", () => {
  it("reads every canonical form back to the video it was written from", () => {
    const videos: SendVideo[] = [
      { provider: "youtube", id: ID, format: "video", start: null },
      { provider: "youtube", id: ID, format: "video", start: 75 },
      { provider: "youtube", id: ID, format: "short", start: null },
      { provider: "instagram", shortcode: "C9Xq3uGxJ5R", format: "reel" },
      { provider: "instagram", shortcode: "C9Xq3uGxJ5R", format: "post" },
    ];
    for (const video of videos) expect(readSendVideo(sendVideoUrl(video))).toEqual(video);
  });

  it("ignores anything that is not already canonical, so a stored value can't reach an embed unchecked", () => {
    expect(readSendVideo(null)).toBeNull();
    expect(readSendVideo(undefined)).toBeNull();
    expect(readSendVideo(`https://youtu.be/${ID}`)).toBeNull();
    expect(readSendVideo("https://evil.example/")).toBeNull();
  });
});

describe("player and poster URLs", () => {
  const video: SendVideo = { provider: "youtube", id: ID, format: "video", start: 75 };

  it("plays YouTube from the no-cookie domain, starting where the link did", () => {
    const url = new URL(sendVideoEmbedUrl(video, { autoplay: true }));
    expect(url.origin + url.pathname).toBe(`https://www.youtube-nocookie.com/embed/${ID}`);
    expect(url.searchParams.get("autoplay")).toBe("1");
    expect(url.searchParams.get("start")).toBe("75");
    expect(url.searchParams.get("rel")).toBe("0");
    expect(url.searchParams.get("playsinline")).toBe("1");
    expect(
      new URL(sendVideoEmbedUrl({ ...video, start: null }, { autoplay: false })).searchParams.has(
        "autoplay",
      ),
    ).toBe(false);
  });

  it("uses Instagram's embed page for reels and posts", () => {
    expect(
      sendVideoEmbedUrl(
        { provider: "instagram", shortcode: "C9Xq3uGxJ5R", format: "reel" },
        { autoplay: true },
      ),
    ).toBe("https://www.instagram.com/reel/C9Xq3uGxJ5R/embed/");
    expect(
      sendVideoEmbedUrl(
        { provider: "instagram", shortcode: "C9Xq3uGxJ5R", format: "post" },
        { autoplay: true },
      ),
    ).toBe("https://www.instagram.com/p/C9Xq3uGxJ5R/embed/");
  });

  it("has a YouTube poster image and none for Instagram", () => {
    expect(sendVideoThumbnailUrl(video)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    expect(
      sendVideoThumbnailUrl({ provider: "instagram", shortcode: "C9Xq3uGxJ5R", format: "reel" }),
    ).toBeNull();
  });

  it("names each kind of video", () => {
    expect(sendVideoLabel(video)).toBe("YouTube video");
    expect(sendVideoLabel({ ...video, format: "short" })).toBe("YouTube Short");
    expect(
      sendVideoLabel({ provider: "instagram", shortcode: "C9Xq3uGxJ5R", format: "reel" }),
    ).toBe("Instagram reel");
    expect(
      sendVideoLabel({ provider: "instagram", shortcode: "C9Xq3uGxJ5R", format: "post" }),
    ).toBe("Instagram post");
  });
});

describe("validateSendVideosInput", () => {
  const REEL = "https://www.instagram.com/reel/C9Xq3uGxJ5R/";

  it("leaves the stored videos alone when the form carries no video list", () => {
    expect(validateSendVideosInput(undefined)).toBeUndefined();
  });

  it("clears the videos when the list is sent empty or blank", () => {
    expect(validateSendVideosInput([])).toBeNull();
    expect(validateSendVideosInput(["", "   "])).toBeNull();
  });

  it("stores canonical links in order, skipping blanks and repeats of the same video", () => {
    expect(
      validateSendVideosInput([
        ` https://youtu.be/${ID}?t=12 `,
        "",
        "instagram.com/some.climber/reel/C9Xq3uGxJ5R/?igsh=x",
        `https://www.youtube.com/watch?v=${ID}&t=12s&si=y`,
      ]),
    ).toEqual([`https://www.youtube.com/watch?v=${ID}&t=12s`, REEL]);
  });

  it("refuses an unsupported link, a file, an oversized value and too many videos", () => {
    expect(() => validateSendVideosInput([REEL, "https://vimeo.com/1"])).toThrow(
      SEND_VIDEO_INVALID_MESSAGE,
    );
    expect(() => validateSendVideosInput([new File(["x"], "clip.mp4")])).toThrow(
      SEND_VIDEO_INVALID_MESSAGE,
    );
    expect(() =>
      validateSendVideosInput([`https://youtu.be/${ID}?pad=${"x".repeat(3000)}`]),
    ).toThrow(SEND_VIDEO_INVALID_MESSAGE);
    const six = [
      "AAAAAAAAAAA",
      "BBBBBBBBBBB",
      "CCCCCCCCCCC",
      "DDDDDDDDDDD",
      "EEEEEEEEEEE",
      "FFFFFFFFFFF",
    ];
    expect(() => validateSendVideosInput(six.map((id) => `https://youtu.be/${id}`))).toThrow(
      SEND_VIDEO_LIMIT_MESSAGE,
    );
    // The limit counts distinct videos, so a repeat doesn't use a slot.
    expect(
      validateSendVideosInput([...six.slice(0, 5), six[0]].map((id) => `https://youtu.be/${id}`)),
    ).toHaveLength(5);
  });
});

describe("readSendVideos", () => {
  it("reads each canonical link and drops anything else", () => {
    expect(
      readSendVideos([
        `https://www.youtube.com/shorts/${ID}`,
        `https://youtu.be/${ID}`,
        "https://www.instagram.com/p/C9Xq3uGxJ5R/",
      ]),
    ).toEqual([
      { provider: "youtube", id: ID, format: "short", start: null },
      { provider: "instagram", shortcode: "C9Xq3uGxJ5R", format: "post" },
    ]);
    expect(readSendVideos(null)).toEqual([]);
    expect(readSendVideos(undefined)).toEqual([]);
  });
});
