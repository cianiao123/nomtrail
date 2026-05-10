// SSE chunk parser for AI streaming responses

export class SSEParser {
  private buffer = "";

  feed(chunk: string): Record<string, any>[] {
    this.buffer += chunk;
    const messages: Record<string, any>[] = [];
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          messages.push(JSON.parse(line.slice(6)));
        } catch {
          // Skip unparseable chunks (partial JSON during streaming)
        }
      }
    }
    return messages;
  }

  reset() {
    this.buffer = "";
  }
}
