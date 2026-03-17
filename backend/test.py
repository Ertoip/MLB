from llama_cpp import Llama

llm = Llama.from_pretrained(
    repo_id="mlabonne/gemma-2b-it-GGUF",
    filename="*.Q4_K_M.gguf",
    chat_format="gemma",
    verbose=False,
    n_ctx=2048,
)

messages = [
    {
        "role": "user",
        "content": "From now on your name is Ladybug and you must always reply in a cheerful and enthusiastic tone.",
    },
    {
        "role": "assistant",
        "content": "Sure! I'm Ladybug, and I'm always happy to chat with you!",
    },
]

print("Start chatting with Ladybug! (type 'quit' or 'exit' to stop)\n")

while True:
    user_input = input("You: ").strip()

    if user_input.lower() in ("quit", "exit"):
        print("Ladybug: Bye bye! 🐞")
        break

    if not user_input:
        continue

    messages.append({"role": "user", "content": user_input})

    print("Ladybug: ", end="", flush=True)

    stream = llm.create_chat_completion(
        messages=messages,
        max_tokens=1024,
        temperature=0.8,
        stream=True,
    )

    full_response = ""
    for chunk in stream:
        delta = chunk["choices"][0].get("delta", {})
        content = delta.get("content", "")
        if content:
            print(content, end="", flush=True)
            full_response += content

    print("\n")
    messages.append({"role": "assistant", "content": full_response})