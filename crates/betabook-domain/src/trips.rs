use crate::sends::is_real_iso_date;
use serde::Deserialize;
use std::collections::HashSet;
use url::Url;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TripInput {
    pub name: String,
    pub description: Option<String>,
    pub album_url: Option<String>,
    pub start_date: String,
    pub end_date: String,
    pub companions: Option<Vec<String>>,
}

impl TripInput {
    pub fn validate(mut self) -> Result<Self, &'static str> {
        self.name = self.name.trim().to_owned();
        if self.name.is_empty() {
            return Err("Name your trip.");
        }
        if self.name.encode_utf16().count() > 80 {
            return Err("That name is too long.");
        }
        self.description = self
            .description
            .map(|s| s.split_whitespace().collect::<Vec<_>>().join(" "))
            .filter(|s| !s.is_empty());
        if self
            .description
            .as_ref()
            .is_some_and(|s| s.chars().count() > 160)
        {
            return Err("That description is too long.");
        }
        if let Some(raw) = self.album_url.take().filter(|s| !s.trim().is_empty()) {
            self.album_url = Some(
                album_link(&raw)
                    .ok_or("Paste the link Google Photos gives you when you share an album.")?,
            );
        }
        if !is_real_iso_date(&self.start_date) || !is_real_iso_date(&self.end_date) {
            return Err("Enter a valid date.");
        }
        if self.end_date < self.start_date {
            return Err("End date must be on or after start date.");
        }
        if let Some(ids) = &mut self.companions {
            if ids.len() > 100 {
                return Err("Choose at most 10 friends");
            }
            if ids
                .iter()
                .any(|s| s.is_empty() || s.encode_utf16().count() > 128)
            {
                return Err("Invalid friend selection");
            }
            let mut seen = HashSet::new();
            ids.retain(|s| seen.insert(s.clone()));
            if ids.len() > 10 {
                return Err("Choose at most 10 friends");
            }
        }
        Ok(self)
    }
}

pub fn album_page(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && matches!(
            url.host_str(),
            Some("photos.app.goo.gl" | "photos.google.com")
        )
}

fn valid_key(value: &str, min: usize, max: usize) -> bool {
    (min..=max).contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

pub fn album_link(raw: &str) -> Option<String> {
    let url = Url::parse(raw.trim()).ok()?;
    if !album_page(&url) {
        return None;
    }
    let path = url.path();
    if url.host_str() == Some("photos.app.goo.gl") {
        let token = path.strip_prefix('/')?;
        return ((6..=40).contains(&token.len())
            && token.bytes().all(|b| b.is_ascii_alphanumeric()))
        .then(|| format!("https://photos.app.goo.gl{path}"));
    }
    let token = path.strip_prefix("/share/")?;
    let (_, key) = url.query_pairs().find(|(k, _)| k == "key")?;
    (valid_key(token, 10, 200) && valid_key(&key, 4, 200))
        .then(|| format!("https://photos.google.com{path}?key={key}"))
}

#[derive(Debug, serde::Serialize, Deserialize)]
pub struct AlbumPhoto {
    pub url: String,
    pub width: u32,
    pub height: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video: Option<Video>,
}

#[derive(Debug, serde::Serialize, Deserialize)]
pub struct Video {
    pub duration: u32,
}

pub fn album_photos(html: &str) -> Vec<AlbumPhoto> {
    use regex_lite::Regex;
    use std::sync::LazyLock;
    static PHOTO: LazyLock<Result<Regex, regex_lite::Error>> = LazyLock::new(|| {
        Regex::new(
            r#"\["(https://lh3\.googleusercontent\.com/pw/[A-Za-z0-9_-]{20,400})",([0-9]{1,5}),([0-9]{1,5}),"#,
        )
    });
    static VIDEO: LazyLock<Result<Regex, regex_lite::Error>> =
        LazyLock::new(|| Regex::new(r#""76647426":\[([0-9]{1,9}),"#));
    let (Ok(photo), Ok(video)) = (&*PHOTO, &*VIDEO) else {
        return Vec::new();
    };
    let mut matches = photo.captures_iter(html).peekable();
    let mut photos: Vec<AlbumPhoto> = Vec::new();
    while let Some(captures) = matches.next() {
        let Some(m) = captures.get(0) else { continue };
        let Some(url) = captures.get(1).map(|s| s.as_str()) else {
            continue;
        };
        let size = |i| {
            captures
                .get(i)?
                .as_str()
                .parse::<u32>()
                .ok()
                .filter(|n| *n > 0)
        };
        let (Some(width), Some(height)) = (size(2), size(3)) else {
            continue;
        };
        let end = matches
            .peek()
            .and_then(|c| c.get(0))
            .map_or(html.len(), |m| m.start())
            .min(html.floor_char_boundary((m.end() + 2000).min(html.len())));
        let duration = video
            .captures(&html[m.end()..end])
            .and_then(|c| c.get(1)?.as_str().parse::<u32>().ok())
            .map(|ms| Video {
                duration: (ms + 500) / 1000,
            });
        if let Some(known) = photos.iter_mut().find(|p| p.url == url) {
            if known.video.is_none() {
                known.video = duration;
            }
            continue;
        }
        if photos.len() == 40 {
            break;
        }
        photos.push(AlbumPhoto {
            url: url.into(),
            width,
            height,
            video: duration,
        });
    }
    photos
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_shared_google_albums_and_canonicalizes_links() {
        assert_eq!(
            album_link("https://photos.app.goo.gl/TestLink?x=1#photo").as_deref(),
            Some("https://photos.app.goo.gl/TestLink")
        );
        assert_eq!(
            album_link("https://photos.google.com/share/abcdef012345?other=x&key=test").as_deref(),
            Some("https://photos.google.com/share/abcdef012345?key=test")
        );
        for link in [
            "https://example.org/share/abcdef012345?key=test",
            "https://foo@photos.google.com/share/abcdef012345?key=test",
            "https://photos.app.goo.gl:8000/TestLink",
            "http://photos.app.goo.gl/TestLink",
            "https://photos.google.com/share/abcdef012345",
        ] {
            assert!(album_link(link).is_none());
        }
    }

    #[test]
    fn merges_video_fields_from_repeated_posters() {
        let url = "https://lh3.googleusercontent.com/pw/abcdefghijklmnopqrst";
        let page = format!(r#"["{url}",1200,800,["{url}",1200,800,{{"76647426":[12500,"#);
        let photos = album_photos(&page);
        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].url, url);
        assert_eq!(
            photos[0].video.as_ref().map(|video| video.duration),
            Some(13)
        );
    }
}
