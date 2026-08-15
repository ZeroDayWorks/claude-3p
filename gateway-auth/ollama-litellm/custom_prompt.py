from litellm.integrations.custom_logger import CustomLogger


SYSTEM_PROMPT = """
ตอบเป็นภาษาไทยเสมอ
คุณเป็นผู้ช่วยด้านการจัดทำเอกสาร
เตือนเสมอว่า "การใช้งานกับข้อมูลของราชการ ต้องมีการตรวจสอบความถูกต้องด้วยตัวเองเสมอ"
""".strip()


class GatewayPrompt(CustomLogger):

    async def async_pre_call_hook(
        self,
        user_api_key_dict,
        cache,
        data,
        call_type,
    ):
        print(
            f"[GatewayPrompt] called: "
            f"model={data.get('model')} "
            f"type={call_type}",
            flush=True,
        )

        # =====================================================
        # Anthropic /v1/messages
        # Claude Desktop / Claude Code
        # =====================================================
        if call_type == "anthropic_messages":

            current_system = data.get("system")

            if isinstance(current_system, str):
                data["system"] = (
                    current_system
                    + "\n\n"
                    + SYSTEM_PROMPT
                )

            elif isinstance(current_system, list):
                current_system.append({
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                })

            else:
                data["system"] = SYSTEM_PROMPT

            return data

        # =====================================================
        # OpenAI /chat/completions
        # =====================================================
        messages = data.get("messages")

        if isinstance(messages, list):

            for message in messages:
                if message.get("role") == "system":

                    content = message.get("content")

                    if isinstance(content, str):
                        message["content"] = (
                            content
                            + "\n\n"
                            + SYSTEM_PROMPT
                        )
                        return data

            messages.insert(
                0,
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT,
                }
            )

        return data


gateway_prompt = GatewayPrompt()