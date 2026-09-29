# EzeFloor OpenAI Agent

The support agent uses direct OpenAI Responses API with **GPT-5.6 Luna only**.

Required environment:

```env
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-5.6-luna
OPENAI_TIMEOUT_SEC=180
OPENAI_AGENT_TIMEOUT_SEC=180
```

YOLO/local geometry remains the primary source. The GPT layer reviews ambiguous evidence and proposes actions; it does not directly mutate the database.
