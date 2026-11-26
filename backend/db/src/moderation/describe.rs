use super::Change;
use betabook_domain::grades::{ClimbType, format_grade};
use betabook_domain::slug::{area_href, climb_href};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Description {
    pub summary: String,
    pub requester_summary: String,
    pub details: Vec<String>,
    pub href: String,
}

fn excerpt(text: Option<&str>) -> String {
    let Some(text) = text.filter(|s| !s.is_empty()) else {
        return "(empty)".into();
    };
    if text.chars().count() > 80 {
        format!("{}…", text.chars().take(80).collect::<String>())
    } else {
        text.to_owned()
    }
}

impl Description {
    pub fn for_change(c: &Change) -> Self {
        let f = &c.facts;
        let p = &c.payload;
        let name = f.name.as_deref().unwrap_or("?");
        let destination = f.destination_name.as_deref().unwrap_or("?");
        let mut details = Vec::new();
        let new_name = p["name"].as_str();
        if let Some(n) = new_name {
            details.push(format!("Name: \"{name}\" → \"{n}\""));
        }
        let label = |t: Option<&str>, g: Option<i64>| {
            t.and_then(ClimbType::parse)
                .map_or("?", |t| format_grade(t, g, Default::default()))
        };
        let summary = match c.kind.as_str() {
            "area_edit" | "climb_edit" => {
                if let Some(t) = p["type"].as_str() {
                    details.push(format!(
                        "Discipline: {} → {t}",
                        f.discipline.as_deref().unwrap_or("?")
                    ));
                }
                if let Some(g) = p["grade"].as_i64() {
                    details.push(format!(
                        "Grade: {} → {}",
                        label(f.discipline.as_deref(), f.grade),
                        label(p["type"].as_str().or(f.discipline.as_deref()), Some(g))
                    ));
                }
                new_name.map_or_else(
                    || format!("Edit \"{name}\""),
                    |n| format!("Rename \"{name}\" to \"{n}\""),
                )
            }
            "area_delete" | "climb_delete" => format!("Delete \"{name}\""),
            "area_reparent" => {
                details.push(format!(
                    "Parent: \"{}\" → \"{destination}\"",
                    f.parent_name.as_deref().unwrap_or("(top level)")
                ));
                format!("Move \"{name}\" under \"{destination}\"")
            }
            "climb_move" => {
                details.push(format!(
                    "Area: \"{}\" → \"{destination}\"",
                    f.area_name.as_deref().unwrap_or("?")
                ));
                format!("Move \"{name}\" to \"{destination}\"")
            }
            "climb_merge" => {
                let o = &p["overrides"];
                details.push(format!(
                    "{} send(s) move to \"{destination}\"",
                    f.send_count
                ));
                if let Some(n) = o["name"].as_str() {
                    details.push(format!("Name: \"{destination}\" → \"{n}\""));
                }
                if let Some(g) = o["grade"].as_i64() {
                    details.push(format!(
                        "Grade: {} → {}",
                        label(f.destination_type.as_deref(), f.destination_grade),
                        label(f.destination_type.as_deref(), Some(g))
                    ));
                }
                if let Some(v) = o.get("description") {
                    details.push(format!(
                        "Description: {} → {}",
                        excerpt(f.destination_description.as_deref()),
                        excerpt(v.as_str())
                    ));
                }
                format!("Merge \"{name}\" into \"{destination}\"")
            }
            "climb_break" => {
                let field = |s: &str| p[s].as_str().unwrap_or("?");
                let date = field("brokenOn");
                let sends = p["laterSends"].as_i64().unwrap_or_default();
                let entries = p["laterEntries"].as_i64().unwrap_or_default();
                details.extend([format!("Broke on: {date}"),format!("Reason: {}",field("reason")),format!("New climb: \"{}\" at {}",field("successorName"),label(f.discipline.as_deref(),f.grade)),
     if sends+entries>0{format!("Moves {sends} send(s) and {entries} journal {} dated on or after {date} to the new climb (counted when reported)",if entries==1{"entry"}else{"entries"})}else{format!("Nothing dated on or after {date} to move (counted when reported)")},
     format!("Description of \"{name}\" becomes: {}",field("appendedDescription")),format!("Description of the new climb: {}",field("successorDescription"))]);
                format!("Mark \"{name}\" as broken on {date}")
            }
            _ => c.kind.clone(),
        };
        let requester_summary = match c.kind.as_str() {
            "climb_merge" => format!("Mark \"{name}\" as a duplicate of \"{destination}\""),
            "climb_break" => format!(
                "Report \"{name}\" as broken on {}",
                p["brokenOn"].as_str().unwrap_or("?")
            ),
            _ => summary.clone(),
        };
        let href = if c.kind.starts_with("area_") {
            area_href(c.id, name)
        } else {
            climb_href(c.id, name)
        };
        Self {
            summary,
            requester_summary,
            details,
            href,
        }
    }
}
