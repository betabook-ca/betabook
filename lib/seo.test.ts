import { describe, expect, it } from "vitest";

import { OG_IMAGE } from "@/lib/site";

import {
  pageMetadata,
  areaDescription,
  areaTitle,
  breadcrumbJsonLd,
  climbDescription,
  climbJsonLd,
  climbTitle,
  locationTrail,
  sharedProfileMetadata,
  sharedProjectMetadata,
  websiteJsonLd,
} from "./seo";

describe("public climb metadata", () => {
  it("includes public grade and description without community facts", () => {
    const climb = {
      name: "Midnight Lightning",
      grade: 9,
      type: "boulder" as const,
      description: "A classic test piece.",
      avgRating: 5,
    };
    expect(climbTitle(climb, "Camp 4")).toBe("Midnight Lightning · V8 · Camp 4");
    expect(climbDescription(climb, "Yosemite, Camp 4")).toBe(
      "Midnight Lightning is a V8 boulder problem in Yosemite, Camp 4. A classic test piece.",
    );
  });
  it("supports a missing location", () => {
    expect(climbDescription({ name: "Unknown", type: "sport", grade: null }, "")).toBe(
      "Unknown is a sport route. Community rating and logged ascents on Betabook.",
    );
  });
});

describe("areaTitle / areaDescription", () => {
  it("appends the parent area when there is one", () => {
    expect(areaTitle("Camp 4", "Yosemite Valley")).toBe("Camp 4 climbing · Yosemite Valley");
    expect(areaTitle("Yosemite", null)).toBe("Yosemite climbing");
  });

  it("folds the location trail into the description", () => {
    expect(areaDescription("Camp 4", "Yosemite Valley, Yosemite National Park")).toBe(
      "Explore climbing in Camp 4, Yosemite Valley, Yosemite National Park. Routes and boulder problems on Betabook.",
    );
  });
});

describe("locationTrail", () => {
  it("joins ancestor names nearest-last", () => {
    expect(locationTrail(["Yosemite", "Yosemite Valley", "Camp 4"])).toBe(
      "Yosemite, Yosemite Valley, Camp 4",
    );
    expect(locationTrail([])).toBe("");
  });

  it("keeps only the nearest `max` names", () => {
    const chain = ["North America", "United States", "California", "Yosemite", "Camp 4"];
    expect(locationTrail(chain)).toBe("California, Yosemite, Camp 4");
    expect(locationTrail(chain, 2)).toBe("Yosemite, Camp 4");
  });
});

describe("breadcrumbJsonLd", () => {
  it("emits absolute item URLs with 1-based positions", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Camp 4", path: "/areas/5" },
    ]);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://betabook.ca/" },
      { "@type": "ListItem", position: 2, name: "Camp 4", item: "https://betabook.ca/areas/5" },
    ]);
  });
});

describe("websiteJsonLd", () => {
  it("wires the SearchAction at the home name query", () => {
    const ld = websiteJsonLd();
    expect(ld["@type"]).toBe("WebSite");
    expect((ld.potentialAction as Record<string, unknown>).target).toEqual({
      "@type": "EntryPoint",
      urlTemplate: "https://betabook.ca/?name={search_term_string}",
    });
  });
});

describe("climbJsonLd", () => {
  it("returns a BreadcrumbList followed by a WebPage, no rating markup", () => {
    const [crumbs, page] = climbJsonLd({
      name: "The Nose",
      path: "/climbs/1",
      description: "d",
      crumbs: [{ name: "Home", path: "/" }],
    });
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    expect(page["@type"]).toBe("WebPage");
    expect(page.url).toBe("https://betabook.ca/climbs/1");
    expect(JSON.stringify(page)).not.toContain("AggregateRating");
  });
});

describe("sharedProfileMetadata", () => {
  it("names the owner without the title template, indexing, or a canonical URL", () => {
    const title = "Alex Rivera on Betabook";
    const description =
      "Alex Rivera invited you to Betabook, a climbing logbook and crag database.";
    expect(sharedProfileMetadata("Alex Rivera")).toEqual({
      title: { absolute: title },
      description,
      robots: { index: false },
      openGraph: { type: "profile", siteName: "Betabook", title, description, images: [OG_IMAGE] },
      twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
    });
  });
});

describe("sharedProjectMetadata", () => {
  it("names the climber and the climb without indexing or a canonical URL", () => {
    const title = "Alex Rivera is projecting Midnight Lightning";
    const description =
      "Follow Alex Rivera's progress on Midnight Lightning on Betabook, a climbing logbook and crag database.";
    expect(sharedProjectMetadata("Alex Rivera", "Midnight Lightning")).toEqual({
      title: { absolute: title },
      description,
      robots: { index: false },
      openGraph: { type: "article", siteName: "Betabook", title, description, images: [OG_IMAGE] },
      twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
    });
  });
});

describe("sharedProjectMetadata for a sent project", () => {
  it("matches the verb the page's own heading uses", () => {
    const sent = sharedProjectMetadata("Alex Rivera", "Midnight Lightning", true);
    expect(sent.title).toEqual({ absolute: "Alex Rivera sent Midnight Lightning" });
    expect(JSON.stringify(sent)).not.toContain("is projecting");
    expect(sent.robots).toEqual({ index: false });
  });
});

describe("pageMetadata", () => {
  it.each([undefined, "article"] as const)(
    "supplies canonical and complete social metadata for %s",
    (ogType) => {
      expect(
        pageMetadata({
          title: "Camp 4",
          description: "Bouldering in Yosemite.",
          path: "/areas/4/camp-4",
          ogType,
        }),
      ).toEqual({
        title: "Camp 4",
        description: "Bouldering in Yosemite.",
        alternates: { canonical: "/areas/4/camp-4" },
        openGraph: {
          type: ogType ?? "website",
          siteName: "Betabook",
          title: "Camp 4",
          description: "Bouldering in Yosemite.",
          url: "/areas/4/camp-4",
          images: [OG_IMAGE],
        },
        twitter: {
          card: "summary_large_image",
          title: "Camp 4",
          description: "Bouldering in Yosemite.",
          images: [OG_IMAGE.url],
        },
      });
    },
  );
});
