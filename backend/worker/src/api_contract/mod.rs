//! Native-only OpenAPI generator. Schema generation is excluded from the release WASM.
#![expect(
    clippy::expect_used,
    reason = "generator structure is validated during export"
)]

use schemars::{JsonSchema, SchemaGenerator, generate::SchemaSettings};
use serde_json::{Map, Value, json};
use std::collections::BTreeSet;

mod actions;
mod core;
mod profiles;
mod progress;

macro_rules! inventory {
    ($( $method:ident $path:literal => $handler:path; )*) => { &[$((stringify!($method), $path)),*] };
}
const ROUTES: &[(&str, &str)] = worker_routes!(inventory);

pub(super) struct ApiSpec {
    paths: Value,
    schemas: SchemaGenerator,
    inputs: SchemaGenerator,
}

impl ApiSpec {
    pub fn schema<T: JsonSchema>(&mut self) -> Value {
        self.schemas.subschema_for::<T>().to_value()
    }

    pub fn input_schema<T: JsonSchema>(&mut self) -> Value {
        input_refs(self.inputs.subschema_for::<T>().to_value())
    }

    pub fn operation(&mut self, path: &str, method: &str, mut op: Value) {
        if op.get("security").is_none() {
            let optional = path == "/api/auth/get-session"
                || path == "/api/terms/status"
                || path == "/api/pages/users/{id}"
                || [
                    "/api/pages/lists/",
                    "/api/pages/trips/",
                    "/api/pages/projects/",
                ]
                .iter()
                .any(|prefix| path.starts_with(prefix));
            let public = path.starts_with("/api/public/")
                || path.starts_with("/api/avatars/")
                || (path.starts_with("/api/auth/") && path != "/api/auth/delete-user")
                || matches!(
                    path,
                    "/api/health"
                        | "/api/config/auth"
                        | "/api/client-errors"
                        | "/api/actions/submitContactMessage"
                );
            op["security"] = if optional {
                json!([{},{"session":[]}])
            } else if public {
                json!([])
            } else {
                json!([{"session":[]}])
            };
        }
        let parameters = op
            .as_object_mut()
            .expect("operation object")
            .entry("parameters")
            .or_insert_with(|| json!([]))
            .as_array_mut()
            .expect("parameter list");
        for segment in path.split('/') {
            if let Some(name) = segment.strip_prefix('{').and_then(|s| s.strip_suffix('}'))
                && !parameters
                    .iter()
                    .any(|p| p["in"] == "path" && p["name"] == name)
            {
                parameters.push(
                    json!({"in":"path","name":name,"required":true,"schema":{"type":"string"}}),
                );
            }
        }
        assert!(
            self.paths[path][method].is_null(),
            "duplicate {method} {path}"
        );
        self.paths[path][method] = op;
    }

    pub fn get(&mut self, path: &str, id: &str, response: Value) {
        self.operation(path,"get",json!({"operationId":id,"responses":{"200":{"description":"Success","content":{"application/json":{"schema":response}}},"default":{"$ref":"#/components/responses/Error"}}}));
    }

    pub fn post(&mut self, path: &str, id: &str, body: Value, response: Value) {
        self.operation(path,"post",json!({"operationId":id,"requestBody":{"required":true,"content":{"application/json":{"schema":body}}},"responses":{"200":{"description":"Success","content":{"application/json":{"schema":response}}},"default":{"$ref":"#/components/responses/Error"}}}));
    }

    pub fn query(&mut self, path: &str, method: &str, name: &str, schema: Value, required: bool) {
        self.paths[path][method]["parameters"]
            .as_array_mut()
            .expect("operation must be registered first")
            .push(json!({"in":"query","name":name,"schema":schema,"required":required}));
    }
}

fn input_refs(mut schema: Value) -> Value {
    fn visit(node: &mut Value) {
        match node {
            Value::Object(object) => {
                if let Some(reference) = object.get_mut("$ref")
                    && let Some(name) = reference
                        .as_str()
                        .and_then(|r| r.strip_prefix("#/components/schemas/"))
                {
                    *reference = Value::String(format!("#/components/schemas/Input_{name}"));
                }
                for child in object.values_mut() {
                    visit(child);
                }
            }
            Value::Array(items) => {
                for item in items {
                    visit(item);
                }
            }
            _ => {}
        }
    }
    visit(&mut schema);
    schema
}

fn normalize_refs(value: &mut Value) {
    match value {
        Value::Object(object) => {
            if object.len() > 1
                && let Some(reference) = object.remove("$ref")
            {
                object
                    .entry("allOf")
                    .or_insert_with(|| json!([]))
                    .as_array_mut()
                    .expect("allOf array")
                    .push(json!({"$ref":reference}));
            }
            for child in object.values_mut() {
                normalize_refs(child);
            }
        }
        Value::Array(values) => {
            for child in values {
                normalize_refs(child);
            }
        }
        _ => {}
    }
}

pub fn document() -> Result<Value, String> {
    let mut settings = SchemaSettings::draft2020_12();
    settings.definitions_path = "/components/schemas".into();
    let inputs = settings.clone().into_generator();
    settings.contract = schemars::generate::Contract::Serialize;
    let mut api = ApiSpec {
        inputs,
        paths: json!({}),
        schemas: settings.into_generator(),
    };
    actions::register(&mut api);
    core::register(&mut api);
    profiles::register(&mut api);
    progress::register(&mut api);
    let paths = api.paths.as_object().ok_or("missing paths")?;
    let mut ids = BTreeSet::new();
    for (path, methods) in paths {
        for (method, op) in methods.as_object().ok_or("path item must be an object")? {
            let id = op["operationId"]
                .as_str()
                .ok_or_else(|| format!("missing operationId on {method} {path}"))?;
            if !ids.insert(id) {
                return Err(format!("duplicate operationId {id}"));
            }
        }
    }
    let mut expected = BTreeSet::new();
    for &(method, raw) in ROUTES
        .iter()
        .filter(|(_, p)| p.starts_with("/api/") && *p != "/api/actions/{name}")
    {
        expected.insert((raw.replace("{*", "{"), method));
    }
    let actual: BTreeSet<_> = paths
        .iter()
        .filter(|(path, _)| !path.starts_with("/api/actions/"))
        .flat_map(|(p, ops)| {
            ["get", "post"]
                .into_iter()
                .filter(|method| !ops[method].is_null())
                .map(|m| (p.clone(), m))
        })
        .collect();
    if actual != expected {
        return Err(format!(
            "HTTP router and specification differ. Missing: {:?}; stale: {:?}",
            expected.difference(&actual).collect::<Vec<_>>(),
            actual.difference(&expected).collect::<Vec<_>>()
        ));
    }
    let mut definitions: Map<_, _> = api.schemas.take_definitions(false).into_iter().collect();
    for (name, schema) in api.inputs.take_definitions(false) {
        definitions.insert(format!("Input_{name}"), input_refs(schema));
    }
    let mut doc = json!({"openapi":"3.1.0","info":{"title":"Betabook HTTP API","version":env!("CARGO_PKG_VERSION")},"paths":api.paths,"components":{"schemas":definitions,
        "responses":{"Error":{"description":"The request could not be completed","content":{"application/json":{"schema":{"type":"object","required":["error"],"properties":{"error":{"type":"string"},"message":{"type":"string"},"code":{"type":"string"}}}}}}},
        "securitySchemes":{"session":{"type":"apiKey","in":"cookie","name":"__Secure-better-auth.session_token","description":"Signed session cookie; local HTTP uses the unprefixed better-auth.session_token."}}}});
    normalize_refs(&mut doc);
    Ok(doc)
}
