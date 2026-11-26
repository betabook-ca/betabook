use betabook_db::DbError;
use worker::js_sys::{
    self, Array, Date, Function,
    Intl::{
        DateTimeFormat, DateTimeFormatOptions, DateTimeFormatPart, DateTimeFormatPartType,
        DayFormat, MonthFormat, YearFormat,
    },
    Reflect,
};
use worker::wasm_bindgen::{JsCast, JsValue};

/// Resolve one instant in the goal's IANA timezone using the Worker's ICU data.
pub(crate) fn today(timezone: &str, now_ms: i64) -> Result<String, DbError> {
    let invalid_zone = || DbError::Query("Invalid timezone".to_owned());
    let options = DateTimeFormatOptions::new();
    options.set_time_zone(timezone);
    options.set_year(YearFormat::Numeric);
    options.set_month(MonthFormat::TwoDigit);
    options.set_day(DayFormat::TwoDigit);

    // The typed js-sys constructor does not catch the RangeError for an
    // unrecognized user-supplied timezone. Reflect::construct does.
    let intl = Reflect::get(&js_sys::global(), &"Intl".into()).map_err(|_| invalid_zone())?;
    let constructor: Function = Reflect::get(&intl, &"DateTimeFormat".into())
        .map_err(|_| invalid_zone())?
        .dyn_into()
        .map_err(|_| invalid_zone())?;
    let formatter: DateTimeFormat =
        Reflect::construct(&constructor, &Array::of2(&"en-CA".into(), &options))
            .map_err(|_| invalid_zone())?
            .unchecked_into();
    let parts = formatter.format_to_parts(&Date::new(&JsValue::from_f64(now_ms as f64)));
    let mut date = [String::new(), String::new(), String::new()];
    for part in parts {
        let part: DateTimeFormatPart = part.unchecked_into();
        let index = match part.type_() {
            DateTimeFormatPartType::Year => 0,
            DateTimeFormatPartType::Month => 1,
            DateTimeFormatPartType::Day => 2,
            _ => continue,
        };
        date[index] = part.value().into();
    }
    Ok(date.join("-"))
}
