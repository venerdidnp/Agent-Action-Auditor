"use client";

import { FormEvent, useState } from "react";
import { sendChat } from "@/lib/api";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || isLoading) return;

    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setIsLoading(true);

    try {
      const response = await sendChat(message);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.reply },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col px-4">
      <header className="border-b border-neutral-200 py-4 dark:border-neutral-800">
        <h1 className="text-xl font-semibold">Agent Action Auditor</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Chat with a supervised AI agent
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {messages.length === 0 && (
          <p className="py-16 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Send a message to start the conversation.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-white"
                : "mr-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-2 dark:bg-neutral-800"
            }
          >
            {message.content}
          </div>
        ))}
        {isLoading && (
          <div className="mr-auto w-fit rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-2 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            Thinking…
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-neutral-200 py-4 dark:border-neutral-800">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type a message…"
          disabled={isLoading}
          className="flex-1 rounded-full border border-neutral-300 bg-transparent px-4 py-2 outline-none focus:border-blue-500 disabled:opacity-50 dark:border-neutral-700"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-full bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}
