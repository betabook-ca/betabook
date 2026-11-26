use betabook_domain::trips::{AlbumPhoto, album_link, album_page, album_photos};
use futures_util::StreamExt;
use url::Url;
use worker::{Cache, Fetch, Headers, Request, RequestInit, RequestRedirect, Response, web_sys};

async fn fetch_photos(link: &str) -> Option<Vec<AlbumPhoto>> {
    let mut url = Url::parse(link).ok()?;
    let signal = web_sys::AbortSignal::timeout_with_u32(4000).into();
    for _ in 0..3 {
        if !album_page(&url) {
            return None;
        }
        let headers = Headers::new();
        headers.set("Accept", "text/html").ok()?;
        headers.set("Accept-Language", "en").ok()?;
        let mut init = RequestInit::new();
        init.with_headers(headers)
            .with_redirect(RequestRedirect::Manual);
        let req = Request::new_with_init(url.as_str(), &init).ok()?;
        let mut resp = Fetch::Request(req).send_with_signal(&signal).await.ok()?;
        if (300..400).contains(&resp.status_code()) {
            url = url.join(&resp.headers().get("Location").ok()??).ok()?;
            continue;
        }
        if !(200..300).contains(&resp.status_code())
            || !resp
                .headers()
                .get("Content-Type")
                .ok()??
                .starts_with("text/html")
        {
            return None;
        }
        let mut stream = resp.stream().ok()?;
        let mut bytes = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.ok()?;
            if bytes.len() + chunk.len() > 4 * 1024 * 1024 {
                return None;
            }
            bytes.extend_from_slice(&chunk);
        }
        return Some(album_photos(&String::from_utf8_lossy(&bytes)));
    }
    None
}

pub async fn load(raw: Option<&str>) -> Vec<AlbumPhoto> {
    let Some(link) = raw.and_then(album_link) else {
        return Vec::new();
    };
    let key = format!(
        "https://trip-albums.invalid/{}",
        url::form_urlencoded::byte_serialize(link.as_bytes()).collect::<String>()
    );
    let cache = Cache::open("trip-albums".into()).await;
    if let Ok(Some(mut cached)) = cache.get(&key, true).await
        && let Ok(photos) = cached.json().await
    {
        return photos;
    }
    let photos = fetch_photos(&link).await.unwrap_or_default();
    if let Ok(mut response) = Response::from_json(&photos) {
        let policy = if photos.is_empty() {
            "public, max-age=300"
        } else {
            "public, max-age=3600"
        };
        if response.headers_mut().set("Cache-Control", policy).is_ok() {
            let _ = cache.put(&key, response).await;
        }
    }
    photos
}
