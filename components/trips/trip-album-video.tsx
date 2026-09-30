import { albumPhotoSrc, albumVideoSrc, type AlbumPhoto } from "@/lib/trip-album";

const attr = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

/** "0:14", "1:11" */
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** A video from the album, played in place.
 *
 * Google's video host refuses any request that carries a referrer, and a
 * `video` element can't set a referrer policy, so the player lives in its own
 * small document that sends none. At rest it is the poster frame with a play
 * button and the length; a tap or click anywhere plays it, and the browser's
 * controls take over from there. They aren't shown at rest because they
 * swallow taps on a small tile. Nothing is fetched until play. If the stream
 * errors, the poster links to the album instead. */
export function TripAlbumVideo({
  photo,
  name,
  link,
  posterWidth,
  className,
}: {
  photo: AlbumPhoto & { video: NonNullable<AlbumPhoto["video"]> };
  /** "Video 2 of 6" */
  name: string;
  /** The album, for when the video won't play. */
  link: string;
  posterWidth: number;
  className: string;
}) {
  const poster = attr(albumPhotoSrc(photo, posterWidth));
  const length = `${photo.video.duration} seconds`;
  const player = [
    `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer">`,
    `<style>html,body{margin:0;height:100%}body{position:relative}video,img{display:block;width:100%;height:100%;object-fit:cover}` +
      // The browser draws its own small play glyph on a paused video; hidden
      // until play, when its controls take over.
      `video:focus:not(:focus-visible){outline:0}body:not(.on) video::-webkit-media-controls{display:none}` +
      `button{position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border:0;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;cursor:pointer}` +
      `button svg{width:24px;height:24px;margin-left:3px}` +
      `span{position:absolute;left:8px;bottom:8px;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.6);color:#fff;font:600 12px/18px system-ui,sans-serif}</style>`,
    `<video src="${attr(albumVideoSrc(photo))}" poster="${poster}" preload="none" playsinline></video>`,
    `<button type="button" aria-label="Play, ${length}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></button>`,
    `<span aria-hidden="true">${clock(photo.video.duration)}</span>`,
    `<a hidden href="${attr(link)}" target="_blank" rel="noopener noreferrer" aria-label="Watch in Google Photos"><img src="${poster}" alt=""></a>`,
    // A press must not move focus: in a scroll-snapping strip, focusing the
    // frame can scroll the tile under the pointer and cancel the click.
    // Playing on pointerup as well covers a click cancelled that way.
    `<script>var v=document.querySelector("video"),b=document.querySelector("button"),s=document.querySelector("span"),d=document.body;` +
      `function press(e){e.preventDefault()}` +
      `function off(){d.removeEventListener("pointerdown",press);d.removeEventListener("pointerup",play);d.removeEventListener("click",play)}` +
      `function play(){off();b.remove();s.remove();d.className="on";v.controls=true;v.play();v.focus()}` +
      `d.addEventListener("pointerdown",press);d.addEventListener("pointerup",play);d.addEventListener("click",play);` +
      `v.addEventListener("error",function(){off();v.remove();b.remove();s.remove();document.querySelector("a").hidden=false})</script>`,
  ].join("");

  return (
    <iframe
      title={`${name}, ${length}`}
      srcDoc={player}
      referrerPolicy="no-referrer"
      // No same-origin access: the player only needs its own script and to
      // open the album in a new tab.
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      allow="fullscreen"
      loading="lazy"
      // Sized like a photo: fixed height, width from the aspect ratio.
      style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
      className={`${className} border-0`}
    />
  );
}
