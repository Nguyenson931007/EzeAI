import React from "react";
import NameField from "./NameField";

/**
 * WindowNameField — Shared label/name input for windows.
 *
 * Used by: WindowEditDialog (W1) + WindowTask table (W2) + DoorWindowPropertyPanel (W3).
 * Thin wrapper around NameField with window-specific defaults.
 */
export default function WindowNameField(props) {
  return (
    <NameField
      label="Label"
      placeholder="e.g. W-01, Kitchen Window"
      {...props}
    />
  );
}
