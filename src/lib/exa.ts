import Exa from "exa-js";

let client: Exa | null = null;

export function getExaClient(): Exa {
  if (!client) {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) throw new Error("EXA_API_KEY environment variable is not set");
    client = new Exa(apiKey);
  }
  return client;
}
