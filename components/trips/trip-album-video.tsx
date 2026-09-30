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
 * small document that sends none. At rest it is the poster frame with the
 * length; a tap or click anywhere plays it, and the browser's controls take
 * over from there. They aren't shown at rest because they swallow taps on a
 * small tile. Nothing is fetched until play. If the stream errors, the poster
 * links to the album instead. */
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
    `<style>html,body{margin:0;height:100%}body{position:relative}video,img{display:block;width:100%;height:100%;object-fit:cover}video:focus:not(:focus-visible){outline:0}` +
      `button{position:absolute;left:8px;bottom:8px;padding:2px 8px;border:0;border-radius:999px;background:rgba(0,0,0,.6);color:#fff;font:600 12px/18px system-ui,sans-serif;cursor:pointer}</style>`,
    `<video src="${attr(albumVideoSrc(photo))}" poster="${poster}" preload="none" playsinline></video>`,
    `<button type="button" aria-label="Play, ${length}">&#9654; ${clock(photo.video.duration)}</button>`,
    `<a hidden href="${attr(link)}" target="_blank" rel="noopener noreferrer" aria-label="Watch in Google Photos"><img src="${poster}" alt=""></a>`,
    `<script>var v=document.querySelector("video"),b=document.querySelector("button");` +
      `function play(){document.body.removeEventListener("click",play);b.remove();v.controls=true;v.play();v.focus()}` +
      `document.body.addEventListener("click",play);` +
      `v.addEventListener("error",function(){document.body.removeEventListener("click",play);v.remove();b.remove();document.querySelector("a").hidden=false})</script>`,
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
