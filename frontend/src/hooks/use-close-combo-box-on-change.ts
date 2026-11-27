import { useContext, useEffect, useRef } from "react";
import { ComboBoxStateContext } from "react-aria-components";

/** The enclosing ComboBox's state, closing its menu whenever `scope` changes
 * (compared by its JSON form, so a fresh array with the same items is no
 * change). Call it from a component rendered inside the ComboBox. */
export function useCloseComboBoxOnChange(scope: unknown) {
  const state = useContext(ComboBoxStateContext);
  const fingerprint = JSON.stringify(scope);
  const previous = useRef(fingerprint);
  useEffect(() => {
    if (previous.current !== fingerprint) {
      previous.current = fingerprint;
      state?.close();
    }
  }, [fingerprint, state]);
  return state;
}
