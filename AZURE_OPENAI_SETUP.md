# EzeFloor Azure OpenAI

The support AI now calls Azure OpenAI Chat Completions instead of api.openai.com.

Required root `.env` values:

```env
AZURE_OPENAI_ENDPOINT=https://gpt-ai-integration.openai.azure.com
AZURE_OPENAI_API_KEY=<your Azure OpenAI key>
AZURE_OPENAI_DEPLOYMENT=gpt-4o-Power-Automate-integration
AZURE_OPENAI_API_VERSION=2025-01-01-preview
AZURE_OPENAI_WALL_TIMEOUT_SEC=180
AZURE_OPENAI_AGENT_TIMEOUT_SEC=180
AZURE_OPENAI_WALL_MAX_RAW_CANDIDATES=450
```

YOLO/local AI remains the primary wall detector. Azure GPT-4o is the review/support layer.
