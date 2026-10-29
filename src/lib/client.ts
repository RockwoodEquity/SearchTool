// fetch wrapper for browser code: a 401 means the sign-in expired, so go back to the login page.
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }
  return res;
}

export interface Me {
  id: number;
  email: string;
  name: string;
}
