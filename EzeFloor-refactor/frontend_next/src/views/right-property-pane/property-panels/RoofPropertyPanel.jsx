import React from "react";
import RoofInspectorCard from "@/components/RoofInspectorCard";

export default function RoofPropertyPanel({
  selectedRoof,
  scaleValue,
  realScale,
  roofProps = {},
  deleteRoof,
  showConfirm = window.confirm,
  setExplorerViewMode
}) {
  if (!selectedRoof) {
    return <div className="panel-hint" style={{ padding: "8px 0" }}>Select a roof to edit properties.</div>;
  }

  return (
    <RoofInspectorCard
      roof={selectedRoof}
      scaleValue={scaleValue}
      realScale={realScale}
      {...roofProps}
      deleteRoof={async (roofId) => {
        if (await showConfirm("Are you sure you want to delete this roof?")) {
          if (deleteRoof) deleteRoof(roofId);
          if (setExplorerViewMode) setExplorerViewMode("tree");
        }
      }}
      isSelected={true}
    />
  );
}
