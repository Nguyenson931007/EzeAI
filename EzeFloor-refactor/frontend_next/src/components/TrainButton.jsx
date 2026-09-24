import { useState } from "react";
import { BASE_URL, getHeaders } from "@/models/api.service";

export default function TrainButton({ rooms = [] }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function handleTrain() {
    setLoading(true);
    setMsg("");
    setError("");

    try {
      const res = await fetch(`${BASE_URL}/train-floor`, {
        method: "POST",
        headers: getHeaders(),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Train failed");

      setMsg("Training started!");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="ribbon-btn train"
        onClick={handleTrain}
        title={msg || error || "Train unified floor model"}
        disabled={loading}
      >
        <span className="icon">{loading ? "⏳" : "🚀"}</span>
        <span className="label">{loading ? "Running..." : "Train Floor"}</span>
      </button>
      
      {(msg || error) && (
        <div style={{
          position: 'absolute',
          top: -30,
          left: 0,
          whiteSpace: 'nowrap',
          fontSize: 11,
          color: error ? '#f44336' : '#4CAF50',
          fontWeight: 'bold'
        }}>
          {msg || error}
        </div>
      )}
    </div>
  );
}