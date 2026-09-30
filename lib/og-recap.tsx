import type { ReactElement } from "react";

import { OgActivityCalendar } from "@/lib/og-calendar";
import { Avatar, BetabookLockup, BetabookMark } from "@/lib/og-elements";
import { OG_FONT } from "@/lib/og-fonts";
import { OG_COLORS, OG_DISCIPLINE_COLOR } from "@/lib/og-theme";
import { SITE_TAGLINE } from "@/lib/site";
import { socialCardCoverHighlights, type SocialCardStats } from "@/lib/social-card";

export type SocialCardOwner = { name: string; initials: string; avatarUrl: string | null };

const PERIOD_HEADINGS: Record<SocialCardStats["period"], string> = {
  month: "A MONTH ON THE WALL",
  year: "A YEAR ON THE WALL",
  all: "THE STORY SO FAR",
};

function DisciplineBreakdown({ stats }: { stats: SocialCardStats }): ReactElement {
  const { disciplines } = stats;
  if (disciplines.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 78,
          padding: "0 28px",
          borderRadius: 20,
          background: "rgba(0,0,0,0.055)",
          fontFamily: OG_FONT.body,
          fontWeight: 500,
          fontSize: 22,
          color: "rgba(0,0,0,0.62)",
        }}
      >
        No sends logged in this period
      </div>
    );
  }
  const highlights = socialCardCoverHighlights(stats);
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        width: "100%",
        height: 210,
      }}
    >
      {disciplines.length === 1 ? (
        <>
          <div
            style={{
              display: "flex",
              flex: 1,
              minWidth: 0,
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "13px 18px",
              borderRadius: 20,
              background: OG_COLORS.paper,
            }}
          >
            <span
              style={{
                fontFamily: OG_FONT.body,
                fontWeight: 500,
                fontSize: 18,
                letterSpacing: 2,
                color: OG_DISCIPLINE_COLOR[disciplines[0].type],
                textTransform: "uppercase",
              }}
            >
              {disciplines[0].type}
            </span>
            <span
              style={{
                fontFamily: OG_FONT.display,
                fontWeight: 700,
                fontSize: 58,
                lineHeight: 0.92,
                color: OG_COLORS.ink,
              }}
            >
              {disciplines[0].sendCount}
            </span>
            <span
              style={{
                fontFamily: OG_FONT.body,
                fontWeight: 500,
                fontSize: 17,
                letterSpacing: 1,
                color: "rgba(0,0,0,0.62)",
              }}
            >
              {disciplines[0].sendCount === 1 ? "SEND" : "SENDS"}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flex: 1,
              minWidth: 0,
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "13px 18px",
              borderRadius: 20,
              background: OG_COLORS.paper,
            }}
          >
            <span
              style={{
                fontFamily: OG_FONT.body,
                fontWeight: 500,
                fontSize: 18,
                letterSpacing: 2,
                color: "rgba(0,0,0,0.62)",
              }}
            >
              HARDEST SEND
            </span>
            <span
              style={{
                fontFamily: OG_FONT.display,
                fontWeight: 700,
                fontSize: 52,
                lineHeight: 0.96,
                color: OG_DISCIPLINE_COLOR[disciplines[0].type],
              }}
            >
              {disciplines[0].hardest?.grade ?? "—"}
            </span>
            <span
              style={{
                fontFamily: OG_FONT.body,
                fontWeight: 500,
                fontSize: 16,
                lineHeight: 1.05,
                maxHeight: 36,
                color: "rgba(0,0,0,0.7)",
                overflow: "hidden",
              }}
            >
              {disciplines[0].hardest?.climbName ?? "No grade logged"}
            </span>
          </div>
        </>
      ) : (
        disciplines.map(({ type, sendCount, hardest }) => (
          <div
            key={type}
            style={{
              display: "flex",
              flex: 1,
              minWidth: 0,
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "13px 18px",
              borderRadius: 20,
              background: OG_COLORS.paper,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontFamily: OG_FONT.body,
                  fontWeight: 500,
                  fontSize: 18,
                  letterSpacing: 2,
                  color: OG_DISCIPLINE_COLOR[type],
                  textTransform: "uppercase",
                }}
              >
                {type}
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  style={{
                    fontFamily: OG_FONT.display,
                    fontWeight: 700,
                    fontSize: 58,
                    lineHeight: 0.92,
                    color: OG_COLORS.ink,
                  }}
                >
                  {sendCount}
                </span>
                <span
                  style={{
                    fontFamily: OG_FONT.body,
                    fontWeight: 500,
                    fontSize: 17,
                    letterSpacing: 1,
                    color: "rgba(0,0,0,0.62)",
                  }}
                >
                  {sendCount === 1 ? "SEND" : "SENDS"}
                </span>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                minWidth: 0,
                flexDirection: "column",
                justifyContent: "center",
                paddingTop: 8,
              }}
            >
              <span
                style={{
                  fontFamily: OG_FONT.body,
                  fontWeight: 500,
                  fontSize: 16,
                  letterSpacing: 1.5,
                  color: "rgba(0,0,0,0.62)",
                }}
              >
                {hardest ? "HARDEST SEND" : "GRADE NOT LOGGED"}
              </span>
              {hardest && (
                <div style={{ display: "flex", minWidth: 0, flexDirection: "column" }}>
                  <span
                    style={{
                      fontFamily: OG_FONT.display,
                      fontWeight: 700,
                      fontSize: 40,
                      lineHeight: 0.96,
                      color: OG_DISCIPLINE_COLOR[type],
                    }}
                  >
                    {hardest.grade}
                  </span>
                  <span
                    style={{
                      fontFamily: OG_FONT.body,
                      fontWeight: 500,
                      fontSize: 17,
                      lineHeight: 1.05,
                      maxHeight: 36,
                      color: "rgba(0,0,0,0.7)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "normal",
                    }}
                  >
                    {hardest.climbName}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))
      )}
      {highlights.map((highlight) => (
        <div
          key={highlight.id}
          style={{
            display: "flex",
            flex: 1,
            minWidth: 0,
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "13px 18px",
            borderRadius: 20,
            background: OG_COLORS.paper,
          }}
        >
          <span
            style={{
              fontFamily: OG_FONT.body,
              fontWeight: 500,
              fontSize: 18,
              letterSpacing: 2,
              color: "rgba(0,0,0,0.62)",
              textTransform: "uppercase",
            }}
          >
            {highlight.label}
          </span>
          <span
            style={{
              fontFamily: OG_FONT.display,
              fontWeight: 700,
              fontSize: 52,
              lineHeight: 0.96,
              color: OG_COLORS.ink,
            }}
          >
            {highlight.value}
          </span>
          <span
            style={{
              fontFamily: OG_FONT.body,
              fontWeight: 500,
              fontSize: 16,
              lineHeight: 1.05,
              maxHeight: 36,
              color: "rgba(0,0,0,0.7)",
              overflow: "hidden",
            }}
          >
            {highlight.detail}
          </span>
        </div>
      ))}
    </div>
  );
}

function emptyRecapElement(owner: SocialCardOwner, stats: SocialCardStats) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background: OG_COLORS.ink,
      }}
    >
      <div style={{ display: "flex", position: "absolute", right: -170, top: 160, opacity: 0.1 }}>
        <BetabookMark size={690} color={OG_COLORS.paper} sunColor={OG_COLORS.coral} />
      </div>
      <div
        style={{
          display: "flex",
          height: 850,
          flexDirection: "column",
          padding: "64px 72px 54px",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <BetabookLockup color={OG_COLORS.paper} />
          <span
            style={{
              display: "flex",
              borderRadius: 14,
              padding: "12px 22px",
              background: OG_COLORS.coral,
              color: OG_COLORS.ink,
              fontFamily: OG_FONT.body,
              fontWeight: 500,
              fontSize: 23,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            {stats.periodLabel}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 112 }}>
          <span
            style={{
              fontFamily: OG_FONT.display,
              fontWeight: 700,
              fontSize: 79,
              lineHeight: 1,
              color: OG_COLORS.paper,
            }}
          >
            {PERIOD_HEADINGS[stats.period]}
          </span>
          <span
            style={{
              fontFamily: OG_FONT.display,
              fontWeight: 700,
              fontSize: 245,
              lineHeight: 0.96,
              color: OG_COLORS.coral,
            }}
          >
            NEXT
          </span>
          <span
            style={{
              fontFamily: OG_FONT.display,
              fontWeight: 700,
              fontSize: 105,
              lineHeight: 1,
              color: OG_COLORS.paper,
            }}
          >
            CLIMB AWAITS
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginTop: "auto",
            paddingTop: 26,
          }}
        >
          <Avatar
            photo={owner.avatarUrl}
            initials={owner.initials}
            size={70}
            color={OG_COLORS.coral}
            ringWidth={3}
          />
          <span
            style={{
              fontFamily: OG_FONT.display,
              fontWeight: 700,
              fontSize: 43,
              color: OG_COLORS.paper,
              maxWidth: 770,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {owner.name}
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          padding: "58px 72px 48px",
          background: OG_COLORS.paper,
          color: OG_COLORS.ink,
        }}
      >
        <span
          style={{
            fontFamily: OG_FONT.body,
            fontWeight: 500,
            fontSize: 24,
            letterSpacing: 2,
            color: "rgba(0,0,0,0.62)",
          }}
        >
          {stats.period === "all" ? "No sends logged yet" : "No activity this period"}
        </span>
        <span
          style={{
            display: "flex",
            marginTop: 22,
            maxWidth: 700,
            fontFamily: OG_FONT.display,
            fontWeight: 700,
            fontSize: 88,
            lineHeight: 1.02,
          }}
        >
          Your next climb starts the story.
        </span>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "auto",
            fontFamily: OG_FONT.body,
            fontWeight: 500,
            fontSize: 22,
            color: "rgba(0,0,0,0.6)",
          }}
        >
          <span>{SITE_TAGLINE}</span>
          <span>betabook.ca</span>
        </div>
      </div>
    </div>
  );
}

/** A share poster with one legible headline and a few climbing-specific
 * highlights. The full grade distribution stays in Analytics, where it has
 * enough room to be read. */
export function socialCardElement(owner: SocialCardOwner, stats: SocialCardStats): ReactElement {
  if (stats.sendCount === 0 && stats.daysOut === 0) {
    return emptyRecapElement(owner, stats);
  }

  const heroIsDays = stats.daysOut > 0;
  const heroValue = heroIsDays ? stats.daysOut : stats.sendCount;
  const heroLabel = heroIsDays ? "DAYS OUT" : stats.sendCount === 1 ? "SEND" : "SENDS";
  const heroFontSize =
    String(heroValue).length >= 5 ? 215 : String(heroValue).length === 4 ? 255 : 300;

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background: OG_COLORS.ink,
        color: OG_COLORS.paper,
      }}
    >
      <div style={{ display: "flex", position: "absolute", right: -170, top: 160, opacity: 0.1 }}>
        <BetabookMark size={690} color={OG_COLORS.paper} sunColor={OG_COLORS.coral} />
      </div>
      <div
        style={{
          display: "flex",
          height: 760,
          flexDirection: "column",
          padding: "54px 72px 46px",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <BetabookLockup color={OG_COLORS.paper} />
          <span
            style={{
              display: "flex",
              borderRadius: 14,
              padding: "12px 22px",
              background: OG_COLORS.coral,
              color: OG_COLORS.ink,
              fontFamily: OG_FONT.body,
              fontWeight: 500,
              fontSize: 23,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            {stats.periodLabel}
          </span>
        </div>
        <span
          style={{
            display: "flex",
            marginTop: 70,
            fontFamily: OG_FONT.display,
            fontWeight: 700,
            fontSize: 75,
            lineHeight: 1,
            color: OG_COLORS.paper,
          }}
        >
          {PERIOD_HEADINGS[stats.period]}
        </span>
        <span
          style={{
            display: "flex",
            fontFamily: OG_FONT.display,
            fontWeight: 700,
            fontSize: heroFontSize,
            letterSpacing: -8,
            lineHeight: 0.92,
            color: OG_COLORS.coral,
          }}
        >
          {heroValue}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <span
            style={{
              fontFamily: OG_FONT.display,
              fontWeight: 700,
              fontSize: 62,
              lineHeight: 1,
              color: OG_COLORS.paper,
            }}
          >
            {heroLabel}
          </span>
          {stats.longestStreak != null && stats.longestStreak > 1 && (
            <span
              style={{
                display: "flex",
                border: `2px solid ${OG_COLORS.coral}`,
                borderRadius: 9999,
                padding: "10px 22px",
                color: OG_COLORS.coral,
                fontFamily: OG_FONT.body,
                fontWeight: 500,
                fontSize: 20,
                letterSpacing: 1,
              }}
            >
              {`${stats.longestStreak}-DAY STREAK`}
            </span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginTop: "auto",
            paddingTop: 26,
          }}
        >
          <Avatar
            photo={owner.avatarUrl}
            initials={owner.initials}
            size={70}
            color={OG_COLORS.coral}
            ringWidth={3}
          />
          <span
            style={{
              fontFamily: OG_FONT.display,
              fontWeight: 700,
              fontSize: 43,
              color: OG_COLORS.paper,
              maxWidth: 770,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {owner.name}
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          padding: "30px 72px 34px",
          background: OG_COLORS.ink,
          color: OG_COLORS.paper,
        }}
      >
        <DisciplineBreakdown stats={stats} />
        <div
          style={{
            display: "flex",
            marginTop: 14,
            padding: "18px 20px",
            borderRadius: 22,
            background: OG_COLORS.paper,
            color: OG_COLORS.ink,
          }}
        >
          <OgActivityCalendar calendar={stats.calendar} />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "auto",
            fontFamily: OG_FONT.body,
            fontWeight: 500,
            fontSize: 22,
            color: "rgba(234,247,239,0.65)",
          }}
        >
          <span>{SITE_TAGLINE}</span>
          <span>betabook.ca</span>
        </div>
      </div>
    </div>
  );
}
