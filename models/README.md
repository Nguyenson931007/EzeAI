# Runtime AI models

Keep local YOLO weights here; Git ignores `*.pt` files.

Expected runtime layout:

```text
models/
├─ doors/best.pt
├─ roof/best.pt
├─ rooms/best.pt
└─ walls/best.pt
```

The root `.env` should contain:

```env
YOLO_MODELS_DIR=models
```

A separate optional window model may be placed at `models/windows/best.pt`. If it is absent, the current door service falls back to `models/doors/best.pt`, matching the previous behavior.
