use axum::{Json, extract::State};
use serde_json::{Map, Value, json};
use time::{Date, Duration, OffsetDateTime};
use worker::{Cache, Fetch, Headers, Method, Request, RequestInit, Response, web_sys};

use crate::state::{ApiError, AppState};

fn usage_query(account: &str, first: Date, through: Date) -> (Value, usize) {
    let mut variables = Map::from_iter([("accountTag".to_owned(), json!(account))]);
    let mut declarations = "$accountTag: string!".to_owned();
    let mut fields = String::new();
    let mut from = first;
    let mut i = 0;
    while from < through {
        let to = (from + Duration::days(7)).min(through);
        declarations.push_str(&format!(
            ", $start{i}: string!, $end{i}: string!, $startDate{i}: Date!, $endDate{i}: Date!"
        ));
        fields.push_str(&format!(" workers{i}: workersInvocationsAdaptive(limit:1,filter:{{datetime_geq:$start{i},datetime_lt:$end{i}}}){{sum{{requests cpuTimeUs}}}} d1{i}: d1AnalyticsAdaptiveGroups(limit:1,filter:{{date_geq:$startDate{i},date_lt:$endDate{i}}}){{sum{{rowsRead}}}}"));
        variables.insert(format!("start{i}"), json!(format!("{from}T00:00:00Z")));
        variables.insert(format!("end{i}"), json!(format!("{to}T00:00:00Z")));
        variables.insert(format!("startDate{i}"), json!(from.to_string()));
        variables.insert(format!("endDate{i}"), json!(to.to_string()));
        from = to;
        i += 1;
    }
    (
        json!({"query":format!("query Usage({declarations}) {{ viewer {{ accounts(filter: {{ accountTag: $accountTag }}) {{ {fields} }} }} }}"),"variables":variables}),
        i,
    )
}

async fn load(account: &str, token: &str, first: Date, end: Date, through: Date) -> Option<Value> {
    let (query, windows) = usage_query(account, first, through);
    let h = Headers::new();
    h.set("Content-Type", "application/json").ok()?;
    h.set("Authorization", &format!("Bearer {token}")).ok()?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(h)
        .with_body(Some(query.to_string().into()));
    let req = Request::new_with_init("https://api.cloudflare.com/client/v4/graphql", &init).ok()?;
    let mut resp = Fetch::Request(req)
        .send_with_signal(&web_sys::AbortSignal::timeout_with_u32(10_000).into())
        .await
        .ok()?;
    if !(200..300).contains(&resp.status_code()) {
        return None;
    }
    let body: Value = resp.json().await.ok()?;
    if body["errors"].as_array().is_some_and(|a| !a.is_empty()) {
        return None;
    }
    let data = body.pointer("/data/viewer/accounts/0")?.as_object()?;
    let sum = |prefix: &str, field: &str| -> f64 {
        (0..windows)
            .filter_map(|i| data.get(&format!("{prefix}{i}"))?[0]["sum"][field].as_f64())
            .sum()
    };
    Some(
        json!({"periodStart":first.to_string(),"periodEnd":end.to_string(),"workerRequests":sum("workers","requests"),"workerCpuMs":sum("workers","cpuTimeUs")/1000.0,"d1RowsRead":sum("d1","rowsRead")}),
    )
}

#[worker::send]
pub async fn usage(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let (Some(account), Some(token)) = (
        state.env_var("CLOUDFLARE_USAGE_ACCOUNT_ID"),
        state.env_var("CLOUDFLARE_USAGE_API_TOKEN"),
    ) else {
        return Ok(Json(Value::Null));
    };
    let today = OffsetDateTime::from_unix_timestamp(state.now_ms() / 1000)
        .map_err(ApiError::internal)?
        .date();
    let first = today.replace_day(1).map_err(ApiError::internal)?;
    let end = (first + Duration::days(32))
        .replace_day(1)
        .map_err(ApiError::internal)?;
    let key = format!("https://betabook.ca/__cloudflare-usage/{first}");
    let cache = Cache::open("cloudflare-usage".into()).await;
    if let Ok(Some(mut cached)) = cache.get(&key, true).await
        && let Ok(value) = cached.json().await
    {
        return Ok(Json(value));
    }
    let usage = load(
        &account,
        &token,
        first,
        end,
        (today + Duration::DAY).min(end),
    )
    .await;
    let ttl = if usage.is_some() { 3600 } else { 300 };
    let value = usage.unwrap_or(Value::Null);
    if let Ok(mut response) = Response::from_json(&value) {
        response
            .headers_mut()
            .set("cache-control", &format!("max-age={ttl}"))?;
        state.ctx().wait_until(async move {
            let _ = cache.put(&key, response).await;
        });
    }
    Ok(Json(value))
}
