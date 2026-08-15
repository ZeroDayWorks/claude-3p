# Model Routing Diagram

LiteLLM proxy routes model name หลักและ alias เดิมไปที่ Ollama Cloud ผ่าน OpenAI-compatible API

https://github.com/aws-solutions-library-samples/guidance-for-claude-code-with-amazon-bedrock/blob/main/assets/docs/COWORK_3P.md

https://github.com/farion1231/cc-switch/issues/3136

```mermaid
flowchart LR
    subgraph primary["Primary Model Names"]
        glm["glm-5.2"]
        deepseek["deepseek-v4-pro"]
        kimi["kimi-k2.7-code"]
    end

    subgraph aliases["Backward-Compatible Aliases"]
        sonnet["sonnet / claude-sonnet-4-5 / anthropic/claude-sonnet-4-5"]
        opus["opus / mythos"]
        haiku["haiku / fable"]
    end

    subgraph ollama["Ollama Cloud (https://ollama.com/v1)"]
        glm_target["openai/glm-5.2:cloud"]
        deepseek_target["openai/deepseek-v4-pro:cloud"]
        kimi_target["openai/kimi-k2.7-code:cloud"]
    end

    glm --> glm_target
    deepseek --> deepseek_target
    kimi --> kimi_target
    sonnet --> kimi_target
    opus --> deepseek_target
    haiku --> glm_target
```
