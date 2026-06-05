import { useState } from "react";
import { BASE_URL, getHeaders } from "@/models/api.service";

export default function TrainWallButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function handleTrain() {
    setLoading(true);
    setMsg("");
    setError("");

    try {
      const res = await fetch(`${BASE_URL}/add_train_wall_bim`, {
        method: "POST",
        headers: getHeaders(),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Train failed");
      }

      setMsg("✅ Train Wall success!");
      console.log("Train Wall result:", data);

    } catch (err) {
      setError("❌ " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        className="ribbon-btn train"
        onClick={handleTrain}
        title={msg || error || "Bắt đầu huấn luyện AI cho Wall"}
      >
        <span className="icon" style={{ opacity: loading ? 0.5 : 1 }}>
          {loading ? "⏳" : "🚀"}
        </span>
        <span className="label">{loading ? "Running" : "Train Wall"}</span>
      </button>
    </>
  );
}
