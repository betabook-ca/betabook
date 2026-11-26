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

macro_rules! inventory {
    ($( $method:ident $path:literal => $handler:path; )*) => { &[$((stringify!($method), $path)),*] };
}
const ROUTES: &[(&str, &str)] = worker_routes!(inventory);

pub(super) struct ApiSpec {
    paths: Value,
    schemas: SchemaGenerator,
}

impl ApiSpec {
    pub fn schema<T: JsonSchema>(&mut self) -> Value {
        self.schemas.subschema_for::<T>().to_value()
    }

    pub fn operation(&mut self, path: &str, method: &str, mut op: Value) {
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

pub fn document(require_complete: bool) -> Result<Value, String> {
    let mut settings = SchemaSettings::draft2020_12();
    settings.definitions_path = "/components/schemas".into();
    let mut api = ApiSpec {
        paths: json!({}),
        schemas: settings.into_generator(),
    };
    actions::register(&mut api);
    core::register(&mut api);
    profiles::register(&mut api);
    let paths = api.paths.as_object().ok_or("missing paths")?;
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
    if !actual.is_subset(&expected) || (require_complete && actual != expected) {
        return Err(format!(
            "HTTP router and specification differ. Missing: {:?}; stale: {:?}",
            expected.difference(&actual).collect::<Vec<_>>(),
            actual.difference(&expected).collect::<Vec<_>>()
        ));
    }
    let definitions: Map<_, _> = api.schemas.take_definitions(false).into_iter().collect();
    Ok(
        json!({"openapi":"3.1.0","info":{"title":"Betabook HTTP API","version":env!("CARGO_PKG_VERSION")},"paths":api.paths,"components":{"schemas":definitions,
        "responses":{"Error":{"description":"The request could not be completed","content":{"application/json":{"schema":{"type":"object","properties":{"error":{"type":"string"},"message":{"type":"string"},"code":{"type":"string"}}}}}}},
        "securitySchemes":{"session":{"type":"apiKey","in":"cookie","name":"__Secure-better-auth.session_token"}}}}),
    )
}
